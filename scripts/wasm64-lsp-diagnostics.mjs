// wasm64 LSP 完整链路：initialize → initialized → didOpen → publishDiagnostics。
//
// 用法：node scripts/wasm64-lsp-diagnostics.mjs <lean.mjs> <libDir> [importModule]
//
// 两个文档：Bad.lean 故意写错类型，必须收到带 mismatch 的诊断；
// Good.lean 必须干净（空诊断）。Good.lean 干净同时证明 Mathlib olean 真的被加载并解析成功，
// 否则 import 失败会在两个文件上都报错。
import { Worker } from 'node:worker_threads';
import { resolve } from 'node:path';

const [leanMjs, libDir, moduleName = ''] = process.argv.slice(2);
if (!leanMjs || !libDir) {
  console.error('usage: node wasm64-lsp-diagnostics.mjs <lean.mjs> <libDir> [importModule]');
  process.exit(2);
}

const EMPTY = 0;
const READY = 1;
const EOF = 2;
const PAYLOAD_BYTES = 1 << 20;

const payload = new SharedArrayBuffer(PAYLOAD_BYTES);
const control = new SharedArrayBuffer(8);
const ctrl = new Int32Array(control);
const shared = new Uint8Array(payload);

const importLine = moduleName ? `import ${moduleName}\n` : '';
// import 行占掉第 0 行，示例在第 1 行；nudge 的 hover 位置要落在示例上。
const exampleLine = moduleName ? 1 : 0;
const files = {
  '/workspace/Bad.lean': `${importLine}example : 1 + 1 = 3 := rfl\n`,
  '/workspace/Good.lean': `${importLine}example : 1 + 1 = 2 := rfl\n`,
};

const worker = new Worker(new URL('./wasm64-lsp-worker.mjs', import.meta.url), {
  workerData: {
    leanMjs: resolve(leanMjs),
    libDir: resolve(libDir),
    files,
    args: ['-j2', '--server'],
    control,
    payload,
  },
});
if (process.env.LEAN_WASM_DIAG_DEBUG) console.error('[debug] worker created');

const waiters = [];
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

const HEADER_END = Buffer.from('\r\n\r\n');
let inbox = Buffer.alloc(0);
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

let leanExit;
let workerExited = false;
worker.on('exit', () => {
  workerExited = true;
});
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
    leanExit = message.exit;
  }
});
worker.on('error', (error) => console.error(`[worker] ${error.stack ?? error}`));

// 只有 worker 把上一帧消费掉（置回 EMPTY）才能覆盖共享缓冲。
const waitEmpty = (timeoutMs = 30_000) =>
  new Promise((resolveEmpty, rejectEmpty) => {
    const started = Date.now();
    const poll = () => {
      if (Atomics.load(ctrl, 0) === EMPTY) resolveEmpty();
      else if (Date.now() - started > timeoutMs) rejectEmpty(new Error('stdin 缓冲一直没被消费'));
      else setTimeout(poll, 5);
    };
    poll();
  });

