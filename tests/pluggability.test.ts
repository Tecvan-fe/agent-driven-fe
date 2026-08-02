/**
 * 成功标准 7(自动层):注入一条新 checker 后,报告的 checks 项数相应 +1,
 * 且无需改动 scan/report 骨架(本测试仅通过注入参数即可挂上新 checker,
 * 未 import 或修改内核任何模块,佐证接缝成立)。
 */
import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { scanRepo } from '../src/scan.js';
import { registry } from '../src/checkers/index.js';
import type { Checker } from '../src/types.js';

const here = dirname(fileURLToPath(import.meta.url));
const greenFixture = join(here, '..', 'fixtures', 'all-green');

const dummyChecker: Checker = {
  id: 'dummy-checker',
  check() {
    return { id: 'dummy-checker', status: 'pass', evidence: '注入的示例 checker' };
  },
};

describe('checker 可插拔(成功标准 7 自动层)', () => {
  it('注入新 checker 后 checks 项数 +1', () => {
    const base = scanRepo(greenFixture);
    const extended = scanRepo(greenFixture, [...registry, dummyChecker]);
    expect(extended.checks.length).toBe(base.checks.length + 1);
    expect(extended.checks.some((c) => c.id === 'dummy-checker')).toBe(true);
  });

  it('默认 registry 恰为 3 条(种子钉死,不增第 4 条)', () => {
    expect(registry.length).toBe(3);
  });
});
