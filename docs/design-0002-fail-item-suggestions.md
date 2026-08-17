# 设计 0002:为 fail 项生成改进建议

> 本文对齐种子 [`seeds/0002-fail-item-suggestions.md`](../seeds/0002-fail-item-suggestions.md),是流程引擎蓝图 [环节 B(设计)](./engine-blueprint.md) 的产出物。任务是把种子每条成功标准落到"由哪个模块 / 接缝兑现、由哪个验证器裁决"上,证明设计既覆盖全部标准、又不越出种子边界(尤其不碰种子明列圈外的自动修复 / 修复 PR)。它挂在 0001 钉死的两个接缝上——checker 可插拔、report 结构化契约——不改内核语义。0001 的现有契约见 [`design-0001-audit-cli.md`](./design-0001-audit-cli.md)。

---

## 输入与产出

输入是已通过环节 A 的种子 0002(已随 PR #6 合入 main),以及 0001 已落地的内核:`CheckResult = { id, status, evidence }`、`Checker.check(ctx) => CheckResult`、`Report = { checks, score }`、`report.ts` 的 `renderJson` / `renderHuman` 双投影。本节结束时产出这份设计文档,交由环节 B 门禁裁决:自动层查"每条成功标准有落点、不越边界",人工层在 PR 上确认接缝切得对不对。

0001 只回答"哪条检查没过";0002 在此之上,为每条 `status === 'fail'` 的检查附一句改进建议,把工具从"报状态"推进到"报状态 + 给方向"。仍然只读、不动手改被审仓库。

## 一句话方案

给 `CheckResult` 增一个可选字段 `suggestion?: string`,由**产出这条 fail 结论的 checker 自己**在返回结果时一并填上——建议逻辑和检查逻辑在同一个 checker 模块里,不新起游离的"建议引擎"。`scan.ts` 骨架一个字不改(它只是把 checker 返回的结果原样收进 `checks[]`);`report.ts` 的两种渲染各自读同一个 `suggestion` 字段投影出来,保证双格式同源。数据流仍是 0001 的单向链:`argv → scan → Report → render → stdout`,只是在 `CheckResult` 这一节点上多带了一个可选字段。

---

## 四个欠定义点的取舍

种子文末列了四处有意留空的点。逐个给出判断、理由、以及放弃的备选——这些取舍是本设计的核心,不能留在脑子里。

### 1. 建议落在 report 契约的什么位置:给 `CheckResult` 加可选字段,不另开顶层数组

**判断**:在 `CheckResult` 上加一个可选字段 `suggestion?: string`,建议就贴着它所属的那条 fail 结果。**放弃**在 `Report` 顶层另开一个 `suggestions: []` 数组。

**为什么**:先看两个备选对 0001 契约的冲击面。

- **顶层数组**方案要在 `Report` 上加一个和 `checks[]` 平行的 `suggestions[]`,数组里每个元素得再带一个 `checkId` 去指回是哪条检查的建议。这等于在报告里维护两份靠 id 关联的列表——读的人要做一次 join 才能把"某条 fail"和"它的建议"对上,写的人(未来加 checker 的人)要在两处保持 id 一致。它把一条检查的信息拆到了两个地方。
- **可选字段**方案里,建议就是这条检查结果的一个属性,天然跟着它走。遍历 `checks[]` 时,fail 项手边就有 `suggestion`,不需要二次关联。

再看对 0001 结构化契约(接缝二)的冲击。0001 把 JSON 顶层钉成 `{ checks:[{id,status,evidence}], score:{passed,applicable} }`。加可选字段是**向后兼容的扩展**:字段可选,pass / not-applicable 项不带它,旧的消费方(只读 `id/status/evidence/score` 的)行为不变;顶层形状没动,`score` 更是原封不动。而顶层加 `suggestions[]` 是改动顶层形状——契约的"骨架"变了,对"后续种子挂接依赖它稳定"这一点冲击更大。

对后续种子是否友好也指向同一个选择。种子边界写明圈外还有"跨 checker 的聚合建议(如这几条一起说明项目缺 CI)"。**那种聚合建议才是天然的顶层结构**——它不属于任何单条检查。把"每条 fail 各自的建议"放进 `CheckResult`、把未来可能的"聚合建议"留给顶层,两类建议各归其位,互不挤占。现在就占用顶层数组,反而会和未来的聚合建议撞位置。

一句话:可选字段让"建议"和"它解释的那条 fail"物理相邻、契约向后兼容、且给未来的聚合建议腾出了顶层。

### 2. 建议是纯文本还是结构化:纯文本一句话,不带结构

**判断**:`suggestion` 就是一个 `string`,一句能读的话(为什么没过 + 往哪修)。**放弃**结构化的 `{ problem, action, docUrl? }`。

**为什么**:这正是种子点名的"够用就好 vs 提前设计"取舍点。先问结构化能换来什么——把建议拆成"问题短句 / 修复动作 / 文档链接",好处是消费方能分别渲染(比如只显示动作、或把链接做成超链)。但本颗种子里没有任何消费方需要分字段:JSON 就是给机器读的整串,人类可读摘要就是把这句话打印出来。为一个当前无人使用的区分度提前建模,是典型的提前设计。

再看代价。结构化字段一旦进契约就难缩回——`docUrl` 是可选的,三条 checker 里 strict 有官方文档可指、lint / test 指哪个"官方文档"本身就模棱两可,强行留字段会逼出一堆空值或牵强链接。而纯文本把"要不要提链接、提哪个"的自由留在文案里,想提就在句子里写、不想提就不写,零契约成本。

**边界守护**:种子把"够用就好"写进了推进者须知,并明确警告"不要默认往复杂了做"。纯文本是这条边界内的最小可用形态。结构化留给"真有消费方要分字段渲染"的那颗未来种子——到那时它会挂在同一个 `suggestion` 字段上演进(字符串 → 对象是一次可控的契约升级),而不是现在凭空预留。

### 3. 文案写死在 checker 里还是抽文案层:写死在 checker 里

**判断**:每条建议文案直接写在对应 checker 模块内(就像 0001 的 `evidence` 文案那样),**放弃**抽一个集中的文案表 / i18n 层。

**为什么**:先量规模——单一中文语种、三条 checker、每条一句建议。抽文案层(不管是 `messages.ts` 常量表还是 i18n 框架)要解决的是"文案多处复用 / 多语种切换 / 非工程人员改文案"这类问题,这三个在本颗种子里一个都不存在:文案不复用(一条 checker 一句、各不相同)、种子边界明写"中文单一语种、不为国际化预留框架"、也没有非工程改文案的诉求。

再看它和接缝一的关系。0001 的接缝一要的是"新增一条 checker,它的检查逻辑和产出**在同一处**进来,不用在别处再改一处"。建议文案是 checker 产出的一部分——把它写在 checker 里,恰好满足接缝一"一处收敛"的诉求;抽出去反而制造了第二处要改的地方(加 checker 时既改 checker、又改文案表),与接缝一背道而驰。0001 的 `evidence` 就是写死在 checker 里的,建议与它同级,同样处理最一致。

**放弃的备选**具体指"建一个 `src/suggestions.ts` 存 `{ checkerId: 文案 }` 映射"。它在三条 checker、单语种下纯是过度设计——种子第 3 个欠定义点几乎是自问自答地在提示这一点。

### 4. 上下文不足时的兜底:checker 自己保证 fail 分支总能给出有指向的建议

**判断**:建议文案的"有没有指向"由 checker 在自己的 fail 分支里保证——每条 checker 的 fail 只有明确的少数几种成因,文案直接指向"这条检查在找什么、没找到,该补什么",不依赖 evidence 里的动态细节。**放弃**引入一个跨 checker 的"建议为空时填 `请修复此项`"的全局兜底层。

**为什么**:先看这三条 checker 的 fail 到底缺不缺上下文。它们都是"找某个信号,没找到就 fail"的确定性检查——lint fail = 没找到任何 lint 配置、test fail = 没找到测试信号、strict fail = 有 tsconfig 但 `strict !== true`。fail 的成因是**收敛且已知**的,不存在"fail 了但不知道为什么、只能说句空话"的情况。所以每条建议都能写得具体(如 lint 项指向"添加 `.eslintrc.*` 或 `eslint.config.*`,或在 package.json 配 eslintConfig"),种子第 4 点担心的"空洞的请修复此项"在这三条上根本不会发生。

既然每条 checker 的 fail 分支都能各自给出有指向的建议,那"兜底"就应该是**每个 checker 的自我约束**(fail 必带非空建议),而不是一个全局补丁层。全局兜底层是在假设"某些 checker 会漏给建议"——但这个假设可以用更强的手段消除:让"fail 必有建议"成为类型 / 测试保证的不变量(见下文成功标准 5 的落点),而不是运行期兜一把。

**这条兜底约束落进结构**:约定 checker 的契约为"凡返回 `status:'fail'` 必带非空 `suggestion`";pass / not-applicable 必不带。这条约定由测试逐条 fixture 断言(fail 项 `suggestion` 非空、其余项无此字段),把"不出现空洞建议"从"写文案时小心"升级成"验证器裁决的不变量"。**放弃**的全局兜底之所以不要,是因为它掩盖问题(漏写建议时用一句废话糊过去),而测试不变量是暴露问题(漏写就红)。

---

## 挂在 0001 两个接缝上:具体怎么挂

种子要求本颗只挂在 0001 的两个接缝上、不改内核。下面说明每个接缝上"改什么、不改什么"。

### 接缝二 · report 结构化契约:只加一个可选字段

`src/types.ts` 的 `CheckResult` 从

```ts
interface CheckResult { id: string; status: CheckStatus; evidence: string; }
```

扩展为

```ts
interface CheckResult {
  id: string;
  status: CheckStatus;
  evidence: string;
  /** 改进建议。仅 status==='fail' 时给出且非空;pass / not-applicable 不带。 */
  suggestion?: string;
}
```

这是接缝二上**唯一**的类型改动。`Report` 顶层形状(`checks` + `score`)一字不动,`score` 的 `{passed, applicable}` 口径完全沿用——建议是附加信息,不参与算分(守住种子"不改评分"边界)。

`src/report.ts` 的两种渲染各自读 `suggestion` 投影:

- `renderJson`:在映射 `checks[]` 时,若该项有 `suggestion` 则带上、否则不带(可选字段,`JSON.stringify` 自然省略 `undefined`)。顶层结构不变。
- `renderHuman`:某条渲染出的行,若带 `suggestion` 则在该条下方补一行建议(如 `↳ 建议:…`);无则不补。

**双格式同源**(成功标准 3 的关键):两种渲染读的是同一个 `CheckResult.suggestion`,不各自持有一份文案。这是"表达一致"的结构保证——同源就不可能不一致。

### 接缝一 · checker 可插拔:建议逻辑随 checker 一起进来

三条 checker(`lint-config.ts` / `test-signal.ts` / `ts-strict.ts`)各自在自己的 fail 分支里,把 `suggestion` 一并填进返回的 `CheckResult`。举例(lint,示意):

```ts
return {
  id: this.id,
  status: 'fail',
  evidence: '未发现 .eslintrc* / eslint.config.* 文件或 package.json eslintConfig 字段',
  suggestion: '添加 ESLint 配置:新建 .eslintrc.json / eslint.config.js,或在 package.json 配置 eslintConfig 字段',
};
```

pass 与 not-applicable 分支不填 `suggestion`(守住种子"只针对 fail")。

**为什么这满足接缝一**:接缝一的诉求是"加一条 checker,检查逻辑 + 产出在同一处进来,不用在别处改"。建议逻辑写在 checker 的 fail 分支里,正是"同一处"——新增一条会 fail 的 checker 时,它的建议跟着它的 `check()` 一起来,`scan.ts` / `report.ts` / `checkers/index.ts` 骨架都不用动(`index.ts` 注册数组只在真的加 checker 时才 push,这与本颗无关)。`scan.ts` 把 checker 返回的 `CheckResult` 原样收进 `checks[]`,`suggestion` 作为对象的一个属性自然被带过,`scan.ts` 完全无感,一行不改。

这条也直接兑现成功标准 2:建议随 checker 定义、不动扫描 / 报告骨架。

---

## 模块改动清单(相对 0001,增量最小)

| 模块 | 0002 改动 | 说明 |
|---|---|---|
| `src/types.ts` | `CheckResult` 加可选 `suggestion?: string` | 接缝二上唯一类型改动;`Report` / `ScanContext` / `Checker` 不变 |
| `src/checkers/lint-config.ts` | fail 分支填 `suggestion`,指向 lint 配置 | 建议随 checker,守接缝一 |
| `src/checkers/test-signal.ts` | fail 分支填 `suggestion`,指向测试信号 | 同上 |
| `src/checkers/ts-strict.ts` | fail 分支填 `suggestion`,指向 strict;N/A 分支不填 | 同上 |
| `src/report.ts` | `renderJson` 带出可选字段、`renderHuman` fail 行下补建议行 | 接缝二双投影同源 |
| `src/scan.ts` | **不改** | 骨架原样收结果,`suggestion` 透传 |
| `src/checkers/index.ts` | **不改** | 注册数组与本颗无关 |
| `src/cli.ts` | **不改** | 薄入口,渲染由 report 负责 |
| `tests/*` | 新增 / 扩展断言(见下表) | 验证器随改动产出 |

**不改** 的四个模块是本设计"不动内核骨架"的直接证据——改动集中在 checker 的 fail 分支(建议来源)、types 的一个可选字段(契约扩展)、report 的投影(双格式落地),没有一处动到扫描 / 评分 / 注册骨架。

---

## 成功标准 → 设计落点 → 验证器(环节 B 自动层门禁的核心)

| # | 成功标准(摘要) | 由哪个模块 / 接缝兑现 | 由哪个验证器裁决 |
|---|---|---|---|
| 1 | fail 项带建议,pass / N/A 不带 | 各 checker 的 fail 分支填 `suggestion`、其余分支不填;接缝二 `CheckResult.suggestion?` | Vitest 遍历报告断言:`status==='fail'` 的项 `suggestion` 非空、其余项无 `suggestion`(`pnpm test` 绿、CI 绿) |
| 2 | 建议随 checker 定义,不动扫描 / 报告骨架 | 接缝一:建议逻辑写在 checker fail 分支;`scan.ts` / `report.ts` / `index.ts` 骨架不改 | 自动层:`tsc` 保证 `suggestion` 进入 `CheckResult` 契约 + 一个测试"注入一条会 fail 的新 checker,其 `suggestion` 出现在报告里、无需改骨架";人工层:diff 未动骨架由 PR review 确认 |
| 3 | JSON 与人类可读都体现建议,同一 fail 表达一致 | 接缝二:两种渲染读同一个 `CheckResult.suggestion`,不各写一份 | 测试断言 JSON 里某 fail 的 `suggestion` 与 `renderHuman` 输出中该条建议文本同源对应 |
| 4 | 三 fixture 行为:全绿无建议、全红 3 条各带建议、非 TS 的 strict 为 N/A 不带 | 沿用 0001 三 fixture(不新增);各 checker fail 分支 + N/A 分支 | Vitest 对三个 committed fixture 断言:all-green 报告无任何 `suggestion`;all-red 三条 fail 各带非空 `suggestion`;non-ts 的 strict 为 N/A 且无 `suggestion` |
| 5 | 建议与检查项匹配,不张冠李戴 | 每条 checker 的文案写在自己模块内,指向自己检查的信号 | 测试对 all-red fixture 断言每条 fail 的建议文本含其检查项关键指向(lint 建议提 lint 配置 / test 提测试 / strict 提 strict) |
| 贯穿 | 全程走分支 → PR → 合入 main,不直推 | 本设计 PR + 后续编码 PR | 改动以 PR 形式出现在 git 历史(本设计即以 `docs/0002-design` 分支 + PR 呈现) |

这张表是环节 B 自动层门禁的裁决对象:五条成功标准逐条有落点、每个落点挂得上验证器,且落点全部落在种子授权的两个接缝内——无一项越出边界。

## 边界自检(环节 B 不越种子边界)

逐条对照种子边界,证明设计没越圈:

- **只读不变、不提修复 PR**:`suggestion` 是产出的一个字符串字段,`report` 只把它打印 / 序列化,全程无写文件、无网络、无 `child_process`。种子明列圈外的"自动向被审仓库提修复 PR"在本设计里**不存在任何落点**——没有任何模块产出改动、发起 PR 或触碰被审仓库。这是本颗最需守住的边界。
- **只针对 fail**:pass / not-applicable 分支不填 `suggestion`,由测试对三 fixture 断言兜死。
- **不改评分**:`Report.score` 的 `{passed, applicable}` 口径一字不动,建议不参与算分。
- **不引额外技术栈 / Web UI / 多语言**:沿用 0001 的 TS + Node + Vitest + GitHub Actions;文案中文单一语种、写死在 checker 内,不建 i18n / 文案层。
- **不做圈外项**:无自动修复、无修复 PR、无建议优先级排序、无跨 checker 聚合建议、无外部 LLM 生成——这些在模块改动清单里均无落点。本颗只做"每条 fail 各自一句静态可判定的建议"。
- **契约最小扩展**:接缝二只加一个可选字段,顶层形状与 `score` 不变;接缝一不加新注册项(仍 3 条 checker)。没有为终态提前抽象(未抽文案层、未做结构化建议、未开顶层建议数组)。
