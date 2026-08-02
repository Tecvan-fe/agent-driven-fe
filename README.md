# agent-driven-fe

**AI 自驱前端工程的样本靶场 / sample harness lab。**

这个仓库是 [deep-in-AGA](https://github.com/Devil-Training-Camp/deep-in-AGA) 前端工程化教程的配套样本工程。它的存在意义不是交付一个业务产品,而是提供一个真实可跑的靶场:在这里,AI 基于少量种子(意图 + 边界 + 成功标准 + 验证器声明)自驱地推进需求 → 设计 → 编码 → 调试 → 集成 → 上线,人类只在关键节点通过 PR + comment 介入。

仓库的 git 历史本身就是教程要展示的产物——每一轮 AI 自驱的 commit 与 PR 轨迹,是"上下文保鲜""PR 往复协作"这些机制的实证。

## 约束

- 全程只用公开工具链(GitHub Actions / Sentry / Turborepo 等),不掺任何内部信息。
- public 仓库,可复现。

## 状态

初始化中。需求与设计资产、代码尚未产出。
