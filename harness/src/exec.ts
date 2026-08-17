/**
 * 子进程封装:promisify 的 execFile,统一给 gh / git / claude 用。
 * 走 execFile(参数数组、不经 shell),从根上杜绝 shell 注入——评论正文里的
 * 任何字符都只会作为单个参数或 stdin 传入,不会被解释为命令。
 */
import { execFile } from 'node:child_process';

/** 一次子进程执行的结果。 */
export interface ExecResult {
  /** 退出码;正常退出为 0。 */
  exitCode: number;
  /** 标准输出。 */
  stdout: string;
  /** 标准错误。 */
  stderr: string;
}

/** execFile 的可选项子集。 */
export interface ExecOptions {
  /** 工作目录。 */
  cwd?: string;
  /** 写入子进程 stdin 的内容(如 claude -p 的 prompt)。 */
  input?: string;
  /** 超时毫秒,超时后杀进程并以非 0 结束。 */
  timeoutMs?: number;
  /** 输出缓冲上限,默认 10MB(claude -p 的 json 输出可能较大)。 */
  maxBuffer?: number;
}

/**
 * 执行一个命令。**永不 reject**——把非 0 退出、超时、找不到可执行文件
 * 统一收敛为 { exitCode, stdout, stderr },让调用方按 exitCode 分支处理,
 * 而不必到处 try/catch。找不到命令时 exitCode 记为 127(约定)。
 *
 * @param command 可执行文件名(gh / git / claude)。
 * @param args 参数数组。
 * @param options 见 {@link ExecOptions}。
 */
export function run(command: string, args: string[], options: ExecOptions = {}): Promise<ExecResult> {
  return new Promise((resolve) => {
    const child = execFile(
      command,
      args,
      {
        cwd: options.cwd,
        timeout: options.timeoutMs ?? 0,
        maxBuffer: options.maxBuffer ?? 10 * 1024 * 1024,
        encoding: 'utf8',
      },
      (error, stdout, stderr) => {
        if (error === null) {
          resolve({ exitCode: 0, stdout, stderr });
          return;
        }
        // execFile 的 error 带 code:数字为退出码,字符串(如 ENOENT)记 127。
        const code = typeof error.code === 'number' ? error.code : 127;
        resolve({ exitCode: code, stdout, stderr });
      },
    );
    if (options.input !== undefined && child.stdin !== null) {
      child.stdin.end(options.input);
    }
  });
}
