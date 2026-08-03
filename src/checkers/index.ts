/**
 * 接缝一 · checker 集中注册点。
 *
 * 新增一条 checker,唯一要碰的地方就是下面这个数组:实现一个 {@link Checker}
 * 模块、import 进来、push 到 `registry`。`scan.ts` / `report.ts` 骨架无需改动。
 *
 * 种子 0001 钉死检查项为 3 条,不增第 4 条。
 */
import type { Checker } from '../types.js';
import { lintConfigChecker } from './lint-config.js';
import { testSignalChecker } from './test-signal.js';
import { tsStrictChecker } from './ts-strict.js';

export const registry: Checker[] = [lintConfigChecker, testSignalChecker, tsStrictChecker];
