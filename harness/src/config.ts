/**
 * 配置加载:读 .env(零依赖手工解析)→ 校验必填 → 冻结为 {@link AppConfig}。
 * 缺必填项或取值非法时抛 {@link ConfigError},让 daemon 启动即失败、不带病运行。
 */
import { readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import type { AppConfig } from './types.js';
import { ConfigError } from './errors.js';

/**
 * 极简 .env 解析:每行 KEY=VALUE,忽略空行与 # 注释,不做变量插值、不去引号转义。
 * 只认第一个 = 号,值里含 = 也安全。返回普通对象。
 */
function parseEnvFile(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith('#')) {
      continue;
    }
    const eq = line.indexOf('=');
    if (eq === -1) {
      continue;
    }
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    if (key.length > 0) {
      out[key] = value;
    }
  }
  return out;
}

/**
 * 读取 .env 文件叠加到 process.env 之上——文件不存在则只用 process.env,
 * 便于用真实环境变量覆盖(如 CI 或 launchd 注入)。文件里的值不覆盖已存在的 process.env。
 */
function readEnv(envPath: string): Record<string, string> {
  let fileEnv: Record<string, string> = {};
  try {
    fileEnv = parseEnvFile(readFileSync(envPath, 'utf8'));
  } catch {
    // .env 不存在或不可读:退回纯 process.env。
  }
  const merged: Record<string, string> = { ...fileEnv };
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined) {
      merged[k] = v;
    }
  }
  return merged;
}

/** 取必填项,缺失或空串即抛 ConfigError。 */
function required(env: Record<string, string>, key: string): string {
  const v = env[key];
  if (v === undefined || v.trim().length === 0) {
    throw new ConfigError(`缺少必填配置:${key}(请在 .env 或环境变量中设置)`);
  }
  return v.trim();
}

/** 取可选项,缺失时用默认值。 */
function optional(env: Record<string, string>, key: string, fallback: string): string {
  const v = env[key];
  return v === undefined || v.trim().length === 0 ? fallback : v.trim();
}

/**
 * 加载并校验配置。
 *
 * @param cwd 解析相对路径(stateDir/logDir/labDir)与定位 .env 的基准目录,默认进程 cwd。
 * @throws {ConfigError} 缺必填项、端口非法、或 labDir 非绝对路径。
 */
export function loadConfig(cwd: string = process.cwd()): AppConfig {
  const env = readEnv(resolve(cwd, '.env'));

  const portRaw = optional(env, 'HARNESS_PORT', '8787');
  const port = Number.parseInt(portRaw, 10);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new ConfigError(`HARNESS_PORT 非法:${portRaw}(需为 1-65535 的整数)`);
  }

  const labDir = required(env, 'HARNESS_LAB_DIR');
  if (!isAbsolute(labDir)) {
    throw new ConfigError(`HARNESS_LAB_DIR 必须是绝对路径:${labDir}`);
  }

  const stateDir = resolve(cwd, optional(env, 'HARNESS_STATE_DIR', './state'));
  const logDir = resolve(cwd, optional(env, 'HARNESS_LOG_DIR', './logs'));

  const config: AppConfig = {
    repoOwner: required(env, 'HARNESS_REPO_OWNER'),
    repoName: required(env, 'HARNESS_REPO_NAME'),
    port,
    webhookSecret: required(env, 'HARNESS_WEBHOOK_SECRET'),
    triggerWord: optional(env, 'HARNESS_TRIGGER_WORD', '@claude'),
    labDir,
    model: optional(env, 'HARNESS_MODEL', 'sonnet'),
    stateDir,
    logDir,
    dryRun: optional(env, 'HARNESS_DRY_RUN', '0') === '1',
  };

  return Object.freeze(config);
}
