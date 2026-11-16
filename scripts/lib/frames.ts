// LSP 帧编解码与 stdin 环形缓冲。诊断脚本和单测共用同一份实现。

export const HEADER_END = Buffer.from('\r\n\r\n', 'latin1');
export const RING_CONTROL_BYTES = 16;

export const encodeFrame = (message: unknown): Buffer => {
  const body = Buffer.from(JSON.stringify(message), 'utf8');
  const header = Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, 'latin1');
  return Buffer.concat([header, body]);
};

export class FrameError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FrameError';
  }
}

/** 增量解码：TCP/管道式的分片输入，一次 push 可能返回 0..n 条消息。 */
export class FrameDecoder {
  #inbox: Buffer = Buffer.alloc(0);

  push(chunk: Uint8Array): unknown[] {
    this.#inbox = Buffer.concat([this.#inbox, Buffer.from(chunk)]);
    const messages: unknown[] = [];
    for (;;) {
      const headerEnd = this.#inbox.indexOf(HEADER_END);
      if (headerEnd === -1) return messages;
      const header = this.#inbox.subarray(0, headerEnd).toString('latin1');
      const match = /Content-Length:\s*(\d+)/i.exec(header);
      if (!match) {
        // 不是 LSP 帧：丢掉这段头，继续找下一个。
        this.#inbox = this.#inbox.subarray(headerEnd + HEADER_END.length);
        continue;
      }
      const bodyEnd = headerEnd + HEADER_END.length + Number(match[1]);
      if (this.#inbox.length < bodyEnd) return messages;
      const body = this.#inbox.subarray(headerEnd + HEADER_END.length, bodyEnd).toString('utf8');
      this.#inbox = this.#inbox.subarray(bodyEnd);
      try {
        messages.push(JSON.parse(body));
      } catch {
        throw new FrameError(`无法解析的 LSP 帧: ${body.slice(0, 200)}`);
      }
    }
  }
}

export interface RingStats {
  readonly write: number;
  readonly read: number;
  readonly closed: boolean;
}

export class RingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RingError';
  }
}

/**
 * 宿主侧写入端。控制区 16 字节（ctrl[0]=write、ctrl[1]=read、ctrl[2]=closed），
 * 负载区长度必须与控制区声明一致，避免「参数传空/传错」导致越界。
 */
export class RingWriter {
  readonly #control: Int32Array;
  readonly #bytes: Uint8Array;
  readonly #capacity: number;
  readonly #range: number;

  constructor(buffer: SharedArrayBuffer, capacity: number) {
    if (!Number.isInteger(capacity) || capacity <= 0)
      throw new RingError(`capacity 非法: ${capacity}`);
    if (buffer.byteLength !== RING_CONTROL_BYTES + capacity) {
      throw new RingError(`缓冲区大小 ${buffer.byteLength} != ${RING_CONTROL_BYTES} + ${capacity}`);
    }
    this.#capacity = capacity;
    this.#range = Math.floor(2 ** 32 / capacity) * capacity;
    this.#control = new Int32Array(buffer, 0, 4);
    this.#bytes = new Uint8Array(buffer, RING_CONTROL_BYTES);
  }

  get capacity(): number {
    return this.#capacity;
  }

  stats(): RingStats {
    return {
      write: Atomics.load(this.#control, 0),
      read: Atomics.load(this.#control, 1),
      closed: Atomics.load(this.#control, 2) === 1,
    };
  }

  write(frame: Uint8Array): void {
    if (frame.length === 0) throw new RingError('不能写空帧');
    if (frame.length > this.#capacity)
      throw new RingError(`帧 ${frame.length} 超过缓冲区 ${this.#capacity}`);
    const write = Atomics.load(this.#control, 0) >>> 0;
    const read = Atomics.load(this.#control, 1) >>> 0;
    const used = (write - read + this.#range) % this.#range;
    if (frame.length > this.#capacity - used) {
      throw new RingError(
        `stdin 环形缓冲已满：需要 ${frame.length}，剩余 ${this.#capacity - used}`,
      );
    }
    const offset = write % this.#capacity;
    const first = Math.min(frame.length, this.#capacity - offset);
    this.#bytes.set(frame.subarray(0, first), offset);
    this.#bytes.set(frame.subarray(first), 0);
    Atomics.store(this.#control, 0, (write + frame.length) % this.#range);
    Atomics.notify(this.#control, 0);
  }

  close(): void {
    Atomics.store(this.#control, 2, 1);
    Atomics.notify(this.#control, 0);
  }
}
