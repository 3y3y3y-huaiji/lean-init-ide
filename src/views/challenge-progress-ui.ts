/**
 * 趣味挑战列表与详情页共用的战绩展示及 JSON 导入导出组件。
 */
import {
  exportChallengeProgressJson,
  importChallengeProgressJson,
  type ChallengeProgressStore,
  type ChallengeRecord,
} from '../challenge-progress';
import { toolbarButtonClass } from '../components/ui';
import type { ProofBadge } from '../exercise';
import type { Messages } from '../i18n/types';
import { escapeHtml } from './html';

export type ChallengeMessages = Messages['challenges'];

export const badgeLabel = (t: ChallengeMessages, badge: ProofBadge): string =>
  badge === 'automation'
    ? t.badgeLabels.automation
    : badge === 'handcrafted'
      ? t.badgeLabels.handcrafted
      : t.badgeLabels.termMode;

/** 合并展示流派勋章与悬赏层数；均为空但已通关时回退「已通关」。 */
export const formatCardBadges = (t: ChallengeMessages, record: ChallengeRecord): string => {
  if (!record.solved) return '';
  const items = [
    ...record.badges.map((badge) => badgeLabel(t, badge)),
    ...record.tiers.map((tier) => t.detail.tierLabels[tier]),
  ];
  return items.length > 0 ? items.join(' · ') : t.cardSolved;
};

/** 详情页题干下方与战绩复盘使用的单题战绩摘要。 */
export const formatRecordSummary = (t: ChallengeMessages, record: ChallengeRecord): string => {
  const badges = formatCardBadges(t, record);
  if (!badges) return '';
  return record.bestChars !== null ? `${badges} · ${t.cardBestChars(record.bestChars)}` : badges;
};

export const renderProgressBackup = (t: ChallengeMessages): string => `
  <div data-role="progress-backup" class="ml-auto flex flex-wrap items-center gap-2 font-normal">
    <button type="button" class="${toolbarButtonClass}" data-role="export-progress">${escapeHtml(t.backup.exportButton)}</button>
    <button type="button" class="${toolbarButtonClass}" data-role="import-progress">${escapeHtml(t.backup.importButton)}</button>
    <input type="file" accept=".json,application/json" data-role="progress-import-input" hidden />
    <span
      data-role="progress-backup-status"
      role="status"
      aria-live="polite"
      class="text-xs text-muted"
      hidden
    ></span>
  </div>
`;

const setBackupStatus = (el: HTMLElement | null, text: string, ok: boolean) => {
  if (!el) return;
  el.textContent = text;
  el.className = `text-xs ${ok ? 'text-ok' : 'text-err'}`;
  el.hidden = false;
};

const triggerJsonDownload = (json: string, filename: string) => {
  if (typeof URL.createObjectURL !== 'function') return;
  const blob = new Blob([json], { type: 'application/json' });
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(href);
};

export const bindProgressBackup = (
  root: HTMLElement,
  t: ChallengeMessages,
  store: ChallengeProgressStore,
  onImported: () => void,
): void => {
  const exportBtn = root.querySelector<HTMLButtonElement>('[data-role="export-progress"]');
  const importBtn = root.querySelector<HTMLButtonElement>('[data-role="import-progress"]');
  const importInput = root.querySelector<HTMLInputElement>('[data-role="progress-import-input"]');
  const statusEl = root.querySelector<HTMLElement>('[data-role="progress-backup-status"]');

  exportBtn?.addEventListener('click', () => {
    const json = exportChallengeProgressJson(store);
    triggerJsonDownload(json, 'lean-arcade-progress.json');
    setBackupStatus(statusEl, t.backup.exported, true);
  });

  importBtn?.addEventListener('click', () => {
    if (!importInput) return;
    importInput.value = '';
    importInput.click();
  });

  importInput?.addEventListener('change', async () => {
    const file = importInput.files?.[0];
    if (!file) return;
    let raw: string;
    try {
      raw = await file.text();
    } catch {
      setBackupStatus(statusEl, t.backup.importFailed, false);
      return;
    }
    if (!importChallengeProgressJson(raw, store)) {
      setBackupStatus(statusEl, t.backup.importFailed, false);
      return;
    }
    onImported();
    setBackupStatus(statusEl, t.backup.imported, true);
  });
};
