/**
 * 接缝二 · report 渲染。同一个 {@link Report} 结构投影成两种形态:
 * 机器可读 JSON(严格等于种子钉死的契约,不加字段)与人类可读文本。
 */
import type { Report } from './types.js';

/**
 * 渲染为机器可读 JSON 字符串。严格输出 `{ checks:[{id,status,evidence}], score:{passed,applicable} }`,
 * 不引入任何额外字段——这是种子钉死的顶层契约,后续种子挂接依赖它稳定。
 */
export function renderJson(report: Report): string {
  const shaped = {
    checks: report.checks.map((c) => ({ id: c.id, status: c.status, evidence: c.evidence })),
    score: { passed: report.score.passed, applicable: report.score.applicable },
  };
  return JSON.stringify(shaped, null, 2);
}

const STATUS_LABEL: Record<Report['checks'][number]['status'], string> = {
  pass: 'PASS',
  fail: 'FAIL',
  'not-applicable': 'N/A ',
};

/**
 * 渲染为人类可读文本。每条检查一行(状态 + id + 依据),末尾一行总分。
 * 全部检查均 not-applicable(applicable 为 0)时,显式标注"无适用检查项"。
 */
export function renderHuman(report: Report): string {
  const lines = report.checks.map((c) => `[${STATUS_LABEL[c.status]}] ${c.id} — ${c.evidence}`);
  const { passed, applicable } = report.score;
  if (applicable === 0) {
    lines.push('Score: 0/0(无适用检查项)');
  } else {
    lines.push(`Score: ${passed}/${applicable}`);
  }
  return lines.join('\n');
}
