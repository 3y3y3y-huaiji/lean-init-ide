/**
 * 资产上传脚本的参数与环境变量解析。
 *
 * GitHub Actions 会把未配置的 secret 注入成空字符串，而 `??` 只对
 * null/undefined 生效；如果直接 `env.R2_BUCKET ?? manifest.bucket`，
 * 空串会把清单里的 bucket 顶掉。这里统一按“非空字符串”取第一个有效值。
 */

/** 返回第一个非空（trim 后）字符串；全部为空时返回 undefined。 */
export const firstNonEmpty = (...values) => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim() !== '') return value.trim();
  }
  return undefined;
};

/**
 * 合并 CLI、环境变量与清单里的 S3 配置。
 * 校验失败直接抛错，避免上传脚本静默跳过全部对象。
 */
export const resolveUploadConfig = ({ s3, local, cli = {}, env = {}, manifest = {} }) => {
  const profile = firstNonEmpty(cli.profile, env.AWS_PROFILE);
  const endpoint = firstNonEmpty(cli.endpoint, env.R2_ENDPOINT);
  const bucket = firstNonEmpty(cli.bucket, env.R2_BUCKET, manifest.bucket);

  if (s3 && local) throw new Error('--s3 不能与 --local 同时使用');
  if (s3 && !profile && !endpoint) {
    throw new Error('--s3 需要 AWS_PROFILE 或 R2_ENDPOINT（见 assets.env 模板）');
  }
  if (s3 && !bucket) {
    throw new Error('--s3 需要 bucket：--bucket、R2_BUCKET 或 manifest.bucket');
  }

  return { s3, local, profile, endpoint, bucket };
};
