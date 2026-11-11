/**
 * Cloudflare for SaaS 自定义主机名的穿透回退源。
 *
 * www.criticalthinking.de5.net 走阿里云分线路优选进入 Cloudflare 后，
 * 由这个 Worker 接管请求并反代 Pages 默认域，避免回退源再指向另一个
 * 橙云代理域名而触发 Error 1000 (DNS points to prohibited IP)。
 *
 * 根域 criticalthinking.de5.net 是 Pages 自定义域，路径不匹配本 Worker 的
 * 路由，因此完全不受影响。
 */
const UPSTREAM_HOST = 'lean-init-ide.pages.dev';

export default {
  async fetch(request) {
    const url = new URL(request.url);
    url.protocol = 'https:';
    url.host = UPSTREAM_HOST;
    return fetch(new Request(url, request));
  },
};
