# harness —— PR 评论 → 本地 daemon → agent 改一版

把「人在 PR 上留言 → AI 收到消息、改一版再提交」这条闭环补全的常驻服务。它监听 GitHub webhook,收到带触发词的 PR 评论后,在本地 checkout 对应分支、跑 `claude -p` 改代码、commit、push,再回一条评论。

这是本仓库「AI 提 PR → 人 comment → AI 改一版」协作形态的可运行实证。daemon 本身不经它自己触发——它就是那台在旁边转的机器。

## 为什么打回本地,而不是跑在云上

同样是「评论触发 agent」,GitHub 官方的 coding agent 跑在云端:优点是免机器、免隧道、不暴露公网端口;代价是必须在云端注入模型 API key,且用的是云端环境,复用不了你本机已登录的 Claude Code CLI。

这里选相反的一端——webhook 打回本地——就是为了**复用本机已登录的 Claude Code,零云端密钥**。它换来的是运维脆弱性:自有机器得常亮、免费档隧道域名重启即变要重注册、本地端口经隧道暴露公网(仅靠 HMAC 验签兜底)。这笔账在第 2 章「代价与权衡」里展开。

## 数据流

```
GitHub ──webhook──▶ 隧道(cloudflared/ngrok) ──▶ localhost:PORT/webhook (server.ts)
  读原始 body(不 parse)
  → 验签(X-Hub-Signature-256)         失败 → 401
  → 去重(X-GitHub-Delivery)           命中 → 200 duplicate
  → 解析事件(issue_comment / review)  非 PR 评论 → 200 ignored
  → 受理判定(含触发词 && 无机器标记)  拒绝 → 200 记 reason
  → 入队 + 记账                        → 200 queued(始终亚秒级返回)

worker(单 worker 串行 drain,同一分支永不并行):
  记账 started → 补分支(issue_comment 需 gh pr view 兜底)
  → git 清洁 checkout → claude -p 改代码
  → 有新 commit:push + 回评论(成功摘要) → 记账 succeeded
  → 无改动:回评论(未改动)              → 记账 succeeded
  → agent 失败:回评论(失败原因)         → 记账 failed
```

回帖由 `gh-reply` 强制包上 `🤖 [agent] … <!-- agent-reply -->` 并剥掉触发词——回到 webhook 时被「含机器标记」和「无触发词」双重拦下,回路不自激。`gh` 认证身份既是人类 reviewer 又是 agent 身份,防循环不能靠作者 login,只能靠这套标记约定。

## 安全边界

- **验签**:对原始 body 做 HMAC-SHA256,先长度校验再 `timingSafeEqual`,验签前绝不 `JSON.parse`。
- **沙箱**:cwd 与 `--add-dir` 锁死 `HARNESS_LAB_DIR`;工具白名单只给 `git add/commit/status/diff/log`、`Read/Edit/Write`;禁 `git push/reset/checkout/switch`、`rm`、`WebFetch/WebSearch`。push 由 daemon 在 agent 成功退出后统一执行,agent 无法误推别的分支。
- **崩溃恢复**:`state/jobs.jsonl` 追加式记账,启动时重放未达终态的 job;`ensureCleanCheckout` 每次 `fetch`+`checkout -B`+`reset --hard`+`clean -fd`,幂等可安全重跑(at-least-once,极端情况下可能重复 push/回评论一次)。

## 起步

零运行时依赖,只用 Node 内置模块 + 外部 CLI(`gh`/`git`/`claude`)。需要 Node >= 22、已登录的 `gh` 与 `claude`。

**1. 装隧道**(把公网流量转发到本机,任选其一,单独进程跑):

```bash
brew install cloudflared
# 起 daemon 后另开一个终端:
cloudflared tunnel --url http://localhost:8787
# 记下它打印的 https://xxx.trycloudflare.com,下一步注册 webhook 要用
```

**2. 填配置**:

```bash
cd harness
cp .env.example .env
# 编辑 .env:填 HARNESS_REPO_OWNER / HARNESS_REPO_NAME / HARNESS_LAB_DIR(lab 绝对路径)
# 生成 webhook 密钥并填入 HARNESS_WEBHOOK_SECRET:
openssl rand -hex 20
```

**3. 注册 webhook**(config.secret 必须与 .env 里的 HARNESS_WEBHOOK_SECRET 一致):

```bash
gh api -X POST repos/<owner>/<repo>/hooks \
  -f name=web \
  -F active=true \
  -f 'events[]=issue_comment' \
  -f 'events[]=pull_request_review_comment' \
  -f config[url]=https://xxx.trycloudflare.com/webhook \
  -f config[content_type]=json \
  -f config[secret]=<同 .env 的 HARNESS_WEBHOOK_SECRET>
```

**4. 装依赖、构建、起 daemon**:

```bash
pnpm install
pnpm build
pnpm start          # 起在 HARNESS_PORT(默认 8787)
```

**5. 联调**:在目标仓库的某个 PR 上评论 `@claude <一条小改动要求>`,看 daemon 日志走完验签 → 受理 → checkout → `claude -p` → commit → push → 回评论。daemon 的回复回到 webhook 时应被过滤(reason 带机器标记),回路不自激即为通过。

## 脚本

| 命令 | 作用 |
|---|---|
| `pnpm build` | `tsc` 编译到 `dist/` |
| `pnpm start` | 起 daemon(`node dist/daemon.js`) |
| `pnpm dev` | 免构建直跑(`node --experimental-strip-types src/daemon.ts`) |
| `pnpm test` | `vitest run` 跑单元测试 |

无隧道本地联调:把 `HARNESS_DRY_RUN=1` 置入环境,跳过真跑 claude 与 push,只验证入站编排(验签 → 去重 → 解析 → 受理 → 入队)。

## v1 不做

会话续跑(`--resume`)、不同 PR 并行 worker、隧道自动守护/重注册、独立 bot 账号、Web UI/指标面板、行级精确回帖、多仓库、rate-limit。这些留待后续。
