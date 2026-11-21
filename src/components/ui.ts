/**
 * 共享的 Tailwind 类名片段。
 * 样式仍然写在模板里，这里只避免同一套按钮样式在多处漂移。
 */
export const buttonClass =
  'inline-flex min-h-10 max-[1024px]:min-h-11 touch:min-h-11 [font:inherit] cursor-pointer items-center justify-center rounded-[9px] border border-transparent bg-accent px-5 py-2.5 text-sm font-[650] text-accent-contrast no-underline transition hover:brightness-[1.06] disabled:cursor-progress disabled:opacity-55';

export const ghostButtonClass =
  'inline-flex min-h-9 max-[1024px]:min-h-11 touch:min-h-11 [font:inherit] cursor-pointer items-center justify-center gap-1.5 rounded-[9px] border border-line bg-transparent px-3 py-[7px] text-[13px] text-muted no-underline transition hover:border-line-strong hover:text-fg';

export const ghostButtonLgClass = `${ghostButtonClass} px-[18px] py-2.5 text-sm`;

/** 触屏与平板端工具栏的小号按钮：桌面 >=36px / 触屏与平板 >=44px，禁用态也要看得出。 */
export const toolbarButtonClass =
  'inline-flex min-h-9 max-[1024px]:min-h-11 touch:min-h-11 cursor-pointer items-center justify-center rounded-lg border border-line bg-transparent px-2.5 py-1 text-xs text-muted transition hover:border-line-strong hover:text-fg disabled:cursor-not-allowed disabled:opacity-40';
