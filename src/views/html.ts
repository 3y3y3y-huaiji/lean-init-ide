export const escapeHtml = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

const inlineCodeClass =
  'rounded bg-panel-soft px-1 py-0.5 font-mono text-[0.92em] leading-normal text-fg';

/**
 * 课程正文用反引号标注行内代码。先转义再只配对成对的反引号：
 * 未闭合的反引号按普通文本输出，避免把作者笔误放大成半截 HTML。
 */
export const renderInlineCode = (value: string): string =>
  escapeHtml(value).replace(
    /`([^`\n]+)`/g,
    (_match, code: string) => `<code class="${inlineCodeClass}">${code}</code>`,
  );
