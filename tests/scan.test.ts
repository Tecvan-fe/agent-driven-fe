/**
 * 成功标准 2/3/4/5:对三个 committed fixture 调用核心扫描函数,
 * 断言每项 status、score,以及双格式渲染的结构。
 */
import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { scanRepo } from '../src/scan.js';
import { renderHuman, renderJson } from '../src/report.js';
import type { CheckResult } from '../src/types.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string): string => join(here, '..', 'fixtures', name);

function statusOf(checks: CheckResult[], id: string): string {
  const found = checks.find((c) => c.id === id);
  expect(found, `checker ${id} 应出现在报告中`).toBeDefined();
  return found!.status;
}

describe('scanRepo — 三个 fixture 的检查结论与评分', () => {
  it('all-green:三项全 pass,3/3(成功标准 2)', () => {
    const report = scanRepo(fixture('all-green'));
    expect(statusOf(report.checks, 'lint-config')).toBe('pass');
    expect(statusOf(report.checks, 'test-signal')).toBe('pass');
    expect(statusOf(report.checks, 'ts-strict')).toBe('pass');
    expect(report.score).toEqual({ passed: 3, applicable: 3 });
  });

  it('all-red:三项全 fail,0/3(成功标准 3)', () => {
    const report = scanRepo(fixture('all-red'));
    expect(statusOf(report.checks, 'lint-config')).toBe('fail');
    expect(statusOf(report.checks, 'test-signal')).toBe('fail');
    expect(statusOf(report.checks, 'ts-strict')).toBe('fail');
    expect(report.score).toEqual({ passed: 0, applicable: 3 });
  });

  it('non-ts:strict 记 N/A 不计入分母,2/2(成功标准 4)', () => {
    const report = scanRepo(fixture('non-ts'));
    expect(statusOf(report.checks, 'lint-config')).toBe('pass');
    expect(statusOf(report.checks, 'test-signal')).toBe('pass');
    expect(statusOf(report.checks, 'ts-strict')).toBe('not-applicable');
    expect(report.score).toEqual({ passed: 2, applicable: 2 });
  });
});

describe('report 渲染 — 双格式由同一结构投影(成功标准 5)', () => {
  it('renderJson 严格输出契约字段,不多不少', () => {
    const report = scanRepo(fixture('all-green'));
    const parsed = JSON.parse(renderJson(report));
    expect(Object.keys(parsed).sort()).toEqual(['checks', 'score']);
    expect(Object.keys(parsed.score).sort()).toEqual(['applicable', 'passed']);
    for (const c of parsed.checks) {
      expect(Object.keys(c).sort()).toEqual(['evidence', 'id', 'status']);
    }
    expect(parsed.score).toEqual({ passed: 3, applicable: 3 });
  });

  it('renderHuman 每项一行 + 末尾总分', () => {
    const report = scanRepo(fixture('all-green'));
    const text = renderHuman(report);
    expect(text).toContain('lint-config');
    expect(text).toContain('ts-strict');
    expect(text).toContain('Score: 3/3');
  });

  it('renderHuman 全 N/A 时标注无适用检查项', () => {
    const report = {
      checks: [
        { id: 'ts-strict', status: 'not-applicable', evidence: '无 tsconfig' } as const,
      ],
      score: { passed: 0, applicable: 0 },
    };
    expect(renderHuman(report)).toContain('无适用检查项');
  });
});
