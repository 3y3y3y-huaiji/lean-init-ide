import { createLeanPanel } from '../components/lean-panel';
import { currentMemoryTier } from '../device';
import { draftKeyFor } from '../draft';
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

  // 低内存设备忽略自动启动偏好：下载 143MB 前必须有明确的人工确认。
  createLeanPanel(host, {
    variant: 'full',
    code,
    locale,
    lessonSlug: lesson?.slug,
    draftKey: draftKeyFor(lesson?.slug),
    autoStart: getAutoStart() && currentMemoryTier() !== 'low',
  });
};
