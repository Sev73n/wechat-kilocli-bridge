# wechat-kilo-bridge

将 [Kilo Code CLI](https://kilo.ai) 接入 微信 ClawBot 的桥接器：用户在微信里发消息 → bridge 转给 `kilo run` 推理 → 回复发回微信。

[![status: working](https://img.shields.io/badge/status-working-brightgreen.svg)]()
[![node: >=22](https://img.shields.io/badge/node-%3E%3D22-blue.svg)]()

## 功能

- 微信扫码登录、credentials 持久化（fork 后再次启动免重新扫码）
- 调用 Kilo CLI 推理并把结果原文回复给用户（支持 Markdown，自动按 3500 字符切片）
- "对方正在输入" 心跳：每 10 秒重发 typing，直到 Kilo 完成
- 24 小时会话窗口：同一用户 24 小时内的多轮对话共享一个 kilo session id；超过 24 小时自动开新 session（对齐微信会话规则）
- Allowlist：只响应预先登记的 wxid，避免被陌生人骚扰
- 自起独立 `kilo serve`：不复用 VS Code 已开的 kilo serve（避免 session 状态污染）
- 内置命令：`/help` `/new` `/sid` `/whoami`

## 架构

```
┌────────┐  iLink poll   ┌──────────┐  spawn kilo run   ┌────────────┐
│ 微信   │ ───────────▶ │ bridge   │ ────────────────▶ │ kilo serve │
│ ClawBot│ ◀─────────── │ (node22) │ ◀──────────────── │ (本地独立) │
└────────┘  sendMessage  └──────────┘  JSON event 流    └────────────┘
                              │
                              ├── data/wechat-credentials.json
                              ├── data/sessions.json   (peer → {sessionId, lastUsedAt})
                              ├── data/allowlist.json
                              └── data/sync-buf.json
```

**核心模块**：

| 文件 | 职责 |
|------|------|
| `src/index.ts` | 主循环：拉消息 → typing keepalive → runKilo → sendText |
| `src/kilo-runner.ts` | 启动 `kilo serve`、`spawn kilo run`、解析 JSON 事件流 |
| `src/session-store.ts` | 持久化 peer→sessionId 映射，24h TTL |
| `src/allowlist.ts` | 白名单 wxid 校验 |
| `src/commands.ts` | `/help` `/new` `/sid` `/whoami` 处理 |
| `vendor/wechat-ilink-client/` | 微信 iLink 协议客户端（自带 typing/contextToken 处理） |

## 测试通过的环境

- OS: Linux (Ubuntu/Debian-like)
- Node: **22.22.3** (用 nvm 管理；Node 20 不兼容 `--experimental-strip-types`)
- pnpm: 用于构建 vendor 子项目
- Kilo CLI: **7.3.0** (`kilo --version`)
- 终端复用: tmux（用于把 bridge 跑在 detached session 里）

## 从零部署（Fork 后复刻步骤）

### 1. Node 22 + Kilo CLI

```bash
# 安装 nvm + node 22
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.nvm/nvm.sh
nvm install 22
nvm use 22

# 全局安装 Kilo CLI
npm install -g @kilocode/cli
kilo --version    # 期望 7.3.0+

# 完成 Kilo CLI 初次登录（一次性）
kilo            # 按提示完成 provider/model 配置
```

### 2. Clone 仓库 + 构建 vendor

```bash
git clone <your-fork-url> wechat-kilo-bridge
cd wechat-kilo-bridge

# vendor 子项目（dist/ 被 ignore，必须本地构建）
cd vendor/wechat-ilink-client
pnpm install
pnpm build           # 产出 dist/index.mjs，被 src/index.ts import
cd ../..

# 主项目依赖
npm install
```

### 3. 配置 allowlist

至少添加一个允许使用 bot 的 wxid，否则启动会报错退出：

```bash
mkdir -p data
echo '["o9cq80xxxxxxxxxxxxxxxxxxxx@im.wechat"]' > data/allowlist.json
```

不知道自己 wxid？先临时把 allowlist 设为 `["*"]`（**仅用于首次摸 wxid**），启动 bridge，给 bot 发 `/whoami`，把返回的 ID 写回 allowlist，再去掉 `*`。

### 4. 启动

```bash
# 直接前台跑
npm start

# 或后台（tmux）
tmux new-session -d -s wechat-bridge "npm start 2>&1 | tee -a data/bridge.log"
tmux attach -t wechat-bridge        # 查看日志
```

**首次启动**会在终端打印二维码，用 ClawBot 微信号扫码登录。登录成功后 credentials 存在 `data/wechat-credentials.json`，下次免扫码。

### 5. 验证

在微信里给 bot 发 `你好`，看 bridge 日志应该出现：

```
[msg] < o9cq80...@im.wechat > 你好
[bridge] Running kilo for o9cq80...@im.wechat sid= (new)
[bridge] Starting dedicated kilo serve...
[bridge] Kilo server listening at http://127.0.0.1:36003
```

微信里看到"对方正在输入"持续一段时间，然后收到回复。

## 环境变量

| 变量 | 默认 | 说明 |
|------|------|------|
| `KILO_BIN` | `kilo` (PATH 查找) | Kilo CLI 二进制路径。VS Code 扩展自带的也行，例：`/home/user/.vscode-server/extensions/kilocode.kilo-code-7.3.0-linux-x64/bin/kilo` |
| `KILO_SERVER_URL` | (空) | 若设置则 attach 到这个已存在的 kilo serve；**强烈建议不设**，让 bridge 自起独立 serve |
| `KILO_WORK_DIR` | `/tmp/kilo-wechat-workspace` | Kilo 推理的工作目录 |

## 数据目录 `data/`

被 gitignore，每个 fork 用户都是空的。Bridge 启动后会创建：

| 文件 | 说明 |
|------|------|
| `wechat-credentials.json` | 微信扫码登录后的 token/accountId，**0600 权限**，删除会强制重新扫码 |
| `sessions.json` | `peer wxid → {sessionId, lastUsedAt}`，24h TTL |
| `allowlist.json` | 允许使用 bot 的 wxid 数组，**必须**预先创建 |
| `sync-buf.json` | iLink 长轮询的游标，断点续传用 |
| `bridge.log` | tail 日志 |

## 内置命令

| 命令 | 行为 |
|------|------|
| `/help` | 显示帮助 |
| `/new` | 清掉当前用户的 session，下条消息开新会话 |
| `/sid` | 显示当前 session id |
| `/whoami` | 回显发送者的 wxid（首次摸 wxid 用） |

## 常见问题

### Q: 微信里看到"(empty response)"

老 bug，已修复。如果还出现，说明你跑的不是 master：`git log --oneline` 确认最新提交里有 "fix: remove (empty response) fallback"。

### Q: 微信里只看到几秒"正在输入"然后就没动静

老 bug，已修复（typing keepalive 现在每 10s 续命）。同上确认代码版本。

### Q: `kilo returned empty text — skipping send`

说明 `kilo run` 没产出任何 text 事件。可能原因：
1. Kilo CLI 没初始化（没配 provider/model）→ 跑一次 `kilo` 完成初次配置
2. `KILO_SERVER_URL` 指向了死端口 → 取消该环境变量，让 bridge 自起
3. Kilo 内部报错被吞掉 → bridge 日志会有 stderr 尾段，按提示排查

### Q: `Kilo spawn error: name=AbortError ...`

`runKilo` 超时（默认 5 分钟）或者 kilo serve 进程崩溃。看 bridge 日志里 kilo serve 的 stderr。

### Q: 端口已被占用

bridge 起的 kilo serve 用随机端口；如果系统耗尽端口才会失败。tmux 里关掉旧 bridge：`tmux kill-session -t wechat-bridge`，并 `pkill -f "kilo serve"` 清理可能遗留的孤儿进程。

### Q: 多个 ClawBot 账号怎么办？

当前实现一个 bridge 进程对应**一个**微信账号（一个 credentials 文件）。多账号请跑多个 bridge 实例，每个用独立的 `KILO_WORK_DIR` + 独立的 `data/` 目录。

## 调试

```bash
# 实时看日志
tail -f data/bridge.log

# 看 bridge 自起的 kilo serve（监听端口）
ss -tlnp 2>/dev/null | grep kilo

# 看 bridge 进程
ps -ef | grep src/index.ts

# 重启
tmux kill-session -t wechat-bridge
npm start    # 或重新 tmux new-session
```

**注意**：不要 attach VS Code 自己启动的 kilo serve（一般在 4096 端口），它和 VS Code 的会话状态绑定，复用会污染。本 bridge 默认会自起独立 serve，请保持 `KILO_SERVER_URL` 不设置。

## 限制

- 单账号、单进程
- 不支持图片/语音/文件等富媒体（vendor client 提供能力，bridge 未启用）
- 不支持流式分块（kilo 推理完成才一次性发送，权衡更稳定的 UX）
- session 持久化到 JSON 文件，不适合超大用户量；几十用户内没问题

## 致谢

- [openclaw-weixin](http://git.73oc.local/73/openclaw-weixin) — 微信 iLink 协议的官方插件实现
- [weclaw](http://git.73oc.local/73/weclaw) — Go 版微信 Claude 桥接
- [wechat-ilink-client](http://git.73oc.local/73/wechat-ilink-client) — 独立的 TypeScript iLink 协议客户端

## License

MIT
