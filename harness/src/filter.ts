/**
 * 受理判定:决定一条已解析的评论要不要进队列触发 agent。
 *
 * 防循环是这里的核心。人类 reviewer 与 agent 共用同一 GitHub 账号,
 * 无法靠作者 login 区分「人发的」还是「机器发的」。改用两个信号:
 *   1. 正文必须**包含触发词**(如 @claude)——人主动召唤才动。
 *   2. 正文必须**不含机器标记**(replyMarker)——agent 自己的回复带标记,
 *      回到 webhook 时被这条拦下,回路不自激。
 * agent 回复由 gh-reply 强制带标记并剥离触发词,故双重保险:既有标记、又无触发词。
 */
import type { BotIdentity, FilterVerdict, ParsedComment } from './types.js';

/**
 * 判定一条评论是否受理。
 *
 * @param comment 已解析的 PR 评论。
 * @param bot 机器身份(提供触发词与机器标记)。
 */
export function shouldAccept(comment: ParsedComment, bot: BotIdentity): FilterVerdict {
  const body = comment.body;

  if (body.includes(bot.replyMarker)) {
    return { accept: false, reason: 'agent 自身回复(含机器标记),忽略以防自激' };
  }
  if (!body.includes(bot.triggerWord)) {
    return { accept: false, reason: `正文不含触发词 ${bot.triggerWord},忽略` };
  }
  return { accept: true, reason: `含触发词 ${bot.triggerWord} 且非机器回复,受理` };
}
