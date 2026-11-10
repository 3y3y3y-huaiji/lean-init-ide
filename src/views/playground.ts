import { createLeanPanel } from '../components/lean-panel';
import type { Locale } from '../i18n';

const DEFAULT_CODE = `def bad : Nat := true

theorem add_comm (a b : Nat) : a + b = b + a := by
  induction a with
  | zero => simp
  | succ a ih => simp [Nat.succ_add, ih]

#check Nat.add
`;

export const renderPlayground = (): string => '<div class="playground-page"></div>';

export const mountPlayground = (root: HTMLElement, locale: Locale) => {
  const host = root.querySelector<HTMLElement>('.playground-page');
  if (!host) return;
  createLeanPanel(host, { variant: 'full', code: DEFAULT_CODE, locale, autoStart: true });
};
