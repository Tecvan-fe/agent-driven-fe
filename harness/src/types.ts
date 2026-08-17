/**
 * 契约中心:daemon 全流程共享的类型定义。
 * 约定沿用主包——interface 状对象、type 状联合,中文 JSDoc。
 */

/** GitHub webhook 里我们受理的两类评论事件。 */
export type CommentEventKind = 'issue_comment' | 'pull_request_review_comment';

/**
 * 从已验签的 webhook body 抽出的规范化评论。
 * issue_comment 无 head 分支,branch 留空,由 worker 起步时用 gh 补齐;
 * pull_request_review_comment 直接带 branch、以及所评论的文件与行号。
 */
export interface ParsedComment {
  /** 事件类型,决定后续如何取分支。 */
  kind: CommentEventKind;
  /** 关联的 PR 号。 */
  prNumber: number;
  /** PR head 分支名;issue_comment 时为 undefined,worker 兜底解析。 */
  branch: string | undefined;
  /** 评论正文原文。 */
  body: string;
  /** 评论作者 login(共享身份下不用于防循环,仅记录)。 */
  authorLogin: string;
  /** 评论 id,用于日志与追溯。 */
  commentId: number;
  /** 行内评论所评的文件路径;会话评论时为 undefined。 */
  path: string | undefined;
  /** 行内评论所评的行号;会话评论时为 undefined。 */
  line: number | undefined;
}

/** 一个 job 在队列里的生命周期状态。 */
export type JobStatus = 'enqueued' | 'started' | 'succeeded' | 'failed';

/**
 * 一次 agent 驱动任务。以 deliveryId 为幂等键——
 * 同一 webhook delivery 只应产生一个 job。
 */
export interface Job {
  /** X-GitHub-Delivery,幂等键。 */
  deliveryId: string;
  /** 目标 PR 号。 */
  prNumber: number;
  /** 目标分支;入队时可能未知(issue_comment),worker 起步补齐。 */
  branch: string | undefined;
  /** 触发本 job 的评论正文。 */
  commentBody: string;
  /** 触发评论的 id。 */
  commentId: number;
  /** 行内评论的文件路径(可选)。 */
  path: string | undefined;
  /** 行内评论的行号(可选)。 */
  line: number | undefined;
  /** 当前状态。 */
  status: JobStatus;
  /** 状态最近一次更新的时间戳(ISO 字符串)。 */
  at: string;
  /** 附注:失败原因、成功摘要等。 */
  note: string | undefined;
}

/**
 * 机器身份与防循环标记。
 * 人类与 bot 共用同一 GitHub 账号,故防循环不能靠作者 login,
 * 改用「受理需含触发词」+「agent 回复强制带机器标记且剥离触发词」双信号。
 */
export interface BotIdentity {
  /** gh api user 取到的当前登录名(人类与 bot 同为此值)。 */
  login: string;
  /** 受理所需的触发词,如 @claude。 */
  triggerWord: string;
  /** agent 回复末尾强制附带的 HTML 注释标记,回到 webhook 时据此拦截。 */
  replyMarker: string;
  /** agent 回复正文前缀,肉眼可辨这是机器发的。 */
  replyPrefix: string;
}

/** 冻结的运行时配置,来自 .env,启动时校验一次。 */
export interface AppConfig {
  /** 目标仓库 owner。 */
  repoOwner: string;
  /** 目标仓库 name。 */
  repoName: string;
  /** daemon 监听端口。 */
  port: number;
  /** webhook HMAC 密钥。 */
  webhookSecret: string;
  /** 触发词。 */
  triggerWord: string;
  /** 被驱动的 lab 仓库绝对路径。 */
  labDir: string;
  /** 传给 claude -p 的模型。 */
  model: string;
  /** 状态目录(jobs.jsonl、seen-deliveries.log)。 */
  stateDir: string;
  /** 日志目录(daemon.log)。 */
  logDir: string;
  /** dry-run:跳过真跑 claude 与 push,仅走编排。 */
  dryRun: boolean;
}

/** filter 的受理判定结果:是否受理 + 原因(用于日志)。 */
export interface FilterVerdict {
  /** 是否受理该评论、进入队列。 */
  accept: boolean;
  /** 判定原因,受理与拒绝都记一句,便于排查。 */
  reason: string;
}

/** agent 一次运行的结果。 */
export interface AgentResult {
  /** 是否成功退出(退出码 0)。 */
  ok: boolean;
  /** agent 输出里可读的一句话总结,回帖时用。 */
  summary: string;
  /** claude -p 进程退出码。 */
  exitCode: number;
}
