/**
 * 崩溃恢复日志:append-only 的 state/jobs.jsonl,每行一条 {@link Job} 快照。
 * 每次 job 状态迁移都追加一行(不改旧行),故文件是完整的状态变迁流水。
 * daemon 启动时重放:按 deliveryId 折叠出每个 job 的最后状态,把未达终态
 * (enqueued / started)的 job 挑出来重新入队,实现 at-least-once 恢复。
 */
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Job } from './types.js';

/** job 流水记录器。 */
export interface Journal {
  /** 追加一条 job 快照。 */
  record(job: Job): void;
  /** 重放文件,返回未达终态、需要恢复的 job(按 deliveryId 去重取最后状态)。 */
  pendingJobs(): Job[];
}

/**
 * 创建 journal。
 *
 * @param stateDir 状态目录,jobs.jsonl 落于此。
 */
export function createJournal(stateDir: string): Journal {
  const file = join(stateDir, 'jobs.jsonl');

  return {
    record(job: Job): void {
      try {
        mkdirSync(dirname(file), { recursive: true });
        appendFileSync(file, `${JSON.stringify(job)}\n`);
      } catch {
        // 落盘失败不阻断主流程:恢复能力降级,但当前 job 仍在内存队列里正常跑。
      }
    },

    pendingJobs(): Job[] {
      let content: string;
      try {
        content = readFileSync(file, 'utf8');
      } catch {
        return [];
      }
      // 折叠:同一 deliveryId 只保留最后一次快照。
      const latest = new Map<string, Job>();
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (trimmed.length === 0) {
          continue;
        }
        try {
          const job = JSON.parse(trimmed) as Job;
          if (typeof job.deliveryId === 'string') {
            latest.set(job.deliveryId, job);
          }
        } catch {
          // 跳过损坏行(如写入中途崩溃留下的半行)。
        }
      }
      return [...latest.values()].filter(
        (job) => job.status === 'enqueued' || job.status === 'started',
      );
    },
  };
}
