/**
 * agent 执行:把一个 job 组成 prompt,跑 `claude -p` 让它在 lab 仓库里改代码。
 *
 * 沙箱靠三层收口:
 *   1. cwd + --add-dir 锁死在 labDir,agent 看不到也改不了 lab 之外的文件。
 *   2. --allowedTools 只放开读写与安全的 git 只读/提交操作。
 *   3. --disallowedTools 明确禁掉 push / reset / checkout / rm 与联网——
 *      分支切换与推送由 daemon 前后置完成,agent 只管「改 + commit」。
 */
import type { AgentResult, AppConfig, Job } from './types.js';
import { run } from './exec.js';

/** 允许 agent 使用的工具白名单。 */
const ALLOWED_TOOLS = [
  'Bash(git add:*)',
  'Bash(git commit:*)',
  'Bash(git status:*)',
  'Bash(git diff:*)',
  'Bash(git log:*)',
  'Read',
  'Edit',
  'Write',
];

/** 明确禁用的工具:分支切换/推送/删除/联网一律不交给 agent。 */
const DISALLOWED_TOOLS = [
  'Bash(git push:*)',
  'Bash(git reset:*)',
  'Bash(git checkout:*)',
  'Bash(git switch:*)',
  'Bash(rm:*)',
  'WebFetch',
  'WebSearch',
];

/** agent 单次运行超时:15 分钟,防卡死拖垮串行队列。 */
const AGENT_TIMEOUT_MS = 15 * 60 * 1000;

/**
 * 组装给 agent 的中文 prompt:嵌入人类评论、PR/分支/文件/行号,
 * 并明确交接规则——只在本分支改、用 git commit 留痕、不 push/不切分支/不删文件、
 * 完成后一句话总结。
 */
export function buildPrompt(job: Job, branch: string): string {
  const location =
    job.path !== undefined
      ? `\n评论针对文件:${job.path}${job.line !== undefined ? `,第 ${job.line} 行` : ''}`
      : '';
  return [
    `你在一个前端工程样本仓库里工作,当前已切到分支 ${branch}(对应 PR #${job.prNumber})。`,
    `一位协作者在该 PR 上留下了如下评论,请据此改一版代码:`,
    ``,
    `"""`,
    job.commentBody,
    `"""`,
    location,
    ``,
    `要求:`,
    `1. 只在当前分支 ${branch} 上改动,聚焦评论提出的诉求,不做无关重构。`,
    `2. 改完用 git add + git commit 留痕,commit message 用中文说清这次改了什么。`,
    `3. 不要执行 git push、git checkout、git reset、git switch,也不要删除文件——分支与推送由外部流程负责。`,
    `4. 遵守仓库 CLAUDE.md 的铁律(只用公开工具链、不写内部信息与密钥)。`,
    `5. 完成后用一句话总结你做了什么改动;若判断无需改动,也说明理由、不要强行提交。`,
  ].join('\n');
}

/**
 * 从 claude -p --output-format json 的输出里抽一句可读总结。
 * 该模式输出一个 JSON 对象,常见字段为 result(最终文本);取不到就回退到原始输出首行。
 */
export function extractSummary(stdout: string): string {
  const trimmed = stdout.trim();
  if (trimmed.length === 0) {
    return '(agent 无输出)';
  }
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    const result = parsed['result'];
    if (typeof result === 'string' && result.trim().length > 0) {
      return result.trim();
    }
  } catch {
    // 非 JSON:退回原始文本首行。
  }
  return trimmed.split('\n')[0] ?? trimmed;
}

/**
 * 跑一次 agent。dry-run 模式下不真起 claude,直接返回成功占位,供本地联调编排。
 *
 * @param config 运行配置(提供 labDir / model / dryRun)。
 * @param job 待处理的 job。
 * @param branch 已解析并 checkout 完成的目标分支。
 */
export async function runAgent(config: AppConfig, job: Job, branch: string): Promise<AgentResult> {
  const prompt = buildPrompt(job, branch);

  if (config.dryRun) {
    return { ok: true, summary: '(dry-run)跳过真跑 claude', exitCode: 0 };
  }

  const args = [
    '-p',
    '--permission-mode',
    'bypassPermissions',
    '--model',
    config.model,
    '--output-format',
    'json',
    '--add-dir',
    config.labDir,
    '--allowedTools',
    ...ALLOWED_TOOLS,
    '--disallowedTools',
    ...DISALLOWED_TOOLS,
  ];

  const result = await run('claude', args, {
    cwd: config.labDir,
    input: prompt,
    timeoutMs: AGENT_TIMEOUT_MS,
  });

  return {
    ok: result.exitCode === 0,
    summary: result.exitCode === 0 ? extractSummary(result.stdout) : result.stderr.trim() || `claude 退出码 ${result.exitCode}`,
    exitCode: result.exitCode,
  };
}
