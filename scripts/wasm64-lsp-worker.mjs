// 在 worker 线程里跑 wasm64 Lean 的 --server，stdin 用共享内存挂起等待父线程喂帧。
//
// 为什么必须是 worker：Lean 的 server 是同步阻塞读 stdin 的，
// 主线程如果在 stdin 钩子里阻塞，就没人去读 stdout、没法按响应决定下一句说什么；
// 直接返回 null 会被当成 EOF，server 可能在 publishDiagnostics 之前就退出。
// 这里用 Atomics.wait 把读取挂起，父线程收到响应后再写入下一帧。
import { parentPort, workerData } from 'node:worker_threads';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const { leanMjs, libDir, files, args, control, payload } = workerData;
const debug = (...items) => {
  if (process.env.LEAN_WASM_DIAG_DEBUG) parentPort.postMessage({ debug: items.join(' ') });
};
debug('worker start', leanMjs);
const ctrl = new Int32Array(control);
const shared = new Uint8Array(payload);
const EMPTY = 0;
const READY = 1;
const EOF = 2;
const WAIT_LIMIT_MS = 600_000;

const queue = [];
const pullBlocking = () => {
  let waited = 0;
  for (;;) {
    if (queue.length) return queue.shift();
    const state = Atomics.load(ctrl, 0);
    if (state === READY) {
      const length = Atomics.load(ctrl, 1);
      debug('stdin chunk', length);
      for (let i = 0; i < length; i += 1) queue.push(shared[i]);
      Atomics.store(ctrl, 0, EMPTY);
      Atomics.notify(ctrl, 0);
      continue;
    }
    if (state === EOF) return null;
    if (Atomics.wait(ctrl, 0, EMPTY, 1000) === 'timed-out') {
      waited += 1000;
      if (waited > WAIT_LIMIT_MS) throw new Error('stdin 等待超时');
    }
  }
};
const pullAvailable = () => (queue.length ? queue.shift() : undefined);

const walk = (dir) => {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(path));
    else if (/[.](olean|olean[.]server|olean[.]private|ilean)$/.test(entry.name)) out.push(path);
  }
  return out;
};

const { default: createLean } = await import(pathToFileURL(leanMjs).href);

const lean = await createLean({
  noInitialRun: true,
  stdin: pullBlocking,
  print: (text) => parentPort.postMessage({ stdout: new TextEncoder().encode(`${text}\n`) }),
  printErr: (text) => parentPort.postMessage({ stderr: `${text}\n` }),
});

lean.FS.mkdirTree('/lean/bin');
lean.FS.mkdirTree('/lean/lib/lean');
lean.FS.mkdirTree('/workspace');
lean.FS.mkdirTree('/etc');
// upstream IO 的时间处理要求 /etc/localtime 是真实 TZif 文件。
lean.FS.writeFile(
  '/etc/localtime',
  Uint8Array.from([
    84, 90, 105, 102, 50, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 4, 0, 0, 0, 0, 0, 0, 85, 84, 67, 0,
    84, 90, 105, 102, 50, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 4, 0, 0, 0, 0, 0, 0, 85, 84, 67,
    0, 10, 85, 84, 67, 48, 10,
  ])
);

for (const file of walk(libDir)) {
  const rel = file.slice(libDir.length + 1).split('\\').join('/');
  const target = `/lean/lib/lean/${rel}`;
  const parent = target.slice(0, target.lastIndexOf('/'));
  lean.FS.mkdirTree(parent);
  lean.FS.writeFile(target, readFileSync(file));
}

for (const [path, text] of Object.entries(files)) {
  lean.FS.mkdirTree(path.slice(0, path.lastIndexOf('/')));
  lean.FS.writeFile(path, new TextEncoder().encode(text));
}

// 上游 TTY.read 会一直调用 get_char 直到读满 length 字节。
// 阻塞式钩子在拿到半帧后就卡在这个循环里，帧永远交给 Lean。
// 这里换成「有多少给多少」：只在第一个字节上阻塞，剩下的取当前可用的部分就返回。
const stdin = lean.FS.getStream(0);
stdin.stream_ops = {
  ...stdin.stream_ops,
  read(_stream, buffer, offset, length) {
    let count = 0;
    while (count < length) {
      const byte = count === 0 ? pullBlocking() : pullAvailable();
      if (byte === null || byte === undefined) break;
      buffer[offset + count] = byte;
      count += 1;
    }
    debug('stdin read', count);
    return count;
  },
};

// fd 1 是 LSP 协议通道，必须原样交给父线程解析帧。
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
parentPort.postMessage({ exit: code });
