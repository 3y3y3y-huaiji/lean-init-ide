// 在 worker 线程里跑 wasm64 Lean，stdin 走共享环形缓冲（glue 已被 adapt-glue.mjs 打过补丁）。
//
// 为什么不再用 Module.stdin 钩子：Emscripten 的 TTY 读循环会一直 get_char 到读满 length，
// 阻塞式钩子拿到半帧就卡死；fd_read 还会把 pthread 的读代理回主线程。
// 共享环形缓冲把 fd 0 直接接在 wasm 内部，主线程与 pthread 都能安全阻塞等待。
import { parentPort, workerData } from 'node:worker_threads';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const { leanMjs, libDir, files, args, timezone, proxy, stdin } = workerData;
const debug = (...items) => {
  if (process.env.LEAN_WASM_DIAG_DEBUG) parentPort.postMessage({ debug: items.join(' ') });
};
debug('worker start', leanMjs);

const walk = (dir) => {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(path));
    else if (/[.](olean|olean[.]server|olean[.]private|ilean|ir|ir[.]sig)$/.test(entry.name)) out.push(path);
  }
  return out;
};

const { default: createLean } = await import(pathToFileURL(leanMjs).href);

const lean = await createLean({
  noInitialRun: true,
  lspStdin: stdin,
  lspProcessExit: (code) => parentPort.postMessage({ exit: code }),
  print: (text) => parentPort.postMessage({ stdout: new TextEncoder().encode(`${text}\n`) }),
  printErr: (text) => parentPort.postMessage({ stderr: `${text}\n` }),
});

lean.FS.mkdirTree('/lean/bin');
lean.FS.mkdirTree('/lean/lib/lean');
lean.FS.mkdirTree('/workspace');
lean.FS.mkdirTree('/etc');
// watchdogMain 解析 /etc/localtime，合成数据会被 forceExit，必须放真实 TZif。
if (timezone) lean.FS.writeFile('/etc/localtime', new Uint8Array(timezone));

for (const file of walk(libDir)) {
  const rel = file.slice(libDir.length + 1).split('\\').join('/');
  const target = `/lean/lib/lean/${rel}`;
  lean.FS.mkdirTree(target.slice(0, target.lastIndexOf('/')));
  lean.FS.writeFile(target, readFileSync(file));
}

for (const [path, text] of Object.entries(files)) {
  lean.FS.mkdirTree(path.slice(0, path.lastIndexOf('/')));
  lean.FS.writeFile(path, new TextEncoder().encode(text));
}

// fd 1 是 LSP 协议通道，原样交给父线程解析帧。fd 0 由 glue 的环形缓冲补丁接管。
const fd1 = lean.FS.getStream(1);
fd1.stream_ops = {
  ...fd1.stream_ops,
  write(_stream, buffer, offset, length) {
    const chunk = Uint8Array.from(buffer.subarray(offset, offset + length));
    parentPort.postMessage({ stdout: chunk }, [chunk.buffer]);
    return length;
  },
};

lean.FS.chdir('/workspace');
parentPort.postMessage({ ready: true });
debug('calling main', args.join(' '));

let code = 0;
try {
  code = lean.callMain(args);
} catch (error) {
  if (error && error.name === 'ExitStatus' && typeof error.status === 'number') code = error.status;
  else parentPort.postMessage({ failure: String(error?.stack ?? error) });
}
// PROXY_TO_PTHREAD 下 callMain 只负责派发，返回不代表进程结束；退出码统一走 lspProcessExit。
debug(proxy ? 'main dispatched (proxy mode)' : 'main returned', code);
