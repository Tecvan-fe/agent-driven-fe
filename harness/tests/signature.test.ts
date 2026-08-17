/**
 * 验签单测:用已知 secret + body 造真实签名向量,断言真签名过、伪签名(篡改 body/
 * 错长度/缺前缀/空头)一律不过。这是 daemon 的第一道安全闸,必须零漏放。
 */
import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifySignature } from '../src/signature.js';

const SECRET = 'test-secret-0123456789';

/** 用与实现相同的算法造一个合法签名头,作为测试基准。 */
function sign(body: Buffer, secret: string): string {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
}

describe('verifySignature', () => {
  it('接受由相同 secret 对相同 body 生成的签名', () => {
    const body = Buffer.from(JSON.stringify({ action: 'created', hello: 'world' }), 'utf8');
    expect(verifySignature(body, sign(body, SECRET), SECRET)).toBe(true);
  });

  it('拒绝 body 被篡改后的签名', () => {
    const body = Buffer.from('{"a":1}', 'utf8');
    const header = sign(body, SECRET);
    const tampered = Buffer.from('{"a":2}', 'utf8');
    expect(verifySignature(tampered, header, SECRET)).toBe(false);
  });

  it('拒绝用错误 secret 生成的签名', () => {
    const body = Buffer.from('{"a":1}', 'utf8');
    expect(verifySignature(body, sign(body, 'wrong-secret'), SECRET)).toBe(false);
  });

  it('拒绝缺少 sha256= 前缀的头', () => {
    const body = Buffer.from('{}', 'utf8');
    const hex = createHmac('sha256', SECRET).update(body).digest('hex');
    expect(verifySignature(body, hex, SECRET)).toBe(false);
  });

  it('拒绝长度不符的签名(不因 timingSafeEqual 抛错而崩)', () => {
    const body = Buffer.from('{}', 'utf8');
    expect(verifySignature(body, 'sha256=deadbeef', SECRET)).toBe(false);
  });

  it('签名头为 undefined 时返回 false 而非抛错', () => {
    const body = Buffer.from('{}', 'utf8');
    expect(verifySignature(body, undefined, SECRET)).toBe(false);
  });

  it('空 body 也能正确验签', () => {
    const body = Buffer.from('', 'utf8');
    expect(verifySignature(body, sign(body, SECRET), SECRET)).toBe(true);
  });
});
