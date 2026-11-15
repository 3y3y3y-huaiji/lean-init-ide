// 在 Node 里给 wasm64 Lean 做一次 LSP 握手。
// 用法: node wasm64-lsp-handshake.mjs <lean.mjs> <libDir>
// 只走 stderr 输出诊断，stdout 交给 Content-Length 帧。
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const [leanMjs, libDir] = process.argv.slice(2);
if (!leanMjs || !libDir) throw new Error('usage: node wasm64-lsp-handshake.mjs <lean.mjs> <libDir>');

const { default: createLean } = await import(pathToFileURL(leanMjs).href);

const request = JSON.stringify({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: { processId: null, rootUri: 'file:///workspace', capabilities: {} },
});
const framed = Buffer.from(`Content-Length: ${Buffer.byteLength(request)}\r\n\r\n${request}`, 'utf8');

let pos = 0;
// Emscripten 的 stdin 钩子逐字节返回字符码，EOF 返回 null。
const nextByte = () => (pos < framed.length ? framed[pos++] : null);

let captured = Buffer.alloc(0);
const lean = await createLean({
  noInitialRun: true,
  stdin: nextByte,
  print: (line) => {
    captured = Buffer.concat([captured, Buffer.from(`${line}\n`, 'utf8')]);
  },
  printErr: (line) => process.stderr.write(`[stderr] ${line}\n`),
});

lean.FS.mkdirTree('/lean/bin');
lean.FS.mkdirTree('/lean/lib/lean');
lean.FS.mkdirTree('/workspace');

const walk = (dir) => {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(p));
    else if (/[.](olean|olean[.]server|olean[.]private|ilean)$/.test(entry.name)) out.push(p);
  }
  return out;
};

for (const file of walk(libDir)) {
  const rel = file.slice(libDir.length + 1);
  const target = `/lean/lib/lean/${rel}`;
  const parent = target.slice(0, target.lastIndexOf('/'));
  lean.FS.mkdirTree(parent);
  lean.FS.writeFile(target, readFileSync(file));
}

// fd 1 是 LSP 协议通道，必须原样捕获。
const fd1 = lean.FS.getStream(1);
fd1.stream_ops = {
  ...fd1.stream_ops,
  write(_stream, buffer, offset, length) {
    captured = Buffer.concat([captured, Buffer.from(buffer.subarray(offset, offset + length))]);
    return length;
  },
};

lean.FS.chdir('/workspace');

const exit = (async () => {
  try {
    const code = lean.callMain(['-j2', '--server']);
    return typeof code === 'number' ? code : 0;
  } catch (error) {
    if (error && error.name === 'ExitStatus' && typeof error.status === 'number') return error.status;
    throw error;
  }
})();

const timeout = new Promise((resolve) => setTimeout(() => resolve('timeout'), 180_000));
const outcome = await Promise.race([exit, timeout]);
const text = captured.toString('utf8');
process.stderr.write(`[handshake] outcome=${String(outcome)} bytes=${captured.length}\n`);
process.stdout.write(text.slice(0, 4000));
if (!text.includes('"capabilities"')) {
  process.stderr.write('[handshake] no capabilities in response\n');
  process.exit(1);
}
process.stderr.write('[handshake] ok\n');
process.exit(0);
