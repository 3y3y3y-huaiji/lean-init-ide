#!/usr/bin/env node
/**
 * 校验 config/lean4-runtime.json 的结构约束。
 *
 * 这份清单同时被 Pages Function、Service Worker、构建期下载脚本和上传脚本消费，
 * 任何字段漂移都会在运行时才炸，所以放在 CI 最前面拦下来。
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = resolve(root, 'config/lean4-runtime.json');
const raw = await readFile(manifestPath, 'utf8');

/** @type {string[]} */
const errors = [];
const fail = (message) => errors.push(message);

let manifest;
try {
  manifest = JSON.parse(raw);
} catch (error) {
  console.error(`无法解析 ${manifestPath}: ${error.message}`);
  process.exit(1);
}

const isNonEmptyString = (value) => typeof value === 'string' && value.trim() !== '';
const isHttps = (value) => typeof value === 'string' && value.startsWith('https://');

if (!isNonEmptyString(manifest.cacheKey)) fail('cacheKey 必须是非空字符串');

for (const branch of ['primary', 'fallback']) {
  const source = manifest[branch];
  if (!source || typeof source !== 'object') {
    fail(`${branch} 缺失`);
    continue;
  }
  if (!isNonEmptyString(source.label)) fail(`${branch}.label 必须是非空字符串`);
  if (!isNonEmptyString(source.baseUrl)) fail(`${branch}.baseUrl 必须是非空字符串`);
}

if (manifest.primary?.baseUrl) {
  const base = manifest.primary.baseUrl;
  if (!base.startsWith('/') || base.startsWith('//')) {
    fail(`primary.baseUrl 必须是同源相对路径，实际为 ${base}`);
  }
}

if (manifest.fallback?.baseUrl && !isHttps(manifest.fallback.baseUrl)) {
  fail(`fallback.baseUrl 必须是 https 地址，实际为 ${manifest.fallback.baseUrl}`);
}

const assets = manifest.assets;
if (!Array.isArray(assets) || assets.length === 0) {
  fail('assets 必须是非空数组');
} else {
  const keys = new Set();
  const sources = new Set();

  for (const [index, asset] of assets.entries()) {
    const label = asset?.key ? `assets[${index}] (${asset.key})` : `assets[${index}]`;

    for (const field of ['name', 'key', 'contentType']) {
      if (!isNonEmptyString(asset?.[field])) fail(`${label}.${field} 必须是非空字符串`);
    }

    // 资产要么来自远端（source），要么来自仓库内（local），至少要有一个。
    if (!isNonEmptyString(asset?.source) && !isNonEmptyString(asset?.local)) {
      fail(`${label} 必须提供 source 或 local`);
    }

    if (!Number.isSafeInteger(asset?.bytes) || asset.bytes <= 0) {
      fail(`${label}.bytes 必须是正整数`);
    }

    if (!/^[0-9a-f]{64}$/.test(asset?.sha256 ?? '')) {
      fail(`${label}.sha256 必须是 64 位小写十六进制`);
    }

    if (!(asset?.contentType ?? '').includes('/')) {
      fail(`${label}.contentType 缺少 MIME 主/子类型`);
    }

    const key = asset?.key;
    if (typeof key === 'string') {
      if (key.startsWith('/')) fail(`${label}.key 不能以 / 开头`);
      if (key.includes('..')) fail(`${label}.key 不能包含 ..`);
      if (key.includes('\\')) fail(`${label}.key 不能包含反斜杠`);
      if (keys.has(key)) fail(`${label}.key 重复`);
      keys.add(key);
    }

    const source = asset?.source;
    if (typeof source === 'string') {
      if (sources.has(source)) fail(`${label}.source 与其它资产重复`);
      sources.add(source);
    }

    // 仓库内资产（local）直接比对字节与哈希：格式化、换行符转换都会让它们漂移。
    if (isNonEmptyString(asset?.local)) {
      const localPath = resolve(root, asset.local);
      let data;
      try {
        data = await readFile(localPath);
      } catch {
        console.log(`提示：${asset.local} 不存在，跳过本地字节校验`);
        continue;
      }

      if (data.length !== asset.bytes) {
        fail(`${label} 本地文件应为 ${asset.bytes} 字节，实际 ${data.length} 字节`);
      } else {
        const digest = createHash('sha256').update(data).digest('hex');
        if (digest !== asset.sha256) {
          fail(`${label} 本地文件 SHA-256 与清单不一致，实际 ${digest}`);
        }
      }
    }
  }
}

if (errors.length > 0) {
  console.error(`资产清单校验失败（${errors.length} 项）：`);
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

const totalBytes = assets.reduce((sum, asset) => sum + asset.bytes, 0);
console.log(
  `资产清单校验通过：${assets.length} 个资产，共 ${(totalBytes / 1024 / 1024).toFixed(2)} MiB，cacheKey=${manifest.cacheKey}`,
);
