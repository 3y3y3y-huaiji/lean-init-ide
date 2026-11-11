import { createLeanPanel } from '../components/lean-panel';
import { messagesFor, type Locale } from '../i18n';
import { getAutoStart } from '../settings';

const DEFAULT_CODE = `def bad : Nat := true

theorem add_comm (a b : Nat) : a + b = b + a := by
  induction a with
  | zero => simp
  | succ a ih => simp only [Nat.succ_add, Nat.add_succ, ih]

#check Nat.add
`;

export const renderPlayground = (): string => '<div data-role="playground"></div>';

export const mountPlayground = (root: HTMLElement, locale: Locale) => {
  const host = root.querySelector<HTMLElement>('[data-role="playground"]');
  if (!host) return;

  // 课程页的「练习」按钮会带 ?lesson=<slug> 过来，直接载入该课的 starter。
  const slug = new URLSearchParams(location.search).get('lesson');
  const lesson = messagesFor(locale).lesson.lessons.find((item) => item.slug === slug);
  const code = lesson?.exercise?.starter ?? DEFAULT_CODE;

  createLeanPanel(host, { variant: 'full', code, locale, autoStart: getAutoStart() });
};
