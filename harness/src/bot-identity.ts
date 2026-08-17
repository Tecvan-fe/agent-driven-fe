/**
 * 机器身份:daemon 启动时通过 `gh api user` 取当前登录名,
 * 连同触发词、回复标记、回复前缀组成 {@link BotIdentity}。
 *
 * 回复标记设计成 HTML 注释 `<!-- agent-reply -->`——它在 GitHub 渲染后**不可见**,
 * 不污染人类阅读,却能被 filter 精确匹配拦下,防止 agent 回复回流触发自身。
 */
import type { BotIdentity } from './types.js';
import { run } from './exec.js';

/** 回复标记:HTML 注释,渲染后不可见,filter 据此识别机器回复。 */
export const REPLY_MARKER = '<!-- agent-reply -->';

/** 回复前缀:肉眼可辨是机器发的。 */
export const REPLY_PREFIX = '🤖 [agent]';

/**
 * 组装机器身份。
 *
 * @param triggerWord 受理触发词(来自配置)。
 * @returns 解析出登录名的 BotIdentity;取不到 login 时抛错,让 daemon 启动即失败。
 */
export async function initBotIdentity(triggerWord: string): Promise<BotIdentity> {
  const result = await run('gh', ['api', 'user', '--jq', '.login']);
  const login = result.stdout.trim();
  if (result.exitCode !== 0 || login.length === 0) {
    throw new Error(`无法通过 gh 获取当前登录名(exit=${result.exitCode}):${result.stderr.trim()}`);
  }
  return {
    login,
    triggerWord,
    replyMarker: REPLY_MARKER,
    replyPrefix: REPLY_PREFIX,
  };
}
