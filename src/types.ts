/**
 * 契约中心。种子 0001 的两个接缝都钉死在这里:
 * - 接缝一(checker 可插拔):{@link Checker} interface。
 * - 接缝二(report 结构化契约):{@link Report} 的形状即种子钉死的 JSON 顶层结构。
 *
 * 后续种子(优化建议、多技术栈…)挂到这两个类型上,而不是改内核。
 */

/** 单条检查的三态结论。`not-applicable` 表示该检查对当前仓库不适用,不计入评分分母。 */
export type CheckStatus = 'pass' | 'fail' | 'not-applicable';

/** 单条检查的结果。字段与种子钉死的 JSON 契约一一对应。 */
export interface CheckResult {
  /** checker 的稳定标识,如 `lint-config`。 */
  id: string;
  status: CheckStatus;
  /** 判定依据的人类可读说明,如"发现 .eslintrc.json"。 */
  evidence: string;
}

/**
 * 传给每个 checker 的只读上下文。由 {@link scanRepo} 预先读好,
 * checker 不再自行触碰文件系统之外的东西——这是只读语义的结构约束之一。
 */
export interface ScanContext {
  /** 被审仓库的绝对/相对路径,已校验存在且含 package.json。 */
  repoPath: string;
  /** 已解析的 package.json 内容。 */
  packageJson: Record<string, unknown>;
}

/**
 * 接缝一。一条工程化检查即一个 Checker。`check` 声明为同步纯读:
 * 入参是已读好的上下文,返回一条结论,没有可用来发起写/网络的入口。
 */
export interface Checker {
  /** 稳定标识,同时作为 CheckResult.id。 */
  id: string;
  check(ctx: ScanContext): CheckResult;
}

/**
 * 接缝二。审查报告的顶层结构,即种子钉死的 JSON 契约。
 * JSON 与人类可读文本都是这一个结构的投影,不额外加字段。
 */
export interface Report {
  checks: CheckResult[];
  /**
   * 朴素评分:`passed` 为 pass 数,`applicable` 为 pass+fail 数
   * (not-applicable 不计入)。全 not-applicable 时为 `{ passed: 0, applicable: 0 }`。
   */
  score: {
    passed: number;
    applicable: number;
  };
}
