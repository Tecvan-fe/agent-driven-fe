/**
 * 回帖:agent 跑完后用 `gh pr comment` 在 PR 上回一条结果。
 *
 * 回帖正文由本模块**强制**加工,这是防循环的另一半:
 *   1. 前缀 `🤖 [agent]`：肉眼可辨机器发的。
 *   2. 末尾机器标记 `<!-- agent-reply -->`：filter 据此拦下,防自激。
 *   3. 剥离触发词：即便正文里出现 @claude 也去掉,双保险(既有标记、又无触发词)。
 */
import type { AppConfig, BotIdentity } from './types.js';
import { run } from './exec.js';

/** 把触发词从文本里剔除(全局、大小写敏感,与 filter 的 includes 判定对齐)。 */
function stripTrigger(text: string, triggerWord: string): string {
  return text.split(triggerWord).join('').replace(/[ \t]{2,}/g, ' ');
}

/**
 * 加工回帖正文:剥触发词 → 加前缀 → 追加机器标记。
 * 导出以便单测直接验证「加工后不含触发词、含标记」。
 */
export function decorateReply(body: string, bot: BotIdentity): string {
  const stripped = stripTrigger(body, bot.triggerWord);
  return `${bot.replyPrefix} ${stripped}\n\n${bot.replyMarker}`;
}

/**
 * 在 PR 上回帖。dry-run 模式下只在日志层由调用方体现,这里仍执行 gh(回帖无破坏性);
 * 若要连回帖也跳过,由调用方在 dry-run 时不调本函数。
 *
 * @param config 运行配置(提供 repo)。
 * @param bot 机器身份(提供前缀/标记/触发词)。
 * @param prNumber 目标 PR。
 * @param body 原始回帖内容(将被 decorateReply 加工)。
 * @returns gh 是否成功(非 0 不抛错,调用方按需记录——回帖失败不该反过来让 job 判失败)。
 */
export async function postReply(
  config: AppConfig,
  bot: BotIdentity,
  prNumber: number,
  body: string,
): Promise<boolean> {
  const decorated = decorateReply(body, bot);
  const result = await run('gh', [
    'pr',
    'comment',
    String(prNumber),
    '--repo',
    `${config.repoOwner}/${config.repoName}`,
    '--body',
    decorated,
  ]);
  return result.exitCode === 0;
}
