/**
 * 页面级 SEO/分享元信息：canonical、og:url、og:locale，以及中英文 hreflang。
 *
 * 站点是 SPA，一条 index.html 服务所有路由，所以这些标签在 boot 时按当前路由补齐；
 * 静态文件里只放语言无关的默认值。
 */
export const SITE_ORIGIN = 'https://criticalthinking.de5.net';

type MetaOptions = {
  locale: 'zh' | 'en';
  /** location.pathname，形如 /zh/learn/first-proof。 */
  pathname: string;
  title: string;
};

const ensureLink = (doc: Document, rel: string, hreflang?: string): HTMLLinkElement => {
  const selector = hreflang ? `link[rel="${rel}"][hreflang="${hreflang}"]` : `link[rel="${rel}"]`;
  const existing = doc.head.querySelector<HTMLLinkElement>(selector);
  if (existing) return existing;
  const link = doc.createElement('link');
  link.rel = rel;
  if (hreflang) link.hreflang = hreflang;
  doc.head.append(link);
  return link;
};

const ensureMeta = (
  doc: Document,
  attribute: 'property' | 'name',
  key: string,
): HTMLMetaElement => {
  const selector = `meta[${attribute}="${key}"]`;
  const existing = doc.head.querySelector<HTMLMetaElement>(selector);
  if (existing) return existing;
  const meta = doc.createElement('meta');
  meta.setAttribute(attribute, key);
  doc.head.append(meta);
  return meta;
};

/** 把 /zh/... 与 /en/... 互换，用于 hreflang。 */
export const swapLocalePath = (pathname: string, locale: 'zh' | 'en'): string => {
  const other = locale === 'zh' ? 'en' : 'zh';
  const rest = pathname.replace(/^\/(?:zh|en)(?=\/|$)/, '');
  return `/${other}${rest || '/'}`;
};

export const applyPageMeta = (doc: Document, options: MetaOptions): void => {
  const canonical = `${SITE_ORIGIN}${options.pathname}`;
  ensureLink(doc, 'canonical').href = canonical;

  ensureMeta(doc, 'property', 'og:url').content = canonical;
  ensureMeta(doc, 'property', 'og:title').content = options.title;
  ensureMeta(doc, 'property', 'og:locale').content = options.locale === 'zh' ? 'zh_CN' : 'en_US';

  for (const locale of ['zh', 'en'] as const) {
    const link = ensureLink(doc, 'alternate', locale);
    link.href = `${SITE_ORIGIN}${locale === options.locale ? options.pathname : swapLocalePath(options.pathname, options.locale)}`;
  }
};
