// 把生成的 lean.mjs 适配成可交互 LSP 的版本：移植 @wasm-idle/lsp 的 platform.js 补丁。
//
// 用法: node scripts/adapt-glue.ts <source.mjs> <target.mjs>
//
// 与 SDK 的差异：memory64 下 `_fd_read` 的 iov/iovcnt/pnum 是 BigInt，
// iovec 是 16 字节（8 字节 base + 8 字节 len），nread 是 8 字节 size_t。
import { readFileSync, writeFileSync } from 'node:fs';
import { CliError, expectPositionals, parseArgs, runCli } from './lib/cli.ts';
import { isMainModule } from './lib/entry.ts';
import { requireFile } from './lib/fs-guards.ts';

const replaceOnce = (source: string, from: string, to: string, label: string): string => {
  const count = source.split(from).length - 1;
  if (count !== 1) throw new Error(`${label}: 期望命中 1 处，实际 ${count}`);
  return source.replace(from, to);
};

const replaceRegexOnce = (source: string, pattern: RegExp, to: string, label: string): string => {
  const global = new RegExp(
    pattern.source,
    pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`,
  );
  const matches = source.match(global);
  const count = matches?.length ?? 0;
  if (count !== 1) throw new Error(`${label}: 期望命中 1 处，实际 ${count}`);
  return source.replace(pattern, to);
};

export interface AdaptResult {
  readonly glue: string;
  /** 补丁 6 注入的 fd0 读取实现（单测用来锁住 memory64 布局）。 */
  readonly fdReadSnippet: string;
}

export const FD_READ_SNIPPET = `function _fd_read(fd,iov,iovcnt,pnum){
if(fd===0&&Module["lspStdin"]){
 iov=Number(iov);iovcnt=Number(iovcnt);pnum=Number(pnum);
 var d=Module["lspStdin"],c=new Int32Array(d.buffer,0,4),input=new Uint8Array(d.buffer,16,d.capacity),range=Math.floor(4294967296/d.capacity)*d.capacity;
 // 主线程等 stdin 时必须顺手泵一次 Emscripten 的代理队列：
 // 诊断输出来自 dedicated 线程，_fd_write 会 proxy 回主线程；主线程若直接 Atomics.wait，
 // 代理永远没机会执行，表现为「帧都读了但一条 publishDiagnostics 都没有」。
 // 1ms 短等避免卡住 MEMFS 的大量同步代理 syscall（20ms 会把 import Init 拖过超时）。
 while(Atomics.load(c,0)===Atomics.load(c,1)&&!Atomics.load(c,2)){
  if(!ENVIRONMENT_IS_PTHREAD&&typeof __emscripten_check_mailbox==='function'){
   try{__emscripten_check_mailbox()}catch(e){console.error('[lsp] mailbox error:',e);throw e}
   if(Atomics.load(c,0)!==Atomics.load(c,1)||Atomics.load(c,2))break;
   Atomics.wait(c,0,Atomics.load(c,0),1);
   try{__emscripten_check_mailbox()}catch(e){console.error('[lsp] mailbox error:',e);throw e}
  }else{
   Atomics.wait(c,0,Atomics.load(c,0),100);
  }
 }
 growMemViews();var total=0,stop=false;
 for(var k=0;k<iovcnt&&!stop;k++){growMemViews();var ptr=Number(HEAPU64[iov/8]),len=Number(HEAPU64[(iov+8)/8]);iov+=16;
  for(var j=0;j<len;j++){var r=Atomics.load(c,1)>>>0,w=Atomics.load(c,0)>>>0;if(r===w){stop=true;break;}HEAPU8[ptr+j]=input[r%d.capacity];Atomics.store(c,1,(r+1)%range);total++;}
 }
 growMemViews();HEAPU64[pnum/8]=BigInt(total);Atomics.notify(c,1);return 0;
}`;

export const adaptGlue = (source: string): AdaptResult => {
  let glue = source;

  // 1. 把 lspStdin 描述符带进 pthread worker。
  glue = replaceOnce(
    glue,
    'worker.postMessage({cmd:1,handlers,wasmMemory,wasmModule})',
    'worker.postMessage({cmd:1,handlers,wasmMemory,wasmModule,lspStdin:Module["lspStdin"]})',
    'lspStdin 传给 pthread',
  );

  // 2. pthread 侧接收。
  glue = replaceOnce(
    glue,
    'wasmMemory=msgData.wasmMemory;updateMemoryViews();',
    'Module["lspStdin"]=msgData.lspStdin;wasmMemory=msgData.wasmMemory;updateMemoryViews();',
    'pthread 接收 lspStdin',
  );

  // 3. pthread 退出后的清理走原生代理队列：callMain 期间普通 postMessage 送不回去。
  const table = /var proxiedFunctionTable=\[([^\]]+)\];/.exec(glue);
  const tableText = table?.[0];
  const tableBody = table?.[1];
  if (!tableText || tableBody === undefined) throw new Error('找不到 proxiedFunctionTable');
  const index = tableBody.split(',').length;
  glue = replaceOnce(
    glue,
    tableText,
    tableText.replace('];', ',__emscripten_thread_cleanup];'),
    '扩 proxy 表',
  );
  glue = replaceOnce(
    glue,
    'if(!ENVIRONMENT_IS_PTHREAD)cleanupThread(thread);else postMessage({cmd:6,thread})',
    `if(!ENVIRONMENT_IS_PTHREAD)cleanupThread(thread);else proxyToMainThread(${index},0,1,thread)`,
    'cleanupThread 走代理',
  );

  // 4. 进程退出可以被宿主观察到（FileWorker 请求重启时退出码是 2）。
  glue = replaceOnce(
    glue,
    '_proc_exit(code){if(ENVIRONMENT_IS_PTHREAD)return proxyToMainThread(0,0,1,code);EXITSTATUS=code;',
    '_proc_exit(code){if(ENVIRONMENT_IS_PTHREAD)return proxyToMainThread(0,0,1,code);EXITSTATUS=code;Module["lspProcessExit"]?.(code);',
    'lspProcessExit',
  );

  // 5. 线程池耗尽时明确报错，别静默等死。
  glue = replaceOnce(
    glue,
    'getNewWorker(){if(PThread.unusedWorkers.length==0){',
    'getNewWorker(){if(PThread.unusedWorkers.length==0){throw new Error("Lean LSP exhausted its pthread pool ("+Object.keys(PThread.pthreads).length+" active)");',
    '池耗尽报错',
  );

  // 6. fd 0 直接读共享环形缓冲，绕开 Emscripten 的 TTY 读循环与 fd_read 线程代理。
  glue = replaceOnce(
    glue,
    'function _fd_read(fd,iov,iovcnt,pnum){',
    FD_READ_SNIPPET,
    'fd0 环形缓冲',
  );

  // 7. 线性内存扩展通知：仅在主 owner 线程暴露 wasmMemory，并在实际扩容时回调宿主。
  glue = replaceRegexOnce(
    glue,
    /function updateMemoryViews\(\)\s*\{/,
    'function updateMemoryViews(){if(!ENVIRONMENT_IS_PTHREAD&&typeof wasmMemory!="undefined"&&wasmMemory&&wasmMemory.buffer){Module["wasmMemory"]=wasmMemory;var _len=wasmMemory.buffer.byteLength;if(_len!==Module["_lastMemoryBytes"]){Module["_lastMemoryBytes"]=_len;Module["onMemoryResize"]?.(_len);}}',
    'onMemoryResize 内存扩展回调',
  );

  // 8. V8 默认 Error.stackTraceLimit=10。pthread worker 加载的是这份 glue，
  //    每个 realm 的 stackTraceLimit 相互独立；在文件最前面统一抬高，
  //    wasm 爆栈时 pthread 侧才能把 whnfCoreStep 下面的完整递归环回传。
  glue = `Error.stackTraceLimit = 200;\n${glue}`;

  return { glue, fdReadSnippet: FD_READ_SNIPPET };
};

const main = (): void => {
  const parsed = parseArgs(process.argv.slice(2), {});
  const [sourcePath = '', targetPath = ''] = expectPositionals(
    parsed,
    2,
    'node scripts/adapt-glue.ts <source.mjs> <target.mjs>',
  );
  const sourceFile = requireFile(sourcePath, 'source');
  if (!targetPath) throw new CliError('缺少 target');
  const { glue } = adaptGlue(readFileSync(sourceFile, 'utf8'));
  writeFileSync(targetPath, glue);
  console.log(`adapted ${targetPath} (${glue.length} bytes)`);
};

if (isMainModule(import.meta.url, process.argv[1])) runCli(main);
