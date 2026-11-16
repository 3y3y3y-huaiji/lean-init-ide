export type UploadConfigCli = {
  profile?: string;
  endpoint?: string;
  bucket?: string;
};

export type UploadConfigInput = {
  s3: boolean;
  local: boolean;
  cli?: UploadConfigCli;
  env?: Record<string, string | undefined>;
  manifest?: { bucket?: string };
};

export type UploadConfig = {
  s3: boolean;
  local: boolean;
  profile?: string;
  endpoint?: string;
  bucket?: string;
};

export function firstNonEmpty(...values: Array<string | null | undefined>): string | undefined;

export function resolveUploadConfig(input: UploadConfigInput): UploadConfig;
