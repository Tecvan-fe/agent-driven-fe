/**
 * 单 worker 串行队列。全局串行(不是每分支一个 worker)是刻意选的最简正确解:
 * 同一时刻只有一个 job 在跑,天然杜绝两个 job 抢同一分支、或并行 push 打架。
 * 代价是吞吐低——但本 harness 面向低频的 PR 评论,吞吐不是约束。
 */
import type { Job } from './types.js';

/** 处理单个 job 的异步函数,由 daemon 注入。 */
export type JobHandler = (job: Job) => Promise<void>;

/** 串行任务队列。 */
export interface JobQueue {
  /** 入队一个 job,若 worker 空闲则触发排空。 */
  enqueue(job: Job): void;
  /** 队列中等待处理(未开始)的 job 数,供日志/观测。 */
  pending(): number;
}

/**
 * 创建串行队列。
 *
 * @param handler 处理单个 job 的函数;其内部异常由队列吞掉(handler 自己负责记录),
 *                以免一个 job 崩了掀翻整个 worker 循环。
 */
export function createQueue(handler: JobHandler): JobQueue {
  const buffer: Job[] = [];
  let draining = false;

  async function drain(): Promise<void> {
    if (draining) {
      return;
    }
    draining = true;
    try {
      while (buffer.length > 0) {
        const job = buffer.shift();
        if (job === undefined) {
          break;
        }
        try {
          await handler(job);
        } catch {
          // handler 应自行捕获并记录;这里兜底,确保单个失败不终止排空。
        }
      }
    } finally {
      draining = false;
    }
  }

  return {
    enqueue(job: Job): void {
      buffer.push(job);
      void drain();
    },
    pending(): number {
      return buffer.length;
    },
  };
}
