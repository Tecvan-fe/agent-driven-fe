/**
 * 事件解析:把已验签的 webhook payload 规范化为 {@link ParsedComment}。
 * 只受理两类事件的 created 动作,且必须发生在 PR 上;其余一律返回 undefined。
 *
 * - issue_comment:PR 会话评论。GitHub 把 PR 视作特殊 issue,故 PR 的会话评论
 *   走 issue_comment 事件;payload 里 issue 带 pull_request 字段才是 PR。
 *   此事件**不含 head 分支**,branch 留 undefined,由 worker 用 gh 兜底解析。
 * - pull_request_review_comment:PR diff 上的行内评论,payload 直接带
 *   pull_request.head.ref(分支)与被评论的文件路径、行号。
 */
import type { CommentEventKind, ParsedComment } from './types.js';

/** 安全取嵌套字段,任一层不是对象即返回 undefined。 */
function get(obj: unknown, ...path: string[]): unknown {
  let cur: unknown = obj;
  for (const key of path) {
    if (typeof cur !== 'object' || cur === null) {
      return undefined;
    }
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

function asString(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

function asNumber(v: unknown): number | undefined {
  return typeof v === 'number' ? v : undefined;
}

/**
 * 解析事件。
 *
 * @param eventName X-GitHub-Event 头的值(issue_comment / pull_request_review_comment / …)。
 * @param payload 已 JSON.parse 的 webhook body。
 * @returns 命中的 PR 评论 → ParsedComment;非目标事件/非 PR/缺字段 → undefined。
 */
export function parseEvent(eventName: string, payload: unknown): ParsedComment | undefined {
  if (asString(get(payload, 'action')) !== 'created') {
    return undefined;
  }

  if (eventName === 'issue_comment') {
    // 必须是 PR:issue 上带 pull_request 字段才算。
    if (get(payload, 'issue', 'pull_request') === undefined) {
      return undefined;
    }
    return build(
      'issue_comment',
      asNumber(get(payload, 'issue', 'number')),
      undefined,
      asString(get(payload, 'comment', 'body')),
      asString(get(payload, 'comment', 'user', 'login')),
      asNumber(get(payload, 'comment', 'id')),
      undefined,
      undefined,
    );
  }

  if (eventName === 'pull_request_review_comment') {
    return build(
      'pull_request_review_comment',
      asNumber(get(payload, 'pull_request', 'number')),
      asString(get(payload, 'pull_request', 'head', 'ref')),
      asString(get(payload, 'comment', 'body')),
      asString(get(payload, 'comment', 'user', 'login')),
      asNumber(get(payload, 'comment', 'id')),
      asString(get(payload, 'comment', 'path')),
      asNumber(get(payload, 'comment', 'line')),
    );
  }

  return undefined;
}

/** 组装 ParsedComment;缺 prNumber / body / commentId 等关键字段则视为无效,返回 undefined。 */
function build(
  kind: CommentEventKind,
  prNumber: number | undefined,
  branch: string | undefined,
  body: string | undefined,
  authorLogin: string | undefined,
  commentId: number | undefined,
  path: string | undefined,
  line: number | undefined,
): ParsedComment | undefined {
  if (prNumber === undefined || body === undefined || commentId === undefined) {
    return undefined;
  }
  return {
    kind,
    prNumber,
    branch,
    body,
    authorLogin: authorLogin ?? 'unknown',
    commentId,
    path,
    line,
  };
}
