import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChallengeProgressStore, type ChallengeProgressBackend } from '../challenge-progress';
import { zh } from '../i18n/zh';
import {
  bindProgressBackup,
  formatCardBadges,
  formatRecordSummary,
  renderProgressBackup,
} from './challenge-progress-ui';

const memoryStore = () => {
  let raw: string | null = null;
  const backend: ChallengeProgressBackend = {
    read: () => raw,
    write: (next) => {
      raw = next;
    },
  };
  return new ChallengeProgressStore(backend);
};

describe('挑战战绩 UI 与导入导出', () => {
  const t = zh.challenges;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('格式化卡片勋章与悬赏层数，缺少两者时回退已通关文案', () => {
    expect(formatCardBadges(t, { solved: false, badges: [], tiers: [], bestChars: null })).toBe('');
    expect(formatCardBadges(t, { solved: true, badges: [], tiers: [], bestChars: null })).toBe(
      t.cardSolved,
    );
    expect(
      formatCardBadges(t, {
        solved: true,
        badges: ['automation'],
        tiers: ['bronze', 'silver'],
        bestChars: 98,
      }),
    ).toBe(
      `${t.badgeLabels.automation} · ${t.detail.tierLabels.bronze} · ${t.detail.tierLabels.silver}`,
    );
    expect(
      formatRecordSummary(t, {
        solved: true,
        badges: ['term-mode'],
        tiers: [],
        bestChars: 42,
      }),
    ).toBe(`${t.badgeLabels.termMode} · ${t.cardBestChars(42)}`);
  });

  it('支持导出 JSON 备份，并校验合法与非法导入', async () => {
    const store = memoryStore();
    store.recordRun('add-comm', { badges: ['term-mode'], codeChars: 35 });

    const createObjectURL = vi.fn(() => 'blob:lean-arcade');
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: revokeObjectURL, configurable: true });

    document.body.innerHTML = renderProgressBackup(t);
    const onImported = vi.fn();
    bindProgressBackup(document.body, t, store, onImported);

    document.body.querySelector<HTMLButtonElement>('[data-role="export-progress"]')!.click();
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:lean-arcade');
    const statusEl = document.body.querySelector<HTMLElement>(
      '[data-role="progress-backup-status"]',
    )!;
    expect(statusEl.hidden).toBe(false);
    expect(statusEl.textContent).toBe(t.backup.exported);

    const importBtn = document.body.querySelector<HTMLButtonElement>(
      '[data-role="import-progress"]',
    )!;
    const inputEl = document.body.querySelector<HTMLInputElement>(
      '[data-role="progress-import-input"]',
    )!;
    const clickSpy = vi.spyOn(inputEl, 'click');
    importBtn.click();
    expect(clickSpy).toHaveBeenCalledOnce();

    // 非法 JSON 拒绝导入，不清空现有战绩也不触发回调。
    Object.defineProperty(inputEl, 'files', {
      value: [{ text: async () => '{bad json' }],
      configurable: true,
    });
    inputEl.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(statusEl.textContent).toBe(t.backup.importFailed));
    expect(onImported).not.toHaveBeenCalled();
    expect(store.isSolved('add-comm')).toBe(true);

    // 合法 JSON 导入后刷新并更新战绩。
    Object.defineProperty(inputEl, 'files', {
      value: [
        {
          text: async () =>
            JSON.stringify({
              version: 1,
              challenges: {
                'budget-withdraw': {
                  solved: true,
                  badges: ['handcrafted'],
                  tiers: [],
                  bestChars: 120,
                },
              },
            }),
        },
      ],
      configurable: true,
    });
    inputEl.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(onImported).toHaveBeenCalledOnce());
    expect(statusEl.textContent).toBe(t.backup.imported);
    expect(store.isSolved('budget-withdraw')).toBe(true);
  });
});
