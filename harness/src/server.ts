/**
 * HTTP 入站:node:http 起服务,处理 GitHub webhook。
 *
 * 关键次序(顺序不可乱):
 *   读原始 body(Buffer,**不 parse**)→ 验签 → 去重 → JSON.parse → 解析事件 → 受理判定 → 入队。
 * 验签必须在 parse 之前,因为签名是对原始字节算的;parse 会改变字节表示。
 *
 * 始终**快返 2xx**(除验签失败返 401):webhook 要求亚秒级响应,真正的活儿
 * 全部丢进队列异步做。响应体只是给人看的诊断信息,GitHub 不关心内容。
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AppConfig, BotIdentity, Job } from './types.js';
import type { Logger } from './log.js';
import type { JobQueue } from './queue.js';
import type { Journal } from './journal.js';
import type { DeliveryDedup } from './dedup.js';
import { verifySignature } from './signature.js';
import { parseEvent } from './parse-event.js';
import { shouldAccept } from './filter.js';

/** body 上限 1MB,超限直接拒,防超大请求打爆内存。 */
const MAX_BODY_BYTES = 1024 * 1024;

/** server 运行所需的依赖集合,由 daemon 注入(便于测试替身)。 */
export interface ServerDeps {
  config: AppConfig;
  bot: BotIdentity;
  logger: Logger;
  queue: JobQueue;
  journal: Journal;
  dedup: DeliveryDedup;
  /** 取当前时间,默认 () => new Date();测试可注入。 */
  now?: () => Date;
}

/** 读取请求体为 Buffer,超过上限则 reject。 */
function readRawBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on('data', (chunk: Buffer) => {
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
        reject(new Error('请求体超过上限'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/**
 * 处理单个 webhook 请求。返回 [statusCode, message],由外层写响应。
 * 除验签失败(401)外一律 200——GitHub 只要拿到 2xx 就认为投递成功。
 */
async function handleWebhook(
  req: IncomingMessage,
  deps: ServerDeps,
): Promise<[number, string]> {
  const { config, bot, logger, queue, journal, dedup } = deps;
  const now = deps.now ?? (() => new Date());

  const deliveryId = firstHeader(req.headers['x-github-delivery']) ?? '';
  const eventName = firstHeader(req.headers['x-github-event']) ?? '';
  const signature = firstHeader(req.headers['x-hub-signature-256']);

  let raw: Buffer;
  try {
    raw = await readRawBody(req);
  } catch {
    logger.warn('body_too_large', { deliveryId });
    return [413, 'payload too large'];
  }

  // 1) 验签(对原始字节)。
  if (!verifySignature(raw, signature, config.webhookSecret)) {
    logger.warn('signature_invalid', { deliveryId, event: eventName });
    return [401, 'invalid signature'];
  }

  // 2) 去重。
  if (deliveryId.length > 0 && dedup.seenBefore(deliveryId)) {
    logger.info('duplicate', { deliveryId, event: eventName });
    return [200, 'duplicate'];
  }

  // 3) parse(此刻才允许)。
  let payload: unknown;
  try {
    payload = JSON.parse(raw.toString('utf8'));
  } catch {
    logger.warn('json_invalid', { deliveryId, event: eventName });
    return [200, 'invalid json ignored'];
  }

  // 4) 解析事件。
  const comment = parseEvent(eventName, payload);
  if (comment === undefined) {
    logger.info('ignored_event', { deliveryId, event: eventName });
    return [200, 'ignored'];
  }

  // 5) 受理判定(防循环核心)。
  const verdict = shouldAccept(comment, bot);
  if (!verdict.accept) {
    logger.info('rejected', {
      deliveryId,
      event: eventName,
      prNumber: comment.prNumber,
      reason: verdict.reason,
    });
    return [200, `ignored: ${verdict.reason}`];
  }

  // 6) 入队 + 记 journal。
  const job: Job = {
    deliveryId: deliveryId.length > 0 ? deliveryId : `no-delivery-${comment.commentId}`,
    prNumber: comment.prNumber,
    branch: comment.branch,
    commentBody: comment.body,
    commentId: comment.commentId,
    path: comment.path,
    line: comment.line,
    status: 'enqueued',
    at: now().toISOString(),
    note: undefined,
  };
  journal.record(job);
  queue.enqueue(job);
  logger.info('queued', {
    deliveryId: job.deliveryId,
    event: eventName,
    prNumber: job.prNumber,
    pending: queue.pending(),
  });
  return [200, 'queued'];
}

/** 头可能是 string | string[] | undefined,取第一个 string。 */
function firstHeader(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) {
    return v[0];
  }
  return v;
}

/**
 * 创建并返回 HTTP server(未 listen)。只处理 POST /webhook;
 * GET /healthz 返回 ok 供隧道/探活;其余 404。
 */
export function createWebhookServer(deps: ServerDeps): Server {
  return createServer((req: IncomingMessage, res: ServerResponse) => {
    if (req.method === 'GET' && req.url === '/healthz') {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('ok');
      return;
    }
    if (req.method !== 'POST' || req.url !== '/webhook') {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('not found');
      return;
    }
    handleWebhook(req, deps)
      .then(([status, message]) => {
        res.writeHead(status, { 'content-type': 'text/plain' });
        res.end(message);
      })
      .catch((err: unknown) => {
        // 兜底:handleWebhook 内部已尽量收敛,这里防意外。
        deps.logger.error('handler_crash', {
          message: err instanceof Error ? err.message : String(err),
        });
        res.writeHead(500, { 'content-type': 'text/plain' });
        res.end('internal error');
      });
  });
}
