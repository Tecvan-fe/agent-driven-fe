/**
 * 只读 fs 辅助。整个工具对目标仓库的文件访问全部收口到这里,
 * 且**只暴露读函数**——这是种子"只读语义"的结构约束(不给写入口)。
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/** 路径是否存在(文件或目录)。 */
export function exists(path: string): boolean {
  return existsSync(path);
}

/** 读文本文件;不存在或读取失败时返回 undefined,不抛异常。 */
export function readFileSafe(path: string): string | undefined {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return undefined;
  }
}

/** 目录遍历时跳过的目录名(依赖 / 版本库 / 构建产物,避免误扫且提速)。 */
const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage']);

/**
 * 深度优先遍历目录,对每个文件/目录名调用 `predicate`,命中即短路返回 true。
 * 只读遍历,遇到无法读取的目录静默跳过。用于"仓库内是否存在某类文件"这类判定。
 *
 * @param predicate 入参为 (相对/文件名, 是否目录),返回 true 表示命中。
 */
export function someEntry(
  root: string,
  predicate: (name: string, isDir: boolean) => boolean,
): boolean {
  let entries: import('node:fs').Dirent[];
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch {
    return false;
  }
  for (const entry of entries) {
    const isDir = entry.isDirectory();
    if (predicate(entry.name, isDir)) return true;
    if (isDir && !IGNORED_DIRS.has(entry.name)) {
      if (someEntry(join(root, entry.name), predicate)) return true;
    }
  }
  return false;
}

/** 读并解析 JSON 文件;不存在或解析失败时返回 undefined,不抛异常。 */
export function readJsonSafe(path: string): Record<string, unknown> | undefined {
  const raw = readFileSafe(path);
  if (raw === undefined) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return undefined;
  } catch {
    return undefined;
  }
}
