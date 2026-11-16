import { describe, expect, it } from 'vitest';
import { messagesFor } from '../i18n';
import {
  diagnosticBadgeClass,
  diagnosticLocationClass,
  panelClass,
  renderLeanMarkup,
} from './lean-markup';

describe('renderLeanMarkup', () => {
  it('全屏变体输出稳定视口单位、strict containment 与静态水合标记', () => {
    const html = renderLeanMarkup('zh', 'full', messagesFor('zh').playground);
    expect(html).toContain('data-ssr-markup="full"');
    expect(html).toContain(`>${messagesFor('zh').playground.title}</h1>`);
    expect(html).toContain('data-role="editor"');
    expect(html).toContain('[contain:strict]');
    expect(html).toContain('100svh');
    expect(html).not.toContain('100dvh');
    expect(html).not.toContain('52dvh');
  });

  it('全屏变体带手机端全选/复制/粘贴工具栏，紧凑变体不渲染', () => {
    const full = renderLeanMarkup('zh', 'full', messagesFor('zh').playground);
    expect(full).toContain('data-role="mobile-actions"');
    expect(full).toContain('data-role="select-all"');
    expect(full).toContain('data-role="copy-selection"');
    expect(full).toContain('data-role="paste"');
    expect(full).toContain(messagesFor('zh').playground.selectAll);

    const compact = renderLeanMarkup('zh', 'compact', messagesFor('zh').playground);
    expect(compact).not.toContain('data-role="mobile-actions"');
  });

  it('带 lessonSlug 时在全屏工具栏渲染回到本课链接并编码 slug', () => {
    const html = renderLeanMarkup('en', 'full', messagesFor('en').playground, 'first proof');
    expect(html).toContain('href="/en/learn/first%20proof"');
    expect(html).toContain(messagesFor('en').playground.backToLesson);
  });

  it('紧凑变体包含垂直拖动条、折叠日志区和打开完整编辑器链接', () => {
    const html = renderLeanMarkup('zh', 'compact', messagesFor('zh').playground);
    expect(html).toContain('data-ssr-markup="compact"');
    expect(html).toContain('data-role="resize"');
    expect(html).toContain('<details data-panel="log"');
    expect(html).toContain('href="/zh/playground"');
  });

  it('按诊断级别区分位置与徽章样式', () => {
    expect(diagnosticLocationClass(1)).toContain('text-err');
    expect(diagnosticLocationClass(2)).toContain('text-warn');
    expect(diagnosticLocationClass(3)).toContain('text-accent');
    expect(diagnosticBadgeClass(undefined)).toContain('text-err');
    expect(diagnosticBadgeClass(2)).toContain('text-warn');
    expect(diagnosticBadgeClass(4)).toContain('text-accent');
    expect(panelClass(true)).toContain('max-h-[150px]');
    expect(panelClass(false)).toContain('max-[900px]:max-h-[320px]');
  });
});
