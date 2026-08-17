/**
 * git 操作:worker 在跑 agent 前后所需的分支准备与推送。
 * 全部走 execFile 数组参数(不经 shell),分支名等来自 GitHub payload,不拼字符串。
 */
import type { AppConfig } from './types.js';
import { AgentError } from './errors.js';
import { run } from './exec.js';

/**
 * 解析 PR 的 head 分支。issue_comment 事件不带分支,起步时用它兜底。
 *
 * @throws {AgentError} gh 调用失败或返回空分支名。
 */
export async function resolveBranch(config: AppConfig, prNumber: number): Promise<string> {
  const result = await run('gh', [
    'pr',
    'view',
    String(prNumber),
    '--repo',
    `${config.repoOwner}/${config.repoName}`,
    '--json',
    'headRefName',
    '--jq',
    '.headRefName',
  ]);
  const branch = result.stdout.trim();
  if (result.exitCode !== 0 || branch.length === 0) {
    throw new AgentError(`解析 PR #${prNumber} 分支失败(exit=${result.exitCode}):${result.stderr.trim()}`);
  }
  return branch;
}

/**
 * 把工作区切到目标分支的干净状态。幂等:每次都
 * fetch → checkout -B(强制指向远端)→ reset --hard → clean -fd,
 * 无论此前工作区是什么状态,跑完都等于「远端该分支的最新快照」,可安全重跑。
 *
 * @throws {AgentError} 任一 git 步骤非 0 退出。
 */
export async function ensureCleanCheckout(config: AppConfig, branch: string): Promise<void> {
  const cwd = config.labDir;
  const steps: Array<{ desc: string; args: string[] }> = [
    { desc: 'fetch', args: ['fetch', 'origin', branch] },
    { desc: 'checkout', args: ['checkout', '-B', branch, `origin/${branch}`] },
    { desc: 'reset', args: ['reset', '--hard', `origin/${branch}`] },
    { desc: 'clean', args: ['clean', '-fd'] },
  ];
  for (const step of steps) {
    const result = await run('git', step.args, { cwd });
    if (result.exitCode !== 0) {
      throw new AgentError(
        `git ${step.desc} 失败(分支 ${branch},exit=${result.exitCode}):${result.stderr.trim()}`,
      );
    }
  }
}

/**
 * 把当前分支推到远端。push 由 daemon 统一在 agent 成功退出后执行——
 * agent 无权 push(工具白名单已禁),推送时机与错误处理集中在此。
 *
 * @throws {AgentError} push 非 0 退出。
 */
export async function pushBranch(config: AppConfig, branch: string): Promise<void> {
  const result = await run('git', ['push', 'origin', branch], { cwd: config.labDir });
  if (result.exitCode !== 0) {
    throw new AgentError(`git push 失败(分支 ${branch},exit=${result.exitCode}):${result.stderr.trim()}`);
  }
}

/**
 * 判断当前工作区相对 HEAD 是否有已提交的新 commit 待推送。
 * agent 跑完后,若没有产生任何 commit(如它判断无需改动),就不必 push、不必回「已改」。
 */
export async function hasUnpushedCommits(config: AppConfig, branch: string): Promise<boolean> {
  const result = await run('git', ['rev-list', `origin/${branch}..HEAD`, '--count'], {
    cwd: config.labDir,
  });
  if (result.exitCode !== 0) {
    return false;
  }
  return Number.parseInt(result.stdout.trim(), 10) > 0;
}
