import { describe, expect, it } from 'vitest';
import { FrameDecoder, FrameError, RingError, RingWriter, encodeFrame } from './lean-wasm64-frames';

const utf8 = new TextEncoder();
const latin1 = (text: string): Uint8Array => Uint8Array.from(text, (char) => char.charCodeAt(0));
const concat = (...parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
};

describe('encodeFrame / FrameDecoder', () => {
  it('往返解码单帧', () => {
    const messages = new FrameDecoder().push(
      encodeFrame({ jsonrpc: '2.0', id: 1, method: 'initialize' }),
    );
    expect(messages).toEqual([{ jsonrpc: '2.0', id: 1, method: 'initialize' }]);
  });

  it('分片输入也能拼出整帧', () => {
    const frame = encodeFrame({ id: 2, result: { ok: true } });
    const decoder = new FrameDecoder();
    expect(decoder.push(frame.subarray(0, 5))).toEqual([]);
    expect(decoder.push(frame.subarray(5, 12))).toEqual([]);
    expect(decoder.push(frame.subarray(12))).toEqual([{ id: 2, result: { ok: true } }]);
  });

  it('一次 push 多条消息', () => {
    const two = concat(encodeFrame({ id: 1 }), encodeFrame({ id: 2 }));
    expect(new FrameDecoder().push(two)).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it('Content-Length 按 UTF-8 字节计算', () => {
    const message = { text: '中文' };
    const frame = encodeFrame(message);
    const header = new TextDecoder('latin1').decode(frame).split('\r\n')[0];
    expect(header).toBe(`Content-Length: ${utf8.encode(JSON.stringify(message)).length}`);
    expect(new FrameDecoder().push(frame)).toEqual([message]);
  });

  it('坏 JSON 抛 FrameError', () => {
    const body = utf8.encode('{oops');
    const frame = concat(latin1(`Content-Length: ${body.length}\r\n\r\n`), body);
    expect(() => new FrameDecoder().push(frame)).toThrowError(FrameError);
  });

  it('没有 Content-Length 的头会被跳过', () => {
    const garbage = latin1('X-Test: 1\r\n\r\n');
    expect(new FrameDecoder().push(concat(garbage, encodeFrame({ id: 3 })))).toEqual([{ id: 3 }]);
  });
});

describe('RingWriter', () => {
  it('写入并推进 write 游标', () => {
    const writer = new RingWriter(new SharedArrayBuffer(16 + 64), 64);
    writer.write(utf8.encode('abc'));
    expect(writer.stats()).toEqual({ write: 3, read: 0, closed: false });
    writer.close();
    expect(writer.stats().closed).toBe(true);
  });

  it('容量与控制区不一致时拒绝构造', () => {
    expect(() => new RingWriter(new SharedArrayBuffer(16 + 64), 32)).toThrowError(RingError);
    expect(() => new RingWriter(new SharedArrayBuffer(16 + 64), 0)).toThrowError(RingError);
  });

  it('拒绝空帧与超长帧', () => {
    const writer = new RingWriter(new SharedArrayBuffer(16 + 8), 8);
    expect(() => writer.write(new Uint8Array())).toThrowError(/空帧/);
    expect(() => writer.write(new Uint8Array(9))).toThrowError(/超过缓冲区/);
  });

  it('读游标不前进时缓冲区写满会报错', () => {
    const writer = new RingWriter(new SharedArrayBuffer(16 + 8), 8);
    writer.write(new Uint8Array(8));
    expect(() => writer.write(new Uint8Array(1))).toThrowError(/已满/);
  });

  it('环形回绕时数据落在正确位置', () => {
    const buffer = new SharedArrayBuffer(16 + 8);
    const writer = new RingWriter(buffer, 8);
    writer.write(Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]));
    Atomics.store(new Int32Array(buffer, 0, 4), 1, 6);
    writer.write(Uint8Array.from([9, 10]));
    expect([...new Uint8Array(buffer, 16)]).toEqual([9, 10, 3, 4, 5, 6, 7, 8]);
  });
});
