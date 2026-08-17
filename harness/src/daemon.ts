#!/usr/bin/env node
/**
 * daemon 入口:装配所有部件并常驻。
 *
 * 装配顺序:配置 → 日志 → 机器身份(gh) → 去重/流水 → job 处理器 → 队列 →
 * 重放未完成 job(崩溃恢复)→ 起 HTTP server。
 *
 * job 处理器(worker)是闭环的后半段:
 *   started → 解析分支(issue_comment 兜底)→ ensureCleanCheckout →
 *   runAgent → 有新 commit 则 pushBranch → 回帖 → succeeded/failed。
 * 全局单 worker 串行,故此函数内不必担心并发抢分支。
 */
import type { AppConfig, BotIdentity, Job } from './types.js';
import type { Logger } from './log.js';
import { loadConfig } from './config.js';
import { createLogger } from './log.js';
import { initBotIdentity } from './bot-identity.js';
import { createDedup } from './dedup.js';
import { createJournal, type Journal } from './journal.js';
import { createQueue } from './queue.js';
import { createWebhookServer } from './server.js';
import { ensureCleanCheckout, hasUnpushedCommits, pushBranch, resolveBranch } from './git-runner.js';
import { runAgent } from './agent-runner.js';
import { postReply } from './gh-reply.js';
import { ConfigError } from './errors.js';

/** 构造 worker:处理单个 job 的完整链路。异常在内部收敛并记 journal,不外抛。 */
function makeHandler(
  config: AppConfig,
  bot: BotIdentity,
  logger: Logger,
  journal: Journal,
): (job: Job) => Promise<void> {
  return async (job: Job): Promise<void> => {
    const now = (): string => new Date().toISOString();
    const started: Job = { ...job, status: 'started', at: now(), note: undefined };
    journal.record(started);
    logger.info('job_started', { deliveryId: job.deliveryId, prNumber: job.prNumber });

    try {
      const branch = job.branch ?? (await resolveBranch(config, job.prNumber));
      logger.info('branch_resolved', { deliveryId: job.deliveryId, prNumber: job.prNumber, branch });

      await ensureCleanCheckout(config, branch);
      const result = await runAgent(config, { ...job, branch }, branch);
      logger.info('agent_done', {
        deliveryId: job.deliveryId,
        prNumber: job.prNumber,
        ok: result.ok,
        exitCode: result.exitCode,
      });

      if (!result.ok) {
        if (!config.dryRun) {
          await postReply(config, bot, job.prNumber, `本轮未能完成改动:${result.summary}`);
        }
        journal.record({ ...started, status: 'failed', at: now(), note: result.summary });
        logger.warn('job_failed', { deliveryId: job.deliveryId, prNumber: job.prNumber, reason: result.summary });
        return;
      }

      // agent 成功:仅当确有新 commit 时才 push、回帖(它可能判断无需改动)。
      const changed = config.dryRun ? false : await hasUnpushedCommits(config, branch);
      if (changed) {
        await pushBranch(config, branch);
        await postReply(config, bot, job.prNumber, `已按评论改了一版并推送到 ${branch}:${result.summary}`);
        logger.info('job_pushed', { deliveryId: job.deliveryId, prNumber: job.prNumber, branch });
      } else if (!config.dryRun) {
        await postReply(config, bot, job.prNumber, `本轮未产生代码改动:${result.summary}`);
        logger.info('job_no_change', { deliveryId: job.deliveryId, prNumber: job.prNumber });
      }

      journal.record({ ...started, status: 'succeeded', at: now(), note: result.summary });
      logger.info('job_succeeded', { deliveryId: job.deliveryId, prNumber: job.prNumber });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      try {
        if (!config.dryRun) {
          await postReply(config, bot, job.prNumber, `处理评论时出错:${message}`);
        }
      } catch {
        // 回帖失败不再抛,已有 journal 与日志留痕。
      }
      journal.record({ ...started, status: 'failed', at: now(), note: message });
      logger.error('job_error', { deliveryId: job.deliveryId, prNumber: job.prNumber, message });
    }
  };
}

/** 异步入口。返回进程退出码。 */
async function main(): Promise<number> {
  let config: AppConfig;
  try {
    config = loadConfig();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`配置加载失败:${message}\n`);
    return err instanceof ConfigError ? 2 : 1;
  }

  const logger = createLogger(config.logDir);
  logger.info('config_loaded', {
    repo: `${config.repoOwner}/${config.repoName}`,
    port: config.port,
    labDir: config.labDir,
    model: config.model,
    dryRun: config.dryRun,
  });

  let bot: BotIdentity;
  try {
    bot = await initBotIdentity(config.triggerWord);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('bot_identity_failed', { message });
    process.stderr.write(`初始化机器身份失败(gh 未登录?):${message}\n`);
    return 1;
  }
  logger.info('bot_identity', { login: bot.login, triggerWord: bot.triggerWord });

  const dedup = createDedup(config.stateDir);
  const journal = createJournal(config.stateDir);
  const handler = makeHandler(config, bot, logger, journal);
  const queue = createQueue(handler);

  // 崩溃恢复:重放未达终态的 job。
  const pending = journal.pendingJobs();
  if (pending.length > 0) {
    logger.info('replay', { count: pending.length });
    for (const job of pending) {
      queue.enqueue({ ...job, status: 'enqueued', at: new Date().toISOString(), note: '崩溃恢复重放' });
    }
  }

  const server = createWebhookServer({ config, bot, logger, queue, journal, dedup });
  server.listen(config.port, () => {
    logger.info('listening', { port: config.port, path: '/webhook' });
  });

  // 常驻:优雅退出。
  const shutdown = (signal: string): void => {
    logger.info('shutdown', { signal });
    server.close(() => process.exit(0));
    // 兜底:5s 内没关掉就强退。
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  return 0; // server 常驻,不真正走到这——返回码只在启动失败路径有意义。
}

main().then((code) => {
  if (code !== 0) {
    process.exit(code);
  }
  // code === 0:server 正在监听,进程由信号处理器负责退出,这里不 exit。
});
