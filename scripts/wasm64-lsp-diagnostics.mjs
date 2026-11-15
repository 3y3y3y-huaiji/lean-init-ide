// wasm64 LSP 诊断链路验证。
//
// 用法：node scripts/wasm64-lsp-diagnostics.mjs <lean.mjs> <libDir> [importModule] [server|worker]
//
// server：`-j2 --server` 走 watchdog，只验证到 didOpen（wasm 里 Process.spawn 不可用，watchdog 会 forceExit）。
// worker：`-j2 --worker <uri>` 直接起文件 worker，和 SDK 在浏览器里的做法一致（用宿主进程替代子进程），
//         能真正拿到 publishDiagnostics。
//
// 两种模式都断言：Bad.lean 有类型不匹配诊断，Good.lean 干净（同时证明 import 的 olean 真的加载成功）。
import { Worker } from 'node:worker_threads';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const [leanMjs, libDir, moduleName = '', mode = 'server'] = process.argv.slice(2);
if (!leanMjs || !libDir || !['server', 'worker'].includes(mode)) {
  console.error('usage: node wasm64-lsp-diagnostics.mjs <lean.mjs> <libDir> [importModule] [server|worker]');
  process.exit(2);
}

// watchdogMain 解析 /etc/localtime，合成数据会被 forceExit，直接用宿主时区文件。
// 没有 tzdata（比如本地 Windows）时退回 SDK 内置的 123 字节 UTC TZif。
const FALLBACK_TZIF = [
  84, 90, 105, 102, 50, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 4, 0, 0, 0, 0, 0, 0, 85, 84, 67, 0, 84, 90, 105, 102,
  50, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 4, 0, 0, 0, 0, 0, 0, 85, 84, 67, 0, 10, 85, 84, 67, 48, 10,
];
let timezone = null;
for (const candidate of [
  process.env.LEAN_WASM_TZ,
  '/usr/share/zoneinfo/UTC',
  '/usr/share/zoneinfo/Etc/UTC',
].filter(Boolean)) {
  try {
    timezone = readFileSync(candidate);
    break;
  } catch {
    // 换下一个候选。
  }
}
if (!timezone) {
  timezone = Buffer.from(FALLBACK_TZIF);
  console.error('[diag] 没有系统 tzdata，使用内置 UTC TZif');
}

const HEADER_END = Buffer.from('\r\n\r\n');
// 与 SDK 的 LeanStdin 一致：16 字节控制区 + 环形负载。
const RING_BYTES = 8 * 1024 * 1024 + 8192;

const importLine = moduleName ? `import ${moduleName}\n` : '';
// import 行占掉第 0 行，示例在第 1 行；nudge 的 hover 位置要落在示例上。
const exampleLine = moduleName ? 1 : 0;
const documents = {
  'Bad.lean': `${importLine}example : 1 + 1 = 3 := rfl\n`,
  'Good.lean': `${importLine}example : 1 + 1 = 2 := rfl\n`,
};

const initializeParams = {
  processId: null,
  rootUri: 'file:///workspace',
  workspaceFolders: null,
  capabilities: { textDocument: { publishDiagnostics: {}, synchronization: {} } },
};

/**
 * 一个 wasm 实例 + 一套 LSP 帧通道。
 * stdin 走共享环形缓冲（glue 由 adapt-glue.mjs 打了 fd0 补丁），不再用 Module.stdin 钩子。
 */
