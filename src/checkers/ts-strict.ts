/**
 * 检查 (c):TypeScript 是否开启 strict。
 * 无 `tsconfig.json` → `not-applicable`(该仓库非 TS 项目,不计入分母)。
 * 有 tsconfig 且 `compilerOptions.strict === true` → pass,否则 fail。
 */
import { join } from 'node:path';
import type { Checker, ScanContext } from '../types.js';
import { exists, readJsonSafe } from '../fs-utils.js';

export const tsStrictChecker: Checker = {
  id: 'ts-strict',
  check(ctx: ScanContext) {
    const tsconfigPath = join(ctx.repoPath, 'tsconfig.json');
    if (!exists(tsconfigPath)) {
      return {
        id: this.id,
        status: 'not-applicable',
        evidence: '未发现 tsconfig.json,非 TypeScript 项目',
      };
    }
    const tsconfig = readJsonSafe(tsconfigPath);
    const compilerOptions =
      tsconfig && typeof tsconfig.compilerOptions === 'object' && tsconfig.compilerOptions !== null
        ? (tsconfig.compilerOptions as Record<string, unknown>)
        : undefined;
    if (compilerOptions?.strict === true) {
      return { id: this.id, status: 'pass', evidence: 'tsconfig.json 的 compilerOptions.strict 为 true' };
    }
    return {
      id: this.id,
      status: 'fail',
      evidence: 'tsconfig.json 存在,但 compilerOptions.strict 未开启',
    };
  },
};
