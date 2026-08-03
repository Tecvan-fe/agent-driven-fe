/**
 * 成功标准 2(退出码)+ 6(坏输入退出码):以子进程实际跑构建后的 CLI 二进制,
 * 断言退出码。核心函数返回值覆盖不到进程层退出码,故必须走 e2e。
 *
 * 依赖 dist/cli.js —— 需先 `pnpm build`。CI 中 build 在 test 之前;本地同序。
 */
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const cliEntry = join(root, 'dist', 'cli.js');
const fixture = (name: string): string => join(root, 'fixtures', name);

/** 跑 CLI,返回 { code, stdout }。execFileSync 在非 0 退出码时抛错,从中取 status。 */
function runCli(arg: string): { code: number; stdout: string } {
  try {
    const stdout = execFileSync('node', [cliEntry, arg], { encoding: 'utf8' });
    return { code: 0, stdout };
  } catch (err) {
    const e = err as { status?: number; stdout?: string };
    return { code: e.status ?? 1, stdout: e.stdout ?? '' };
  }
}

describe('CLI 端到端(子进程)', () => {
  it('dist/cli.js 已构建产出', () => {
    expect(existsSync(cliEntry), '请先运行 pnpm build').toBe(true);
  });

  it('传入合法 fixture → 退出码 0,输出含总分(成功标准 2)', () => {
    const { code, stdout } = runCli(fixture('all-green'));
    expect(code).toBe(0);
    expect(stdout).toContain('Score: 3/3');
  });

  it('传入不存在路径 → 退出码非 0(成功标准 6)', () => {
    const { code } = runCli(fixture('__does_not_exist__'));
    expect(code).not.toBe(0);
  });
});
