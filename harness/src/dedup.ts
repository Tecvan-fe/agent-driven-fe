/**
 * 去重:同一条 webhook delivery 只处理一次。
 * GitHub 在超时或重试时会重发相同 delivery(X-GitHub-Delivery 为其唯一 UUID)。
 *
 * 双层:内存 Set 做热路径快查,持久化文件(state/seen-deliveries.log)让 daemon
 * 重启后仍认得已处理过的 delivery,避免重启后旧重试被重复执行。
 */
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** delivery 去重器。 */
export interface DeliveryDedup {
  /** 首次见到返回 true 并登记;已见过返回 false。 */
  seenBefore(deliveryId: string): boolean;
}

/**
 * 创建去重器,从持久化文件恢复已见集合。
 *
 * @param stateDir 状态目录,seen-deliveries.log 落于此。
 */
export function createDedup(stateDir: string): DeliveryDedup {
  const file = join(stateDir, 'seen-deliveries.log');
  const seen = new Set<string>();

  try {
    const content = readFileSync(file, 'utf8');
    for (const line of content.split('\n')) {
      const id = line.trim();
      if (id.length > 0) {
        seen.add(id);
      }
    }
  } catch {
    // 文件不存在(首次启动)即空集,正常。
  }

  return {
    seenBefore(deliveryId: string): boolean {
      if (seen.has(deliveryId)) {
        return true;
      }
      seen.add(deliveryId);
      try {
        mkdirSync(dirname(file), { recursive: true });
        appendFileSync(file, `${deliveryId}\n`);
      } catch {
        // 落盘失败不阻断:内存 Set 仍在本进程内生效,重启后可能重复一次(诚实的已知代价)。
      }
      return false;
    },
  };
}
