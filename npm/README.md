# lean4-wasm64

Lean 4.34.1 前端/解释器的 **真 64 位 WebAssembly** 构建（Emscripten `MEMORY64=1` + 线程 + GMP）。

- 加载官方 64 位 `Init` / `Std` / `Lean` olean（GMP 编码，flags=1）
- CLI 编译可用（`lean -o Foo.olean Foo.lean`）
- LSP 握手可用（`lean --server` 能回 `initialize`）
- `didOpen → publishDiagnostics` 暂不可用：`--worker` 能收帧，但 FileWorker 的输出通道在 wasm 下不产出，需要额外的宿主适配层

## 用法（Node）

```js
import { createLeanRuntime, callLean } from 'lean4-wasm64';
import { mkdirSync } from 'node:fs';

// libraryDir 需要是官方 Lean 4.34.1 的 lib/lean（olean/ir/olean.server），
// 例如从 leanprover/lean4 的 linux 发行包解出来。
const lean = await createLeanRuntime({ libraryDir: '/opt/lean/lib/lean', workDir: '/tmp/work' });
const code = callLean(lean, ['-j1', '-R', '/src', '-o', '/src/Foo.olean', '/src/Foo.lean']);
console.log('exit', code);
```

浏览器里没有 NODEFS：请直接用 `createLean`（本包同样导出）并在 `preRun` 里把 olean 写进
`/lean/lib/lean`，同时记得给页面加 COOP/COEP，`SharedArrayBuffer` 才能用。

## 体积

`lean.wasm` 以 zstd 发行（`lean.wasm.zst`），入口会解压一次并作为 `wasmBinary` 传给 Emscripten，
不落临时文件。需要 Node ≥ 22.15（`node:zlib` 的 zstd 支持）。

| 文件 | 原始 | zstd |
| --- | --- | --- |
| `lean.wasm`（release，无调试符号） | 见 npm 页面 | 见 npm 页面 |

oleans 不随包发布：官方 Init 有 400MB，请从 Lean release 或你自己的资产源获取。

## 许可

Lean 本体为 Apache-2.0；本构建产物同样遵循 Apache-2.0。详见仓库 LICENSE。
