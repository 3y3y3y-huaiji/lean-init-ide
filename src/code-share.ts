/**
 * 零后端代码分享编解码：将编辑器 Lean 代码通过浏览器原生 `CompressionStream('deflate-raw')`
 * 与 Base64URL 编码到 URL hash（`#codez=...`；若运行环境不支持 CompressionStream 则降级 `#code=...`）。
 */

export const MAX_SHARE_CODE_BYTES = 32 * 1024;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const toBase64Url = (bytes: Uint8Array): string => {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};

const fromBase64Url = (encoded: string): Uint8Array | null => {
  if (!/^[A-Za-z0-9_-]+$/.test(encoded)) return null;
  const padded = encoded
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(encoded.length / 4) * 4, '=');
  try {
    const binary = atob(padded);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      out[i] = binary.charCodeAt(i);
    }
    return out;
  } catch {
    return null;
  }
};

const transformStreamBytes = async (
  input: Uint8Array,
  stream: CompressionStream | DecompressionStream,
): Promise<Uint8Array> => {
  const writer = stream.writable.getWriter();
  const writePromise = writer.write(input as BufferSource).then(() => writer.close());
  const chunks: Uint8Array[] = [];
  const reader = stream.readable.getReader();
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.byteLength;
    if (total > MAX_SHARE_CODE_BYTES * 4) {
      await reader.cancel();
      throw new Error('decompressed payload too large');
    }
  }
  await writePromise;
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
};

/** 将代码编码为 `#codez=...`（deflate-raw）或 `#code=...`（UTF-8 Base64URL）。 */
export const encodeSharedCode = async (code: string): Promise<string> => {
  const raw = encoder.encode(code);
  if (raw.byteLength > MAX_SHARE_CODE_BYTES) {
    throw new Error(`Code exceeds ${MAX_SHARE_CODE_BYTES} bytes`);
  }
  if (typeof CompressionStream === 'function') {
    const compressed = await transformStreamBytes(raw, new CompressionStream('deflate-raw'));
    return `#codez=${toBase64Url(compressed)}`;
  }
  return `#code=${toBase64Url(raw)}`;
};

/** 从 URL hash 解码分享代码；无效、损坏或超长时安全返回 null。 */
export const decodeSharedCode = async (hash: string): Promise<string | null> => {
  const normalized = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!normalized) return null;

  if (normalized.startsWith('code=')) {
    const bytes = fromBase64Url(normalized.slice('code='.length));
    if (!bytes || bytes.byteLength > MAX_SHARE_CODE_BYTES) return null;
    return decoder.decode(bytes);
  }

  if (normalized.startsWith('codez=')) {
    if (typeof DecompressionStream !== 'function') return null;
    const compressed = fromBase64Url(normalized.slice('codez='.length));
    if (!compressed || compressed.byteLength > MAX_SHARE_CODE_BYTES) return null;
    try {
      const raw = await transformStreamBytes(compressed, new DecompressionStream('deflate-raw'));
      if (raw.byteLength > MAX_SHARE_CODE_BYTES) return null;
      return decoder.decode(raw);
    } catch {
      return null;
    }
  }

  return null;
};

/** 构造可分享的 Playground 链接，清除 ?lesson / ?challenge 参数避免覆盖分享代码。 */
export const buildShareUrl = async (code: string, currentHref: string): Promise<string> => {
  const url = new URL(currentHref);
  url.searchParams.delete('lesson');
  url.searchParams.delete('challenge');
  url.hash = await encodeSharedCode(code);
  return url.href;
};
