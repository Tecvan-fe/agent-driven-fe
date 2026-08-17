/**
 * 去重单测:同一 delivery id 第一次返回 false(首见)、第二次返回 true(已见);
 * 并验证持久化——新建一个 dedup 实例(模拟重启)仍认得已见的 id。
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDedup } from '../src/dedup.js';

let stateDir: string;

beforeEach(() => {
  stateDir = mkdtempSync(join(tmpdir(), 'harness-dedup-'));
});

afterEach(() => {
  rmSync(stateDir, { recursive: true, force: true });
});

describe('createDedup', () => {
  it('首次见到返回 false,再次返回 true', () => {
    const dedup = createDedup(stateDir);
    expect(dedup.seenBefore('delivery-a')).toBe(false);
    expect(dedup.seenBefore('delivery-a')).toBe(true);
  });

  it('不同 id 互不影响', () => {
    const dedup = createDedup(stateDir);
    expect(dedup.seenBefore('a')).toBe(false);
    expect(dedup.seenBefore('b')).toBe(false);
    expect(dedup.seenBefore('a')).toBe(true);
    expect(dedup.seenBefore('b')).toBe(true);
  });

  it('持久化:重启(新实例)后仍认得已见 id', () => {
    const first = createDedup(stateDir);
    expect(first.seenBefore('persisted')).toBe(false);

    // 同一 stateDir 新建实例,模拟 daemon 重启。
    const second = createDedup(stateDir);
    expect(second.seenBefore('persisted')).toBe(true);
  });
});
