#!/usr/bin/env node
/**
 * CLI 薄入口。职责仅限于:解析 argv → 调 scanRepo → 渲染两种输出 → 按成败设退出码。
 * 所有异常在此收口(try/catch),保证无未捕获异常;坏输入 → 非 0 退出码(成功标准 6)。
 *
 * 用法:audit-cli <repoPath>
 */
import { scanRepo } from './scan.js';
import { renderHuman, renderJson } from './report.js';

function main(argv: string[]): number {
  const repoPath = argv[2];
  if (repoPath === undefined || repoPath.trim().length === 0) {
    process.stderr.write('用法:audit-cli <repoPath>\n');
    return 1;
  }

  try {
    const report = scanRepo(repoPath);
    // 人类可读摘要走 stdout,便于直接阅读;JSON 也走 stdout,便于管道消费。
    process.stdout.write(renderHuman(report) + '\n');
    process.stdout.write('\n--- JSON ---\n');
    process.stdout.write(renderJson(report) + '\n');
    return 0;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`审查失败:${message}\n`);
    return 1;
  }
}

process.exit(main(process.argv));
