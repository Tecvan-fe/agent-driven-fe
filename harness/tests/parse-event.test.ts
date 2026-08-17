/**
 * 事件解析单测:两类事件的 fixture payload → 抽出 PR 号/分支/文件/行号;
 * 非 created 动作、非 PR 的 issue、无关事件一律返回 undefined。
 */
import { describe, expect, it } from 'vitest';
import { parseEvent } from '../src/parse-event.js';

describe('parseEvent', () => {
  it('issue_comment(PR 上)→ 取 PR 号,分支留空待兜底', () => {
    const payload = {
      action: 'created',
      issue: { number: 7, pull_request: { url: 'https://api.github.com/…/pulls/7' } },
      comment: { id: 555, body: '@claude 改一下', user: { login: 'Tecvan-fe' } },
    };
    const parsed = parseEvent('issue_comment', payload);
    expect(parsed).toBeDefined();
    expect(parsed?.kind).toBe('issue_comment');
    expect(parsed?.prNumber).toBe(7);
    expect(parsed?.branch).toBeUndefined();
    expect(parsed?.commentId).toBe(555);
    expect(parsed?.body).toBe('@claude 改一下');
  });

  it('issue_comment 但不是 PR(无 pull_request 字段)→ undefined', () => {
    const payload = {
      action: 'created',
      issue: { number: 9 },
      comment: { id: 1, body: '@claude', user: { login: 'x' } },
    };
    expect(parseEvent('issue_comment', payload)).toBeUndefined();
  });

  it('pull_request_review_comment → 取分支/文件/行号', () => {
    const payload = {
      action: 'created',
      pull_request: { number: 7, head: { ref: 'docs/0002-design' } },
      comment: {
        id: 888,
        body: '@claude 这一行改成小写',
        user: { login: 'Tecvan-fe' },
        path: 'src/report.ts',
        line: 42,
      },
    };
    const parsed = parseEvent('pull_request_review_comment', payload);
    expect(parsed?.kind).toBe('pull_request_review_comment');
    expect(parsed?.prNumber).toBe(7);
    expect(parsed?.branch).toBe('docs/0002-design');
    expect(parsed?.path).toBe('src/report.ts');
    expect(parsed?.line).toBe(42);
  });

  it('非 created 动作(如 edited)→ undefined', () => {
    const payload = {
      action: 'edited',
      issue: { number: 7, pull_request: {} },
      comment: { id: 1, body: '@claude', user: { login: 'x' } },
    };
    expect(parseEvent('issue_comment', payload)).toBeUndefined();
  });

  it('无关事件名 → undefined', () => {
    expect(parseEvent('push', { action: 'created' })).toBeUndefined();
  });

  it('缺关键字段(无 comment.id)→ undefined', () => {
    const payload = {
      action: 'created',
      issue: { number: 7, pull_request: {} },
      comment: { body: '@claude', user: { login: 'x' } },
    };
    expect(parseEvent('issue_comment', payload)).toBeUndefined();
  });
});
