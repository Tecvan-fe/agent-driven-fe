/**
 * 受控错误类型。仿主包 ScanError——每个子类设 this.name,
 * 让上层能按类型区分「配置问题 / 验签失败 / agent 执行失败」并给出清晰信息。
 */

/** 配置缺失或非法(.env 缺必填项、端口非数字等)。 */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

/** webhook 验签失败(签名头缺失、格式错、HMAC 不匹配)。 */
export class SignatureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SignatureError';
  }
}

/** agent 或其前置的 git 操作执行失败。 */
export class AgentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AgentError';
  }
}
