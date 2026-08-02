/**
 * 检查 (a):是否存在 lint 配置。
 * 判定源(任一即通过):`.eslintrc*` / `eslint.config.*` 文件,
 * 或 package.json 的 `eslintConfig` 字段。
 */
import { join } from 'node:path';
import type { Checker, ScanContext } from '../types.js';
import { exists } from '../fs-utils.js';

const CONFIG_FILES = [
  '.eslintrc',
  '.eslintrc.js',
  '.eslintrc.cjs',
  '.eslintrc.json',
  '.eslintrc.yml',
  '.eslintrc.yaml',
  'eslint.config.js',
  'eslint.config.cjs',
  'eslint.config.mjs',
  'eslint.config.ts',
];

export const lintConfigChecker: Checker = {
  id: 'lint-config',
  check(ctx: ScanContext) {
    const found = CONFIG_FILES.find((name) => exists(join(ctx.repoPath, name)));
    if (found) {
      return { id: this.id, status: 'pass', evidence: `发现 lint 配置文件 ${found}` };
    }
    if ('eslintConfig' in ctx.packageJson) {
      return {
        id: this.id,
        status: 'pass',
        evidence: '发现 package.json 的 eslintConfig 字段',
      };
    }
    return {
      id: this.id,
      status: 'fail',
      evidence: '未发现 .eslintrc* / eslint.config.* 文件或 package.json eslintConfig 字段',
    };
  },
};
