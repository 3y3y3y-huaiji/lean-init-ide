// 把生成的 lean.mjs 适配成可交互 LSP 的版本：移植 @wasm-idle/lsp 的 platform.js 补丁。
//
// 用法: node scripts/adapt-glue.mjs <lean.mjs> <out.mjs>
//
// 与 SDK 的差异：memory64 下 `_fd_read` 的 iov/iovcnt/pnum 是 BigInt，插入的代码先转 Number。
import { readFileSync, writeFileSync } from 'node:fs';

const [source, target] = process.argv.slice(2);
if (!source || !target) throw new Error('usage: adapt-glue.mjs <lean.mjs> <out.mjs>');

let glue = readFileSync(source, 'utf8');

const replace = (from, to, label) => {
  const count = glue.split(from).length - 1;
  if (count !== 1) throw new Error(`${label}: 期望命中 1 处，实际 ${count}`);
  glue = glue.replace(from, to);
};

// 1. 把 lspStdin 描述符带进 pthread worker。
replace(
  'worker.postMessage({cmd:1,handlers,wasmMemory,wasmModule})',
  'worker.postMessage({cmd:1,handlers,wasmMemory,wasmModule,lspStdin:Module["lspStdin"]})',
  'lspStdin 传给 pthread'
);

// 2. pthread 侧接收。
replace(
  'wasmMemory=msgData.wasmMemory;updateMemoryViews();',
  'Module["lspStdin"]=msgData.lspStdin;wasmMemory=msgData.wasmMemory;updateMemoryViews();',
  'pthread 接收 lspStdin'
);

// 3. pthread 退出后的清理走原生代理队列：callMain 期间普通 postMessage 送不回去。
const table = /var proxiedFunctionTable=\[([^\]]+)\];/.exec(glue);
if (!table) throw new Error('找不到 proxiedFunctionTable');
const index = table[1].split(',').length;
replace(
  table[0],
  table[0].replace('];', ',__emscripten_thread_cleanup];'),
  '扩 proxiy 表'
);
replace(
  'if(!ENVIRONMENT_IS_PTHREAD)cleanupThread(thread);else postMessage({cmd:6,thread})',
  `if(!ENVIRONMENT_IS_PTHREAD)cleanupThread(thread);else proxyToMainThread(${index},0,1,thread)`,
  'cleanupThread 走代理'
);

// 4. 进程退出可以被宿主观察到（FileWorker 请求重启时退出码是 2）。
replace(
  '_proc_exit(code){if(ENVIRONMENT_IS_PTHREAD)return proxyToMainThread(0,0,1,code);EXITSTATUS=code;',
  '_proc_exit(code){if(ENVIRONMENT_IS_PTHREAD)return proxyToMainThread(0,0,1,code);EXITSTATUS=code;Module["lspProcessExit"]?.(code);',
  'lspProcessExit'
);

// 5. 线程池耗尽时明确报错，别静默等死。
replace(
  'getNewWorker(){if(PThread.unusedWorkers.length==0){',
  'getNewWorker(){if(PThread.unusedWorkers.length==0){throw new Error("Lean LSP exhausted its pthread pool");',
  '池耗尽报错'
);

// 6. fd 0 直接读共享环形缓冲，绕开 Emscripten 的 TTY 读循环与 fd_read 线程代理。
replace(
  'function _fd_read(fd,iov,iovcnt,pnum){',
  `function _fd_read(fd,iov,iovcnt,pnum){
if(fd===0&&Module["lspStdin"]){
 iov=Number(iov);iovcnt=Number(iovcnt);pnum=Number(pnum);
 var d=Module["lspStdin"],c=new Int32Array(d.buffer,0,4),input=new Uint8Array(d.buffer,16,d.capacity),range=Math.floor(4294967296/d.capacity)*d.capacity;
 while(Atomics.load(c,0)===Atomics.load(c,1)&&!Atomics.load(c,2))Atomics.wait(c,0,Atomics.load(c,0),100);
 growMemViews();var total=0,stop=false;
 for(var k=0;k<iovcnt&&!stop;k++){var ptr=HEAPU32[(iov+k*8)>>>2],len=HEAPU32[(iov+k*8+4)>>>2];
  for(var j=0;j<len;j++){var r=Atomics.load(c,1)>>>0,w=Atomics.load(c,0)>>>0;if(r===w){stop=true;break;}HEAPU8[ptr+j]=input[r%d.capacity];Atomics.store(c,1,(r+1)%range);total++;}
 }
 HEAPU32[pnum>>>2]=total;Atomics.notify(c,1);return 0;
}`,
  'fd0 环形缓冲'
);

writeFileSync(target, glue);
console.log(`adapted ${target} (${glue.length} bytes)`);
