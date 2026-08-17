/**
 * 结构化日志:每条一行 JSON,同时写 stdout 与 logs/daemon.log。
 * 记录每条 delivery 的验签/受理/拒绝原因、job 状态迁移、agent 退出码等,
 * 便于事后按 deliveryId / prNumber 追一条评论的完整处理链路。
 */
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

/** 日志级别。 */
export type LogLevel = 'info' | 'warn' | 'error';

/** 一个可复用的 logger,绑定到某个日志目录。 */
export interface Logger {
  info(event: string, fields?: Record<string, unknown>): void;
  warn(event: string, fields?: Record<string, unknown>): void;
  error(event: string, fields?: Record<string, unknown>): void;
}

/**
 * 创建 logger。日志目录会被确保存在;写文件失败不影响 stdout 输出,
 * 因为 daemon 的可观测性不应因磁盘问题而彻底哑掉。
 *
 * @param logDir 日志落盘目录,daemon.log 追加写入其中。
 * @param now 取当前时间的函数,默认 () => new Date();测试可注入固定时钟。
 */
export function createLogger(logDir: string, now: () => Date = () => new Date()): Logger {
  try {
    mkdirSync(logDir, { recursive: true });
  } catch {
    // 目录创建失败仅降级为只写 stdout。
  }
  const logFile = join(logDir, 'daemon.log');

  function write(level: LogLevel, event: string, fields: Record<string, unknown> | undefined): void {
    const line = JSON.stringify({
      ts: now().toISOString(),
      level,
      event,
      ...(fields ?? {}),
    });
    process.stdout.write(`${line}\n`);
    try {
      appendFileSync(logFile, `${line}\n`);
    } catch {
      // 落盘失败静默:stdout 已经出过,不再二次抛错干扰主流程。
    }
  }

  return {
    info: (event, fields) => write('info', event, fields),
    warn: (event, fields) => write('warn', event, fields),
    error: (event, fields) => write('error', event, fields),
  };
}
