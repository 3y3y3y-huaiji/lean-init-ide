import { describe, expect, it, vi } from 'vitest';
import { messagesFor } from '../i18n';
import {
  diagnosticBadgeClass,
  diagnosticLocationClass,
  panelClass,
  renderLeanMarkup,
  showEditorLoadFailure,
} from './lean-markup';

describe('renderLeanMarkup', () => {
  it('全屏变体输出稳定视口单位与静态水合标记', () => {
    const html = renderLeanMarkup('zh', 'full', messagesFor('zh').playground);
    expect(html).toContain('data-ssr-markup="full"');
    expect(html).toContain(`>${messagesFor('zh').playground.title}</h1>`);
    expect(html).toContain('data-role="editor"');
    // 编辑器容器不能有 paint/layout containment，否则 hover 浮层会被裁剪。
    expect(html).not.toContain('[contain:');
    expect(html).toContain('data-role="editor-loading"');
    expect(html).toContain('role="status"');
    expect(html).toContain(messagesFor('zh').playground.editorLoading);
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

  it('库菜单提供启动默认勾选与独立的全部释放按钮', () => {
    const t = messagesFor('zh').playground;
    const html = renderLeanMarkup('zh', 'full', t);
    expect(html).toContain('data-library-default="std"');
    expect(html).toContain('data-library-default="batteries"');
    expect(html).toContain(`aria-label="${t.libraryDefault}"`);
    expect(html).toContain('data-role="release-all-libraries"');
    expect(html).toContain(t.libraryReleaseAll);
    // 单个库的释放按钮仍然存在，释放全部是独立控件。
    expect(html).toContain('data-library="std"');
  });

  it('完整变体提供默认 wasm32、实验性 wasm64 手动切换及醒目警告说明', () => {
    const t = messagesFor('zh').playground;
    const html = renderLeanMarkup('zh', 'full', t);
    expect(html).toContain('data-role="runtime-arch"');
    expect(html).toContain('data-runtime-arch="wasm32"');
    expect(html).toContain('data-runtime-arch="wasm64"');
    expect(html).toContain(t.runtimeExperimentalWarning);
    expect(html).toContain('data-active="true"');
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

  it('showEditorLoadFailure 展示错误提示与可重试按钮并更新状态胶囊', () => {
    const t = messagesFor('zh').playground;
    document.body.innerHTML = renderLeanMarkup('zh', 'full', t);
    const retry = vi.fn();

    showEditorLoadFailure(document.body, t, retry);

    const status = document.body.querySelector<HTMLElement>('[data-role="status"]')!;
    const loading = document.body.querySelector<HTMLElement>('[data-role="editor-loading"]')!;
    const btn = document.body.querySelector<HTMLButtonElement>('[data-role="retry-editor"]')!;

    expect(status.dataset.state).toBe('error');
    expect(status.textContent).toContain(t.editorLoadFailed);
    expect(loading.getAttribute('aria-busy')).toBe('false');
    expect(loading.textContent).toContain(t.editorLoadFailed);

    btn.click();
    btn.click();
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('showEditorLoadFailure 在缺少 loading 节点时仍安全退出', () => {
    const host = document.createElement('div');
    expect(() => showEditorLoadFailure(host, messagesFor('en').playground, vi.fn())).not.toThrow();
  });
});
