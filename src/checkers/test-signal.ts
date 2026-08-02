/**
 * 检查 (b):是否存在测试信号。
 * 判定源(任一即通过):package.json 的 `scripts.test` 存在(且非空),
 * 或仓库内存在 `*.test.*` / `*.spec.*` 文件或 `__tests__/` 目录。
 */
import type { Checker, ScanContext } from '../types.js';
import { someEntry } from '../fs-utils.js';

const TEST_FILE_RE = /\.(test|spec)\./;

function hasTestScript(pkg: Record<string, unknown>): boolean {
  const scripts = pkg.scripts;
  if (scripts === null || typeof scripts !== 'object') return false;
  const test = (scripts as Record<string, unknown>).test;
  return typeof test === 'string' && test.trim().length > 0;
}

export const testSignalChecker: Checker = {
  id: 'test-signal',
  check(ctx: ScanContext) {
    if (hasTestScript(ctx.packageJson)) {
      return { id: this.id, status: 'pass', evidence: '发现 package.json 的 scripts.test' };
    }
    const found = someEntry(ctx.repoPath, (name, isDir) => {
      if (isDir) return name === '__tests__';
      return TEST_FILE_RE.test(name);
    });
    if (found) {
      return {
        id: this.id,
        status: 'pass',
        evidence: '发现测试文件(*.test.* / *.spec.*)或 __tests__ 目录',
      };
    }
    return {
      id: this.id,
      status: 'fail',
      evidence: '未发现 scripts.test、测试文件或 __tests__ 目录',
    };
  },
};
