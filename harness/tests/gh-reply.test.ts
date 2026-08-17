/**
 * 回帖加工单测:验证防循环的另一半——加工后的回帖既带机器标记、又已剥离触发词,
 * 从而回到 webhook 时被 filter 双重拦下。与 filter.test 合起来覆盖完整回路。
 */
import { describe, expect, it } from 'vitest';
import { decorateReply } from '../src/gh-reply.js';
import { shouldAccept } from '../src/filter.js';
import type { BotIdentity, ParsedComment } from '../src/types.js';

const BOT: BotIdentity = {
  login: 'Tecvan-fe',
  triggerWord: '@claude',
  replyMarker: '<!-- agent-reply -->',
  replyPrefix: '🤖 [agent]',
};

describe('decorateReply', () => {
  it('加前缀、追加机器标记', () => {
    const out = decorateReply('已改好', BOT);
    expect(out.startsWith('🤖 [agent]')).toBe(true);
    expect(out.includes('<!-- agent-reply -->')).toBe(true);
  });

  it('剥离正文里的触发词', () => {
    const out = decorateReply('已按 @claude 的要求改好', BOT);
    expect(out.includes('@claude')).toBe(false);
  });

  it('加工后的回帖回到 filter 会被拒绝(闭环不自激)', () => {
    const replyBody = decorateReply('@claude 已改好并推送', BOT);
    const asComment: ParsedComment = {
      kind: 'issue_comment',
      prNumber: 7,
      branch: undefined,
      body: replyBody,
      authorLogin: 'Tecvan-fe',
      commentId: 999,
      path: undefined,
      line: undefined,
    };
    expect(shouldAccept(asComment, BOT).accept).toBe(false);
  });
});
