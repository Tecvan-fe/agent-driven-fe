# 种子 0001:工程化审查 CLI 最小内核

> 源自终态主题"跨技术栈工程化健康度审查/优化工具"的第一颗种子。这是"扫描 → 评估 → 报告"的最薄纵切,目标是立起后续所有迭代的骨架,而非覆盖终态能力。字段格式见 [`TEMPLATE.md`](./TEMPLATE.md)。

---

## 意图

构建工程化健康度审查工具的最小内核:一个只读 CLI,接受一个本地前端仓库路径,运行少数几条确定性工程化检查,输出结构化(JSON)与人类可读的健康度报告。此切片确立后续所有迭代的骨架——checker 可插拔、事实采集与健康判断解耦、report 作为结构化契约。

## 边界

- **技术栈**:工具自身用 TypeScript + Node.js(22)实现;pnpm 管理;CLI 形态;测试用 Vitest;CI 用 GitHub Actions。检查目标限定为含 `package.json` 的 Node/JS/TS 仓库。
- **检查项固定为 3 条,均为读文件即可判定的确定性检查**:(a) 是否存在 lint 配置(`.eslintrc*` / `eslint.config.*` / `package.json` 的 `eslintConfig` 字段任一);(b) 是否存在测试信号(`package.json` 的 `scripts.test` 存在,或仓库内存在 `*.test.*` / `*.spec.*` / `__tests__/`);(c) TypeScript 是否开启 `strict`(存在 `tsconfig.json` 且 `compilerOptions.strict === true`)。不增第 4 条。
- **只读**:工具绝不修改、写入或删除目标仓库的任何文件,无网络请求,无副作用。
- **评估从简**:每条检查输出 `pass` / `fail` / `not-applicable` 三态;总分为 `通过项 / 适用项` 的朴素比值,不加权、不分档。
- **圈外(本颗种子不做)**:多技术栈、自动优化建议、自动提 PR、睡后自迭代、被 AI 工具编排、复杂评分模型、可视化/Web UI。这些留给后续种子,挂到本切片的三个接缝(checker 可插拔 / 事实与判断解耦 / report 结构化契约)上。

## 成功标准

1. 仓库可安装可构建:`pnpm install` 成功,`pnpm build`(tsc)零错误产出可执行 CLI。
2. 对一个"三项全绿"的样例仓库(fixture)运行 CLI,report 三条检查均为 `pass`,总分 `3/3`,进程退出码为 0。
3. 对一个"三项全红"的样例仓库(fixture:无 lint 配置、无测试信号、有 `tsconfig.json` 但 `strict:false`)运行 CLI,三条检查均为 `fail`,总分 `0/3`。
4. 对一个"非 TS 项目"样例仓库(fixture:无 `tsconfig.json`),TS strict 检查记为 `not-applicable`,不计入分母(如另两项通过则为 `2/2`)。
5. CLI 同时输出机器可读 JSON(结构固定:每项含 `id` / `status` / `evidence`,及总分字段)和人类可读文本摘要。
6. 传入不存在的路径或无 `package.json` 的目录时,CLI 报清晰错误并以非 0 退出码退出,不抛未捕获异常。
7. 每条 checker 是独立模块,新增一条 checker 无需改动扫描/报告骨架(以代码结构与一个"如何加 checker"的说明佐证)。

## 验证器声明

- **成功标准 1(可装可构建)**:`pnpm install && pnpm build` 在 CI(GitHub Actions,ubuntu-latest,Node 22)与本地均通过,exit code 0。判据:CI 该 job 绿。
- **成功标准 2/3/4(三种 fixture 的检查结论与评分)**:单元/集成测试(Vitest),对三个 committed fixture 目录调用核心扫描函数,断言每项 `status` 与总分精确等于预期值。判据:`pnpm test` 全通过,CI 绿。fixtures 随仓库提交,保证可复现。
- **成功标准 5(双格式输出)**:测试断言 JSON 结构含约定字段(`id` / `status` / `evidence` 与总分);人类可读摘要用快照或包含性断言校验。判据:对应测试通过。
- **成功标准 6(错误处理)**:测试对"不存在路径""无 `package.json` 目录"两种输入断言:抛出的是受控错误 / CLI 退出码非 0、无未捕获异常。判据:对应测试通过。
- **成功标准 7(checker 可插拔)**:以两个手段客观佐证——(i) 类型层面,checker 实现统一 interface,`tsc` 保证契约;(ii) 提供一段"新增 checker"的最小示例/说明,并由一个测试证明注册新 checker 后报告项数量相应增加,骨架代码未改。判据:该测试通过 + tsc 通过。
- **贯穿验证器(CLAUDE.md 铁律 1)**:本颗种子及其实现全程走 `分支 → PR → 合入 main`,不直推。判据:改动以 PR 形式出现在 git 历史中。
