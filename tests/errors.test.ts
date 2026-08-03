/**
 * 成功标准 6(核心函数层):坏输入抛受控错误 ScanError,而非底层裸异常。
 * 进程层的退出码由 cli.e2e.test.ts 覆盖。
 */
import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { scanRepo, ScanError } from '../src/scan.js';

const here = dirname(fileURLToPath(import.meta.url));

describe('scanRepo 错误处理(成功标准 6)', () => {
  it('不存在的路径抛 ScanError', () => {
    const missing = join(here, '..', 'fixtures', '__does_not_exist__');
    expect(() => scanRepo(missing)).toThrow(ScanError);
  });

  it('无 package.json 的目录抛 ScanError', () => {
    // docs 目录存在但无 package.json
    const docsDir = join(here, '..', 'docs');
    expect(() => scanRepo(docsDir)).toThrow(ScanError);
  });
});
