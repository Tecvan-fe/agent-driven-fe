/**
 * webhook 验签:GitHub 用 webhook secret 对**原始请求体**做 HMAC-SHA256,
 * 放在 X-Hub-Signature-256 头里,值形如 `sha256=<hex>`。
 *
 * 三条安全要点:
 * 1. 必须对**原始 body Buffer** 计算,验签前绝不 JSON.parse(parse 会改变字节)。
 * 2. 用 crypto.timingSafeEqual 做定长常量时间比较,防时序侧信道。
 * 3. timingSafeEqual 对不等长入参会抛错,故先比长度、不匹配直接判否。
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * 校验签名。任何异常(头缺失、格式错、长度不符、HMAC 不匹配)一律返回 false,
 * 不抛错——调用方据布尔值决定 401,签名校验不该因边角输入而崩。
 *
 * @param rawBody 原始请求体,必须是未经解析的 Buffer。
 * @param signatureHeader X-Hub-Signature-256 头的值,形如 `sha256=abc...`。
 * @param secret 与 GitHub webhook 配置一致的密钥。
 */
export function verifySignature(
  rawBody: Buffer,
  signatureHeader: string | undefined,
  secret: string,
): boolean {
  if (signatureHeader === undefined || !signatureHeader.startsWith('sha256=')) {
    return false;
  }
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  const provided = signatureHeader.slice('sha256='.length);

  // 先比长度:timingSafeEqual 对不等长 Buffer 会抛异常。
  const expectedBuf = Buffer.from(expected, 'utf8');
  const providedBuf = Buffer.from(provided, 'utf8');
  if (expectedBuf.length !== providedBuf.length) {
    return false;
  }
  return timingSafeEqual(expectedBuf, providedBuf);
}
