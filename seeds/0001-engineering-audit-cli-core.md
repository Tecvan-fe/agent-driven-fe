# 种子 0001:工程化审查 CLI 最小内核

> 源自终态主题"跨技术栈工程化健康度审查/优化工具"的第一颗种子。这是"扫描 → 评估 → 报告"的最薄纵切,目标是立起后续所有迭代的骨架,而非覆盖终态能力。字段格式见 [`TEMPLATE.md`](./TEMPLATE.md)。

---

## 意图

构建工程化健康度审查工具的最小内核:一个只读 CLI,接受一个本地前端仓库路径,运行少数几条确定性工程化检查,输出结构化(JSON)与人类可读的健康度报告。此切片确立后续所有迭代的骨架——checker 可插拔、report 作为结构化契约。

## 边界

- **技术栈**:工具自身用 TypeScript + Node.js(22)实现;pnpm 管理;CLI 形态;测试用 Vitest;CI 用 GitHub Actions。检查目标限定为含 `package.json` 的 Node/JS/TS 仓库。
- **检查项固定为 3 条,均为读文件即可判定的确定性检查**:(a) 是否存在 lint 配置(`.eslintrc*` / `eslint.config.*` / `package.json` 的 `eslintConfig` 字段任一);(b) 是否存在测试信号(`package.json` 的 `scripts.test` 存在,或仓库内存在 `*.test.*` / `*.spec.*` / `__tests__/`);(c) TypeScript 是否开启 `strict`(存在 `tsconfig.json` 且 `compilerOptions.strict === true`)。不增第 4 条。
- **只读**:工具绝不修改、写入或删除目标仓库的任何文件,无网络请求,无副作用。
- **评估从简**:每条检查输出 `pass` / `fail` / `not-applicable` 三态;总分为 `通过项 / 适用项` 的朴素比值,不加权、不分档。**`not-applicable` 不计入分母**——分母只数状态为 `pass` 或 `fail` 的适用项,三项全 `not-applicable` 时总分记为 `0/0`(报告显式标注"无适用检查项")。
- **report 顶层结构(后续迭代的契约,本颗即钉死)**:JSON 顶层形如 `{ "checks": [{ "id": string, "status": "pass"|"fail"|"not-applicable", "evidence": string }], "score": { "passed": number, "applicable": number } }`。`score` 用 `{passed, applicable}` 两个整数表达而非约分字符串,便于后续种子挂接。人类可读摘要由此结构渲染,不引入额外字段。
- **圈外(本颗种子不做)**:多技术栈、自动生成优化建议、向被审仓库自动提修复 PR、复杂评分模型、可视化/Web UI。更远的终态能力(睡后自迭代、被 AI 工具编排)自然也不在本颗内。这些留给后续种子,挂到本切片的两个接缝(checker 可插拔 / report 结构化契约)上。

## 成功标准

1. 仓库可安装可构建:`pnpm install` 成功,`pnpm build`(tsc)零错误产出可执行 CLI。
2. 对一个"三项全绿"的样例仓库(fixture)运行 CLI,report 三条检查均为 `pass`,总分 `3/3`,进程退出码为 0。
3. 对一个"三项全红"的样例仓库(fixture:无 lint 配置、无测试信号、有 `tsconfig.json` 但 `strict:false`)运行 CLI,三条检查均为 `fail`,总分 `0/3`。
4. 对一个"非 TS 项目"样例仓库(fixture:无 `tsconfig.json`),TS strict 检查记为 `not-applicable`,不计入分母(如另两项通过则为 `2/2`)。
5. CLI 同时输出机器可读 JSON(结构即边界中钉死的 `checks[]` + `score` 契约)和由该结构渲染的人类可读文本摘要。
6. 传入不存在的路径或无 `package.json` 的目录时,CLI 报清晰错误并以非 0 退出码退出,不抛未捕获异常。
7. 每条 checker 是独立模块,新增一条 checker 无需改动扫描/报告骨架(以代码结构与一个"如何加 checker"的说明佐证)。

## 验证器声明

- **成功标准 1(可装可构建)**:`pnpm install && pnpm build` 在 CI(GitHub Actions,ubuntu-latest,Node 22)与本地均通过,exit code 0。判据:CI 该 job 绿。
- **成功标准 2/3/4(三种 fixture 的检查结论与评分)**:单元/集成测试(Vitest),对三个 committed fixture 目录调用核心扫描函数,断言每项 `status` 与 `score` 的 `passed`/`applicable` 精确等于预期值。判据:`pnpm test` 全通过,CI 绿。fixtures 随仓库提交,保证可复现。**另加一条端到端测试**:实际以子进程方式跑 CLI 二进制、传入 fixture 路径,断言进程退出码为 0(成功标准 2 的退出码要求落在进程层,核心函数返回值覆盖不到)。
- **成功标准 5(双格式输出)**:测试断言 JSON 结构含约定字段(`id` / `status` / `evidence` 与总分);人类可读摘要用快照或包含性断言校验。判据:对应测试通过。
- **成功标准 6(错误处理)**:测试对"不存在路径""无 `package.json` 目录"两种输入断言:抛出的是受控错误 / CLI 退出码非 0、无未捕获异常。判据:对应测试通过。
- **成功标准 7(checker 可插拔)**:分两层验证,并明确区分哪层能自动裁决。自动层:(i) 类型上 checker 实现统一 interface,`tsc` 保证契约;(ii) 一个测试证明注册新 checker 后报告的 `checks` 项数相应 +1。这两条能机械裁决"新 checker 能挂上、契约成立"。人工层:"新增 checker **无需改动**扫描/报告骨架"这一条无法由测试裁决(diff 是否只新增、未动骨架属人工判断),作为 PR 审阅点由人在 diff 上确认,不计入自动验证器。判据:自动层测试 + tsc 通过;人工层在 PR review 记录确认结论。
- **贯穿验证器(CLAUDE.md 铁律 1)**:本颗种子及其实现全程走 `分支 → PR → 合入 main`,不直推。判据:改动以 PR 形式出现在 git 历史中。
