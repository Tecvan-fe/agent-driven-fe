# 设计 0001:工程化审查 CLI 最小内核

> 本文对齐种子 [`seeds/0001-engineering-audit-cli-core.md`](../seeds/0001-engineering-audit-cli-core.md),是流程引擎蓝图 [环节 B(设计)](./engine-blueprint.md) 的产出物。任务是把种子每一条成功标准落到"由哪个模块 / 接缝兑现、由哪个验证器裁决"上,证明设计既覆盖了全部标准、又没有越出种子边界。实现细节以此为准。

---

## 输入与产出

输入是已通过环节 A 的种子 0001——它钉死了四件套:只读语义、检查项固定 3 条、`not-applicable` 不计入分母、report 顶层契约。本节结束时产出这份设计文档,交由环节 B 的门禁裁决:自动层查"每条成功标准有落点、不越边界",人工层在 PR 上确认接缝切得对不对。

## 一句话方案

一个单包(仓库根,不建 workspace)的只读 CLI:`scanRepo(repoPath, checkers)` 遍历一组 checker,每个 checker 只读几个文件产出一条 `CheckResult`,汇总成 `Report`;`report.ts` 把同一个 `Report` 渲染成 JSON 与人类可读两种形态;`cli.ts` 是薄入口,负责解析 argv、调核心、按成败设退出码。整个数据流单向:`argv → scan → Report → render → stdout`。

## 两个接缝,不多留第三个

种子只授权两个接缝,设计严格只留这两个,其余一律写死,避免为终态提前抽象(对齐 lab 收敛纪律):

- **接缝一 · checker 可插拔**:所有 checker 实现同一个 `Checker` interface(`src/types.ts`),在 `src/checkers/index.ts` 用一个数组集中注册。加一条 checker 只碰这个数组,不动 `scan.ts` / `report.ts`。`scanRepo` 默认吃这个 registry,也接受注入的 checker 数组(测试注入用)。
- **接缝二 · report 结构化契约**:`Report` 的形状(`src/types.ts`)即种子钉死的 JSON 顶层结构。JSON 与人类可读都是这一个结构的投影,`renderJson` 不加任何字段。后续种子(优化建议、多技术栈…)挂到这两个接缝上,而不是改内核。

除此之外的东西——多技术栈适配、优化建议生成、Web UI、flag 框架、pnpm workspace——都是种子圈外,设计里不出现。

## 只读语义如何在结构上落死

种子要求"绝不修改目标仓库、无网络、无副作用"。设计上用三条结构约束兜住,而不只靠自觉:

1. 文件访问全部收口到 `src/fs-utils.ts`,只暴露 `readFileSafe` / `exists` / `readJsonSafe` 这类**只读**辅助,不暴露任何写函数。
2. `Checker.check(ctx)` 签名声明为**同步纯读**:入参是 `ScanContext`(已读好的 `repoPath` + `packageJson`),返回 `CheckResult`,没有可用来发起写/网络的入口。
3. 全仓不引入 `fs.write*`、`http`/`fetch`、`child_process`(CLI e2e 测试在 `tests/` 里起子进程属测试侧,不在被审逻辑内)。这条由人工层在 diff 上确认(review 点)。

## 模块切分

| 模块 | 职责 | 关键导出 |
|---|---|---|
| `src/types.ts` | 契约中心(接缝一 + 接缝二) | `CheckStatus`、`CheckResult`、`ScanContext`、`Checker`、`Report` |
| `src/fs-utils.ts` | 只读 fs 辅助 | `exists`、`readFileSafe`、`readJsonSafe` |
| `src/checkers/lint-config.ts` | 检查 (a) lint 配置 | `lintConfigChecker: Checker` |
| `src/checkers/test-signal.ts` | 检查 (b) 测试信号 | `testSignalChecker: Checker` |
| `src/checkers/ts-strict.ts` | 检查 (c) TS strict | `tsStrictChecker: Checker` |
| `src/checkers/index.ts` | 接缝一:集中注册数组 | `registry: Checker[]` |
| `src/scan.ts` | 前置校验 + 遍历 checker + 评分 | `scanRepo`、受控错误子类 |
| `src/report.ts` | 接缝二:两种渲染 | `renderJson`、`renderHuman` |
| `src/cli.ts` | 薄入口:argv → scan → render → exit code | shebang 可执行 |

### 类型契约(接缝一 / 接缝二 的落点)

