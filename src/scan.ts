/**
 * 扫描内核:前置校验 → 遍历 checker → 评分,产出 {@link Report}。
 * 数据流单向:repoPath → 校验并读 package.json → 逐个 checker → 汇总评分。
 */
import { join } from 'node:path';
import type { Checker, CheckResult, Report } from './types.js';
import { exists, readJsonSafe } from './fs-utils.js';
import { registry } from './checkers/index.js';

/**
 * 受控错误。前置校验失败时抛这个,而非让底层异常裸奔——
 * CLI 层据此打印清晰错误并以非 0 退出码退出(成功标准 6)。
 */
export class ScanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScanError';
  }
}

/**
 * 扫描一个本地仓库,返回结构化报告。
 *
 * @param repoPath 被审仓库路径。必须存在且含 package.json,否则抛 {@link ScanError}。
 * @param checkers 要运行的 checker 列表,默认取集中注册的 {@link registry};测试可注入。
 * @throws {ScanError} 路径不存在、非目录含义下无 package.json、或 package.json 解析失败。
 */
export function scanRepo(repoPath: string, checkers: Checker[] = registry): Report {
  if (!exists(repoPath)) {
    throw new ScanError(`路径不存在:${repoPath}`);
  }
  const pkgPath = join(repoPath, 'package.json');
  if (!exists(pkgPath)) {
    throw new ScanError(`目标目录下未发现 package.json:${repoPath}`);
  }
  const packageJson = readJsonSafe(pkgPath);
  if (packageJson === undefined) {
    throw new ScanError(`package.json 无法解析(非合法 JSON 对象):${pkgPath}`);
  }

  const ctx = { repoPath, packageJson };
  const checks: CheckResult[] = checkers.map((checker) => checker.check(ctx));

  const passed = checks.filter((c) => c.status === 'pass').length;
  const failed = checks.filter((c) => c.status === 'fail').length;
  // not-applicable 不计入分母:分母只数适用项(pass + fail)。全 N/A 时为 0/0。
  const applicable = passed + failed;

  return { checks, score: { passed, applicable } };
}
