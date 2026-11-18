import { describe, expect, it } from 'vitest';
import { adaptGlue } from './adapt-glue.ts';

// 最小 fixture：包含所有被替换的锚点，用来锁住补丁行为；真实 glue 由 CI 生成。
const FIXTURE = [
  'var proxiedFunctionTable=[_emscripten_builtin_malloc,emscripten_builtin_memalign];',
  'worker.postMessage({cmd:1,handlers,wasmMemory,wasmModule})',
  'wasmMemory=msgData.wasmMemory;updateMemoryViews();',
  'if(!ENVIRONMENT_IS_PTHREAD)cleanupThread(thread);else postMessage({cmd:6,thread})',
  '_proc_exit(code){if(ENVIRONMENT_IS_PTHREAD)return proxyToMainThread(0,0,1,code);EXITSTATUS=code;',
  'getNewWorker(){if(PThread.unusedWorkers.length==0){',
  'function _fd_read(fd,iov,iovcnt,pnum){return 0}',
  'function updateMemoryViews(){var b=wasmMemory.buffer;}',
].join('\n');

describe('adaptGlue', () => {
  it('注入全部 8 处补丁', () => {
    const { glue } = adaptGlue(FIXTURE);
    expect(glue.startsWith('Error.stackTraceLimit = 200;\n')).toBe(true);
    expect(glue).toContain('lspStdin:Module["lspStdin"]');
    expect(glue).toContain('Module["lspStdin"]=msgData.lspStdin;');
    expect(glue).toContain('__emscripten_thread_cleanup];');
    expect(glue).toContain('proxyToMainThread(2,0,1,thread)');
    expect(glue).toContain('Module["lspProcessExit"]?.(code);');
    expect(glue).toContain('Lean LSP exhausted its pthread pool');
    expect(glue).toContain('Module["onMemoryResize"]?.(_len);');
  });

  it('updateMemoryViews 补丁仅在 owner 线程去重回调 onMemoryResize 并暴露 wasmMemory', () => {
    const { glue } = adaptGlue(FIXTURE);
    const match = /function updateMemoryViews\(\)\{[\s\S]*?var b=wasmMemory\.buffer;\}/.exec(glue);
    expect(match).not.toBeNull();
    const resizes: number[] = [];
    const Module: Record<string, unknown> = {
      onMemoryResize: (bytes: number) => resizes.push(bytes),
    };
    const makeFn = new Function(
      'ENVIRONMENT_IS_PTHREAD',
      'wasmMemory',
      'Module',
      `${match![0]}; return updateMemoryViews;`,
    ) as (
      isPthread: boolean,
      mem: { buffer: { byteLength: number } },
      mod: Record<string, unknown>,
    ) => () => void;

    const ownerMem = { buffer: { byteLength: 512 } };
    const ownerUpdate = makeFn(false, ownerMem, Module);
    ownerUpdate();
    ownerUpdate();
    expect(Module.wasmMemory).toBe(ownerMem);
    expect(resizes).toEqual([512]);

    ownerMem.buffer = { byteLength: 1024 };
    ownerUpdate();
    expect(resizes).toEqual([512, 1024]);

    const pthreadUpdate = makeFn(true, { buffer: { byteLength: 2048 } }, Module);
    pthreadUpdate();
    expect(resizes).toEqual([512, 1024]);
  });

  it('memory64 的 fd0 读取用 16 字节 iovec 与 HEAPU64', () => {
    const { glue, fdReadSnippet } = adaptGlue(FIXTURE);
    expect(glue).toContain(fdReadSnippet);
    expect(fdReadSnippet).toContain('HEAPU64[iov/8]');
    expect(fdReadSnippet).toContain('HEAPU64[(iov+8)/8]');
    expect(fdReadSnippet).toContain('iov+=16');
    expect(fdReadSnippet).toContain('HEAPU64[pnum/8]=BigInt(total)');
    expect(fdReadSnippet).not.toContain('HEAPU32[(iov+k*8)>>>2]');
  });

  it('等 stdin 时泵 Emscripten 代理队列，否则 dedicated 线程的 stdout 写会死锁', () => {
    const { fdReadSnippet } = adaptGlue(FIXTURE);
    expect(fdReadSnippet).toContain('__emscripten_check_mailbox');
    expect(fdReadSnippet).toContain('!ENVIRONMENT_IS_PTHREAD');
    expect(fdReadSnippet).toContain('throw e');
    expect(fdReadSnippet).toMatch(/Atomics\.wait\(c,0,Atomics\.load\(c,0\),1\)/);
  });

  it('锚点缺失时直接失败，而不是静默产出坏 glue', () => {
    expect(() => adaptGlue('function nope(){}')).toThrowError(/期望命中 1 处/);
  });

  it('同一锚点出现两次也失败', () => {
    expect(() =>
      adaptGlue(`${FIXTURE}\nworker.postMessage({cmd:1,handlers,wasmMemory,wasmModule})`),
    ).toThrowError(/期望命中 1 处/);
  });

  it('proxy 表下标按追加前的长度计算', () => {
    const { glue } = adaptGlue(FIXTURE);
    expect(glue).toContain('proxyToMainThread(2,0,1,thread)');
  });
});
