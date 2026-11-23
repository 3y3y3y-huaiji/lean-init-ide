/**
 * 站内反馈入口：把课程 / 挑战上下文带进 GitHub Issue 表单。
 *
 * 只负责拼 URL，不读 DOM 也不发请求，方便 SSG 与运行时回退共用。
 */
export const REPO_URL = 'https://github.com/lean-online/lean-init-ide';

export type FeedbackTemplate = 'lesson-bug.yml' | 'clarity-gap.yml' | 'new-puzzle.yml';

type IssueDraft = {
  title: string;
  body: string;
};

export const issueUrl = (template: FeedbackTemplate, draft: IssueDraft): string =>
  `${REPO_URL}/issues/new?template=${encodeURIComponent(template)}&title=${encodeURIComponent(
    draft.title,
  )}&body=${encodeURIComponent(draft.body)}`;
