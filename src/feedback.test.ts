import { describe, expect, it } from 'vitest';
import { issueUrl, REPO_URL } from './feedback';

describe('GitHub Issue 反馈链接', () => {
  it('指向仓库的 issue 表单并带上模板参数', () => {
    const url = issueUrl('lesson-bug.yml', { title: '题目有误', body: 'lesson: connectives' });
    expect(url.startsWith(`${REPO_URL}/issues/new?`)).toBe(true);
    expect(url).toContain(`template=${encodeURIComponent('lesson-bug.yml')}`);
  });

  it('标题与正文会被完整编码，中文和换行不会截断参数', () => {
    const url = issueUrl('clarity-gap.yml', {
      title: '[课程] 奇偶证明',
      body: 'Lesson: math-parity\nPath: /zh/learn/math-parity\n',
    });
    expect(url).toContain(`title=${encodeURIComponent('[课程] 奇偶证明')}`);
    expect(url).toContain(
      `body=${encodeURIComponent('Lesson: math-parity\nPath: /zh/learn/math-parity\n')}`,
    );
  });
});