const createSession = (args, files) => {
  // adapted-proxy 是 -sPROXY_TO_PTHREAD=1 变体：callMain 只派发，不阻塞。
  const proxy = /adapted-proxy/.test(leanMjs);
  const ring = new SharedArrayBuffer(16 + RING_BYTES);
  const ctrl = new Int32Array(ring, 0, 4);
  const ringBytes = new Uint8Array(ring, 16);
  const range = Math.floor(2 ** 32 / RING_BYTES) * RING_BYTES;
  const worker = new Worker(new URL('./wasm64-lsp-worker.mjs', import.meta.url), {
    workerData: {
      leanMjs: resolve(leanMjs),
      libDir: resolve(libDir),
      files,
      args,
      timezone,
      proxy,
      stdin: { buffer: ring, capacity: RING_BYTES },
    },
  });

  const waiters = [];
  let inbox = Buffer.alloc(0);
  let exited = false;
  let exitCode;

  const waitFor = (match, label, timeoutMs) =>
    new Promise((resolveWait, rejectWait) => {
      const waiter = { match, resolve: resolveWait };
      waiter.timer = setTimeout(() => {
        const index = waiters.indexOf(waiter);
        if (index !== -1) waiters.splice(index, 1);
        rejectWait(new Error(`等待 ${label} 超时（${timeoutMs}ms）`));
      }, timeoutMs);
      waiters.push(waiter);
    });

  const dispatch = (message) => {
    for (let i = 0; i < waiters.length; i += 1) {
      if (waiters[i].match(message)) {
        const [waiter] = waiters.splice(i, 1);
        clearTimeout(waiter.timer);
        waiter.resolve(message);
        return;
      }
    }
  };

  const drain = () => {
    for (;;) {
      const headerEnd = inbox.indexOf(HEADER_END);
      if (headerEnd === -1) return;
      const header = inbox.subarray(0, headerEnd).toString('latin1');
      const lengthMatch = /Content-Length:\s*(\d+)/i.exec(header);
      if (!lengthMatch) {
        inbox = inbox.subarray(headerEnd + HEADER_END.length);
        continue;
      }
      const bodyEnd = headerEnd + HEADER_END.length + Number(lengthMatch[1]);
      if (inbox.length < bodyEnd) return;
      const body = inbox.subarray(headerEnd + HEADER_END.length, bodyEnd).toString('utf8');
      inbox = inbox.subarray(bodyEnd);
      try {
        dispatch(JSON.parse(body));
      } catch {
        console.error(`[diag] 无法解析的帧: ${body.slice(0, 200)}`);
      }
    }
  };

  worker.on('message', (message) => {
    if (message.debug) {
      process.stderr.write(`[debug] ${message.debug}\n`);
    } else if (message.stdout) {
      inbox = Buffer.concat([inbox, Buffer.from(message.stdout)]);
      drain();
    } else if (message.stderr) {
      process.stderr.write(`[lean] ${message.stderr}`);
    } else if (message.failure) {
      console.error(`[worker] ${message.failure}`);
    } else if (message.exit !== undefined) {
      exitCode = message.exit;
    }
  });
  worker.on('exit', () => {
    exited = true;
  });
  worker.on('error', (error) => console.error(`[worker] ${error.stack ?? error}`));

  // 按 SDK 的 LeanStdin 语义写环形缓冲：ctrl[0]=write、ctrl[1]=read、ctrl[2]=closed。
  const sendFrame = async (message) => {
    const body = JSON.stringify(message);
    const frame = Buffer.from(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`, 'utf8');
    const write = Atomics.load(ctrl, 0) >>> 0;
    const read = Atomics.load(ctrl, 1) >>> 0;
    const used = (write - read + range) % range;
    if (frame.length > RING_BYTES - used) throw new Error(`stdin 环形缓冲已满: ${frame.length}`);
    const offset = write % RING_BYTES;
    const first = Math.min(frame.length, RING_BYTES - offset);
    ringBytes.set(frame.subarray(0, first), offset);
    ringBytes.set(frame.subarray(first), 0);
    Atomics.store(ctrl, 0, (write + frame.length) % range);
    Atomics.notify(ctrl, 0);
    if (process.env.LEAN_WASM_DIAG_DEBUG) console.error(`[debug] sent ${frame.length} bytes`);
  };

  const closeStdin = async () => {
    Atomics.store(ctrl, 2, 1);
    Atomics.notify(ctrl, 0);
  };

  const dispose = async () => {
    // proxy 模式下 main 在 pthread 上，送 EOF 没必要，直接收掉整个 worker。
    if (!proxy) await closeStdin();
    if (exited) return;
    await new Promise((resolveExit) => {
      const timer = setTimeout(resolveExit, 10_000);
      worker.once('exit', () => {
        clearTimeout(timer);
        resolveExit();
      });
      worker.terminate().catch(() => resolveExit());
    });
  };

  return { sendFrame, waitFor, dispose, status: () => ({ exited, exitCode }) };
};

const isPublishFor = (uri) => (message) =>
  message.method === 'textDocument/publishDiagnostics' && String(message.params?.uri ?? '').endsWith(uri);

const describe = (diagnostic) => {
  const range = diagnostic.range?.start ?? {};
  const severity = { 1: 'error', 2: 'warning', 3: 'info', 4: 'hint' }[diagnostic.severity] ?? '?';
  const text = String(diagnostic.message ?? '').replace(/\s+/g, ' ').slice(0, 200);
  return `${severity} ${range.line ?? '?'}:${range.character ?? '?'} ${text}`;
};

/** 等一个文档的诊断；Lean 可能先发空数组再发真结果，所以持续收集到 accept 为止。 */
const awaitDiagnostics = async (session, uri, accept, label, timeoutMs) => {
  const collected = [];
  const started = Date.now();
  // 30 秒还没有诊断就 hover 一下，逼 Lean 立刻精化这个文档。
  const nudge = setTimeout(() => {
    session
      .sendFrame({
        jsonrpc: '2.0',
        id: 900,
        method: 'textDocument/hover',
        params: { textDocument: { uri }, position: { line: exampleLine, character: 10 } },
      })
      .catch((error) => console.error(`[diag] nudge 失败: ${error.message}`));
  }, 30_000);
  try {
    for (;;) {
      const remaining = timeoutMs - (Date.now() - started);
      if (remaining <= 0) {
        const last = collected.at(-1)?.params?.diagnostics?.length ?? 0;
        throw new Error(`${label} 超时，最后一条诊断数=${last}`);
      }
      const message = await session.waitFor(isPublishFor(uri), `${label} 的诊断`, remaining);
      collected.push(message);
      const diagnostics = message.params?.diagnostics ?? [];
      if (accept(diagnostics)) return diagnostics;
    }
  } finally {
    clearTimeout(nudge);
  }
};

const openDocument = (session, name, uri) =>
  session.sendFrame({
    jsonrpc: '2.0',
    method: 'textDocument/didOpen',
    params: { textDocument: { uri, languageId: 'lean', version: 1, text: documents[name] } },
  });

const assertBad = (name, diagnostics) => {
  console.log(`[diag] ${name} diagnostics=${diagnostics.length}`);
  for (const diagnostic of diagnostics) console.log(`  - ${describe(diagnostic)}`);
  if (!diagnostics.some((diagnostic) => /mismatch|type/i.test(String(diagnostic.message ?? '')))) {
    throw new Error(`${name} 收到了诊断，但不是预期的类型不匹配`);
  }
};

const assertGood = (name, diagnostics) => {
  console.log(`[diag] ${name} diagnostics=${diagnostics.length}`);
  if (diagnostics.length > 0) {
    for (const diagnostic of diagnostics) console.log(`  - ${describe(diagnostic)}`);
    throw new Error(`${name} 不该有诊断：依赖或 import 有问题`);
  }
};

/** watchdog 模式：initialize → initialized → didOpen；didOpen 之后的 spawn 在 wasm 里不可用。 */
const runServerMode = async () => {
  const session = createSession(['-j2', '--server'], {
    '/workspace/Bad.lean': documents['Bad.lean'],
    '/workspace/Good.lean': documents['Good.lean'],
  });
  try {
    const init = session.waitFor((message) => message.id === 1, 'initialize 响应', 180_000);
    await session.sendFrame({ jsonrpc: '2.0', id: 1, method: 'initialize', params: initializeParams });
    const initialized = await init;
    if (!initialized.result?.capabilities) {
      throw new Error(`initialize 没有 capabilities: ${JSON.stringify(initialized).slice(0, 300)}`);
    }
    console.log(`[diag] initialize ok server=${initialized.result?.serverInfo?.name ?? '?'}`);
    await session.sendFrame({ jsonrpc: '2.0', method: 'initialized', params: {} });

    const uri = 'file:///workspace/Bad.lean';
    await openDocument(session, 'Bad.lean', uri);
    const diagnostics = await awaitDiagnostics(session, uri, (list) => list.length > 0, 'Bad.lean', 300_000);
    assertBad('Bad.lean', diagnostics);
  } finally {
    await session.dispose();
  }
};

/** 文件 worker 模式：每个文档一个实例，直接收 publishDiagnostics —— SDK 在浏览器里就是这么做的。 */
const runWorkerMode = async () => {
  for (const name of ['Bad.lean', 'Good.lean']) {
    const uri = `file:///workspace/${name}`;
    const session = createSession(['-j4', '--worker', uri], { [`/workspace/${name}`]: documents[name] });
    try {
      // 按 SDK 的顺序：initialize 与 didOpen 连着发，不等待 initialize 响应。
      await session.sendFrame({ jsonrpc: '2.0', id: 1, method: 'initialize', params: initializeParams });
      await openDocument(session, name, uri);
      // Bad 必须等到非空诊断；Good 允许第一条就是空数组。
      const accept = name === 'Bad.lean' ? (list) => list.length > 0 : () => true;
      const diagnostics = await awaitDiagnostics(session, uri, accept, name, 300_000);
      if (name === 'Bad.lean') assertBad(name, diagnostics);
      else assertGood(name, diagnostics);
    } finally {
      await session.dispose();
    }
  }
};

// 兜底：worker 卡在 Atomics.wait 时 Node 不会自己退出，超时直接杀掉。
const watchdogMs = Number(process.env.LEAN_WASM_DIAG_TIMEOUT_MS ?? 900_000);
const watchdog = setTimeout(() => {
  console.error(`[diag] 全局超时 ${watchdogMs}ms`);
  process.exit(1);
}, watchdogMs);
watchdog.unref();

try {
  if (mode === 'worker') await runWorkerMode();
  else await runServerMode();
  console.log(`[diag] mode=${mode} module=${moduleName || '<Init>'} lib=${resolve(libDir)}`);
  console.log('[diag] ok');
} catch (error) {
  console.error(`[diag] failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  clearTimeout(watchdog);
}
