import { describe, expect, it } from 'vitest';
import { firstNonEmpty, resolveUploadConfig } from './upload-config.mjs';

const base = {
  s3: true,
  local: false,
  cli: {},
  env: { R2_ENDPOINT: 'https://example.com' },
  manifest: { bucket: 'lean4-ide-releases' },
};

describe('firstNonEmpty', () => {
  it('skips undefined, null and whitespace-only values', () => {
    expect(firstNonEmpty(undefined, null, '', '   ', 'ok')).toBe('ok');
  });

  it('returns undefined when every value is empty', () => {
    expect(firstNonEmpty(undefined, null, '', '   ')).toBeUndefined();
  });
});

describe('resolveUploadConfig', () => {
  it('ignores an empty R2_BUCKET and falls back to manifest.bucket', () => {
    expect(resolveUploadConfig({ ...base, env: { ...base.env, R2_BUCKET: '' } }).bucket).toBe(
      'lean4-ide-releases',
    );
  });

  it('prefers the CLI bucket over env and manifest', () => {
    expect(
      resolveUploadConfig({
        ...base,
        cli: { bucket: 'from-cli' },
        env: { ...base.env, R2_BUCKET: 'from-env' },
      }).bucket,
    ).toBe('from-cli');
  });

  it('uses the env bucket when the CLI value is whitespace', () => {
    expect(
      resolveUploadConfig({
        ...base,
        cli: { bucket: '   ' },
        env: { ...base.env, R2_BUCKET: 'from-env' },
      }).bucket,
    ).toBe('from-env');
  });

  it('throws when s3 has neither a profile nor an endpoint', () => {
    expect(() =>
      resolveUploadConfig({ ...base, env: { AWS_PROFILE: '', R2_ENDPOINT: '' } }),
    ).toThrow(/AWS_PROFILE|R2_ENDPOINT/);
  });

  it('throws when s3 cannot resolve a bucket', () => {
    expect(() =>
      resolveUploadConfig({
        ...base,
        env: { R2_ENDPOINT: 'https://example.com', R2_BUCKET: '' },
        manifest: {},
      }),
    ).toThrow(/bucket/);
  });

  it('rejects --s3 combined with --local', () => {
    expect(() =>
      resolveUploadConfig({
        ...base,
        local: true,
        env: { R2_ENDPOINT: 'https://example.com' },
      }),
    ).toThrow(/--local/);
  });

  it('does not require S3 credentials in gateway mode', () => {
    expect(() => resolveUploadConfig({ ...base, s3: false })).not.toThrow();
  });
});