```ts
type CheckStatus = 'pass' | 'fail' | 'not-applicable';
interface CheckResult { id: string; status: CheckStatus; evidence: string; }
interface ScanContext { repoPath: string; packageJson: Record<string, unknown>; }
interface Checker { id: string; check(ctx: ScanContext): CheckResult; }
interface Report {
  checks: CheckResult[];
  score: { passed: number; applicable: number };
}
```

### 评分规则(种子"评估从简"的落点)

`applicable = pass 数 + fail 数`(`not-applicable` 不计入分母),`passed = pass 数`。三项全 `not-applicable` 时 `score = { passed: 0, applicable: 0 }`,人类可读摘要显式标注"无适用检查项"。

### 错误语义(成功标准 6 的落点)

`scanRepo` 前置校验:路径不存在、或路径下无 `package.json`,抛受控 `Error` 子类(如 `ScanError`),不让底层异常裸奔。`cli.ts` 用 try/catch 兜住,打印清晰错误到 stderr、以非 0 退出码退出,保证无未捕获异常。

## 成功标准 → 设计落点 → 验证器(环节 B 自动层门禁的核心)

| # | 成功标准(摘要) | 由哪个模块 / 接缝兑现 | 由哪个验证器裁决 |
|---|---|---|---|
| 1 | 可装可构建,tsc 零错误出可执行 CLI | `package.json`(scripts + bin)、`tsconfig.json`、`src/cli.ts` shebang | `pnpm install && pnpm build` 本地 + CI(GitHub Actions ubuntu Node22)绿,exit 0 |
| 2 | all-green fixture → 3 项 pass、3/3、退出码 0 | `scan.ts` 评分 + 三条 checker + `cli.ts` 退出码 | `tests/scan.test.ts` 断言 status/score;`tests/cli.e2e.test.ts` 子进程断言退出码 0 |
| 3 | all-red fixture → 3 项 fail、0/3 | 同上三条 checker 的 fail 分支 + 评分 | `tests/scan.test.ts` 断言 3× fail、`score {0,3}` |
| 4 | non-ts fixture → strict 记 N/A 不计分母,另两项过 → 2/2 | `ts-strict.ts` 的 `not-applicable` 分支 + `scan.ts` 分母规则 | `tests/scan.test.ts` 断言 strict=N/A、`score {2,2}` |
| 5 | 同时输出机器 JSON 与人类可读文本,均由同一结构渲染 | 接缝二 `report.ts` 的 `renderJson` / `renderHuman` | `tests/scan.test.ts`(或 report 专项断言)校验 JSON 字段 + 人类可读包含性断言 |
| 6 | 坏输入报清晰错误、非 0 退出、无未捕获异常 | `scan.ts` 受控错误子类 + `cli.ts` try/catch | `tests/errors.test.ts` 断言受控错误;`tests/cli.e2e.test.ts` 断言坏输入退出码非 0 |
| 7 | checker 独立模块,加 checker 不动扫描/报告骨架 | 接缝一 `Checker` interface + `checkers/index.ts` 注册数组 | 自动层:`tsc` 保证 interface 契约、`tests/pluggability.test.ts` 注入新 checker 断言 `checks` 项数 +1;人工层:diff 只增未动骨架,PR review 确认 |

这张表是环节 B 自动层门禁的裁决对象:七条成功标准逐条有落点、每个落点挂得上验证器,且落点全部落在种子授权的两个接缝与固定 3 条检查内——无一项越出边界(无多技术栈、无优化建议、无写操作、无 workspace)。

## 验证资产:三个 committed fixture

三个 fixture 随仓库提交(`package.json` 标 `private: true`,避免被当成可发布包),保证测试可复现:

- `fixtures/all-green`:有 `scripts.test` + `.eslintrc.json` + `tsconfig.json` 含 `strict: true` → 预期 3/3。
- `fixtures/all-red`:无 `scripts.test`、无 `eslintConfig` 字段、无任何 lint 配置文件 + `tsconfig.json` 含 `strict: false` → 预期 0/3。
- `fixtures/non-ts`:有 `scripts.test` + `.eslintrc.json`、**无 `tsconfig.json`** → strict 记 N/A → 预期 2/2。

## 边界自检(环节 B 不越种子边界)

- 检查项恰好 3 条,`checkers/index.ts` 数组长度为 3,不含第 4 条。
- 无写操作:`fs-utils.ts` 不导出写函数,`Checker.check` 无写入口。
- 无网络、无 workspace、无 flag 框架、无优化建议、无 Web UI——这些种子圈外项在模块表里均不存在。
- 评分严格执行"N/A 不计入分母、全 N/A 记 0/0"。