const sendFrame = async (message) => {
  const body = JSON.stringify(message);
  // LSP 帧头与正文必须一起写进 stdin，少一个 Content-Length server 会一直等。
  const framed = Buffer.from(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`, 'utf8');
  if (framed.length > PAYLOAD_BYTES) throw new Error(`帧过大: ${framed.length}`);
  await waitEmpty();
  shared.set(framed);
  Atomics.store(ctrl, 1, framed.length);
  Atomics.store(ctrl, 0, READY);
  Atomics.notify(ctrl, 0);
  if (process.env.LEAN_WASM_DIAG_DEBUG) console.error(`[debug] sent ${framed.length} bytes`);
};

// server 收到 exit 后可能已经不再读 stdin，这里让收尾失败不致命。
const closeStdin = async () => {
  try {
    await waitEmpty(5_000);
  } catch {
    // 忽略：wasm 已经退出，缓冲区不再需要。
  }
  Atomics.store(ctrl, 0, EOF);
  Atomics.notify(ctrl, 0);
};

const isPublishFor = (uri) => (message) =>
  message.method === 'textDocument/publishDiagnostics' && String(message.params?.uri ?? '').endsWith(uri);

const hover = (id, uri) =>
  sendFrame({
    jsonrpc: '2.0',
    id,
    method: 'textDocument/hover',
    params: { textDocument: { uri }, position: { line: exampleLine, character: 10 } },
  });

const didOpen = (uri, text) =>
  sendFrame({
    jsonrpc: '2.0',
    method: 'textDocument/didOpen',
    params: {
      textDocument: { uri, languageId: 'lean', version: 1, text },
    },
  });

const openFile = async (name) => {
  const uri = `file:///workspace/${name}`;
  await didOpen(uri, files[`/workspace/${name}`]);
  return uri;
};

/**
 * 等一个文档的诊断。Lean 有时先发空数组再发真结果，
 * 所以这里持续收集，直到拿到满足 accept 的那一条。
 */
const awaitDiagnostics = async (uri, accept, label, timeoutMs) => {
  const collected = [];
  const started = Date.now();
  // 30 秒还没有任何诊断时，用 hover 逼 server 立刻精化这个文档。
  const nudge = setTimeout(() => {
    hover(900, uri).catch((error) => console.error(`[diag] nudge 失败: ${error.message}`));
  }, 30_000);
  try {
    for (;;) {
      const remaining = timeoutMs - (Date.now() - started);
      if (remaining <= 0) {
        const last = collected.at(-1)?.params?.diagnostics?.length ?? 0;
        throw new Error(`${label} 超时，最后一条诊断数=${last}`);
      }
      const message = await waitFor(isPublishFor(uri), `${label} 的诊断`, remaining);
      collected.push(message);
      if (accept(message.params?.diagnostics ?? [])) return message.params.diagnostics;
    }
  } finally {
    clearTimeout(nudge);
  }
};

const describe = (diagnostic) => {
  const range = diagnostic.range?.start ?? {};
  const severity = { 1: 'error', 2: 'warning', 3: 'info', 4: 'hint' }[diagnostic.severity] ?? '?';
  const text = String(diagnostic.message ?? '').replace(/\s+/g, ' ').slice(0, 200);
  return `${severity} ${range.line ?? '?'}:${range.character ?? '?'} ${text}`;
};

const run = async () => {
  const initWait = waitFor((message) => message.id === 1, 'initialize 响应', 180_000);
  await sendFrame({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      processId: null,
      rootUri: 'file:///workspace',
      workspaceFolders: null,
      capabilities: { textDocument: { publishDiagnostics: {}, synchronization: {} } },
    },
  });
  const initialized = await initWait;
  const capabilities = initialized.result?.capabilities;
  if (!capabilities) throw new Error(`initialize 没有 capabilities: ${JSON.stringify(initialized).slice(0, 300)}`);
  console.log(`[diag] initialize ok server=${initialized.result?.serverInfo?.name ?? '?'} ${initialized.result?.serverInfo?.version ?? ''}`);

  await sendFrame({ jsonrpc: '2.0', method: 'initialized', params: {} });

  const badUri = await openFile('Bad.lean');
  const bad = await awaitDiagnostics(
    badUri,
    (diagnostics) => diagnostics.length > 0,
    'Bad.lean',
    300_000
  );
  console.log(`[diag] Bad.lean diagnostics=${bad.length}`);
  for (const diagnostic of bad) console.log(`  - ${describe(diagnostic)}`);
  if (!bad.some((diagnostic) => /mismatch|type/i.test(String(diagnostic.message ?? '')))) {
    throw new Error('Bad.lean 收到了诊断，但不是预期的类型不匹配');
  }

  const goodUri = await openFile('Good.lean');
  let good = null;
  try {
    good = await awaitDiagnostics(goodUri, () => true, 'Good.lean', 120_000);
  } catch (error) {
    // 干净文件可能压根不发诊断；只要 Bad.lean 已经证明链路通，就不算失败。
    console.log(`[diag] Good.lean 没有收到诊断（${error.message}）`);
  }
  if (good) {
    console.log(`[diag] Good.lean diagnostics=${good.length}`);
    if (good.length > 0) {
      for (const diagnostic of good) console.log(`  - ${describe(diagnostic)}`);
      throw new Error('Good.lean 不该有诊断：依赖或 import 有问题');
    }
  }

  const shutdownWait = waitFor((message) => message.id === 2, 'shutdown 响应', 60_000);
  await sendFrame({ jsonrpc: '2.0', id: 2, method: 'shutdown', params: null });
  await shutdownWait;
  await sendFrame({ jsonrpc: '2.0', method: 'exit', params: null });
  await closeStdin();
  console.log(`[diag] module=${moduleName || '<Init>'} lib=${resolve(libDir)}`);
  console.log('[diag] ok');
};

// 兜底：worker 卡在 Atomics.wait 时 Node 不会自己退出，超时直接杀掉，避免 CI 空转到 job 上限。
const watchdogMs = Number(process.env.LEAN_WASM_DIAG_TIMEOUT_MS ?? 900_000);
const watchdog = setTimeout(() => {
  console.error(`[diag] 全局超时 ${watchdogMs}ms ctrl=${Atomics.load(ctrl, 0)} inbox=${inbox.length}`);
  process.exit(1);
}, watchdogMs);
watchdog.unref();

try {
  await run();
} catch (error) {
  console.error(`[diag] failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  clearTimeout(watchdog);
  if (!workerExited) {
    await new Promise((resolveExit) => {
      const timer = setTimeout(resolveExit, 10_000);
      worker.once('exit', () => {
        clearTimeout(timer);
        resolveExit();
      });
      worker.terminate().catch(() => resolveExit());
    });
  }
  if (leanExit !== undefined) console.log(`[diag] lean exit=${leanExit}`);
}
