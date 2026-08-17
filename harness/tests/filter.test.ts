/**
 * 受理判定单测:验证防循环的两个信号——含触发词才受理、含机器标记必拒。
 * 这是共享身份下不自激的关键,受理矩阵必须全覆盖。
 */
import { describe, expect, it } from 'vitest';
import { shouldAccept } from '../src/filter.js';
import type { BotIdentity, ParsedComment } from '../src/types.js';

const BOT: BotIdentity = {
  login: 'Tecvan-fe',
  triggerWord: '@claude',
  replyMarker: '<!-- agent-reply -->',
  replyPrefix: '🤖 [agent]',
};

/** 造一条 ParsedComment,只关心 body,其余给默认值。 */
function comment(body: string): ParsedComment {
  return {
    kind: 'issue_comment',
    prNumber: 7,
    branch: undefined,
    body,
    authorLogin: 'Tecvan-fe',
    commentId: 123,
    path: undefined,
    line: undefined,
  };
}

describe('shouldAccept', () => {
  it('含触发词、不含机器标记 → 受理', () => {
    expect(shouldAccept(comment('@claude 请把标题改成小写'), BOT).accept).toBe(true);
  });

  it('不含触发词 → 拒绝', () => {
    const v = shouldAccept(comment('这个改动看起来不错'), BOT);
    expect(v.accept).toBe(false);
    expect(v.reason).toContain('触发词');
  });

  it('含机器标记 → 拒绝(即使同时含触发词也拦下,防自激)', () => {
    const body = '🤖 [agent] 已按 @claude 的要求改好\n\n<!-- agent-reply -->';
    const v = shouldAccept(comment(body), BOT);
    expect(v.accept).toBe(false);
    expect(v.reason).toContain('机器');
  });

  it('机器标记优先于触发词判定(标记命中直接拒,不再看触发词)', () => {
    // 一条既含触发词又含标记的评论:标记这一关先拦,不放行。
    const body = '@claude <!-- agent-reply -->';
    expect(shouldAccept(comment(body), BOT).accept).toBe(false);
  });

  it('触发词作为子串出现即算命中(如 @claudexyz)', () => {
    // includes 语义:只要正文包含触发词子串就受理;这是刻意的宽松匹配。
    expect(shouldAccept(comment('cc @claudexyz'), BOT).accept).toBe(true);
  });
});
