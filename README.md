# wechat-kilocli-bridge

因为我习惯在 VS Code 里使用 [Kilo Code CLI](https://kilo.ai) 作为 agent 脚手架，所以有了这个项目。

![](https://ocdockerdify.oss-cn-shanghai.aliyuncs.com/images/bffe42d8d37f83a351703638f0002634.png)

将微信 ClawBot 与本地运行的 [Kilo Code CLI](https://kilo.ai) 双向桥接：在微信里发消息 → bridge 转给本地 `kilo serve` 推理 → 回复发回微信。同时本地终端保持完整的原生交互体验。

[![status: working](https://img.shields.io/badge/status-working-brightgreen.svg)]()
[![node: >=24](https://img.shields.io/badge/node-%3E%3D24-blue.svg)]()

## 这个项目解决什么问题

本项目面向这样一类使用场景：

- 你的主工作流仍在本地终端的 Kilo CLI 中进行；
- 你希望在离开电脑时，仍能通过微信向本地会话发送请求，并接收输出与状态同步；
- 本地 CLI 是主工作界面，微信是远程入口。

当前项目并不试图把微信变成新的主工作界面。它的定位是：

- 本地 `kilo serve` 仍然是主工作界面，保持原生使用逻辑；
- 微信侧可发送指令、接收回复、处理审批请求；
- 会话一致性与工作区状态以**本地会话为中心**。

![使用示例](docs/images/animation.webp)

## 功能

- 微信扫码登录、credentials 持久化（重新启动免重新扫码）
- 桥接本地 `kilo serve` HTTP API，消息双向同步
- 支持 Kilo CLI 推理结果回复微信（自动按长度切片）
- "对方正在输入" 心跳保持
- 本地 companion 模式：打开可见的 Kilo 终端 TUI，微信跟随本地会话
- 支持从微信发送 `/new` `/status` `/stop` `/reset` 等指令
- 工作区隔离：从哪个目录启动 bridge，哪个目录就是活动工作区
- 单活工作区切换器：同一时间只有一个项目与微信对话

## 架构

```
┌────────┐  iLink poll   ┌──────────────┐  HTTP API + SSE   ┌────────────┐
│ 微信   │ ────────────▶ │ wechat-bridge│ ─────────────────▶│ kilo serve │
│ ClawBot│ ◀──────────── │ (bridge 进程) │ ◀───────────────── │ (本地独立) │
└────────┘  sendMessage  └──────────────┘  JSON 事件流       └────────────┘
                                │
                                ├── ~/.claude/channels/wechat/account.json
                                ├── ~/.claude/channels/wechat/bridge.lock.json
                                └── ~/.claude/channels/wechat/workspaces/<key>/
```

**核心模块**：

| 文件 | 职责 |
| --- | --- |
| `src/bridge/wechat-bridge.ts` | bridge 主入口，解析 `--adapter kilo`，启动整个 bridge |
| `src/bridge/bridge-adapters.ts` | 适配器工厂，kilo 归一化为 opencode 模式 |
| `src/bridge/bridge-adapters.opencode.ts` | OpenCode/Kilo HTTP server adapter（kilo 与 opencode 共享实现）|
| `src/companion/local-companion.ts` | 本地 companion 进程，连接 bridge socket |
| `src/companion/local-companion-start.ts` | 单命令启动器（自动启动 bridge + companion）|
| `src/wechat/wechat-channel.ts` | iLink 消息收发主循环 |
| `src/wechat/setup.ts` | 微信登录与凭据初始化 |
| `src/bridge/bridge-state.ts` | 状态持久化（锁文件、工作区隔离）|

## 环境要求

- Linux / macOS（服务器部署推荐 Linux）
- [Node.js](https://nodejs.org/en/download) `>= 24.0.0`
- [Kilo CLI](https://kilo.ai) 已安装并完成初次登录配置

```bash
# 全局安装 Kilo CLI
npm install -g @kilocode/cli
kilo --version

# 完成 Kilo CLI 初次登录（一次性）
kilo   # 按提示完成 provider/model 配置
```

## 安装与启动

### 克隆仓库

```bash
git clone http://git.73oc.local/73/wechat-kilocli-bridge.git
cd wechat-kilocli-bridge
npm install
```

### 微信扫码登录

```bash
npm run setup
```

该流程会：

1. 获取微信登录二维码；
2. 在终端打印二维码；
3. 等待你在微信中扫码确认；
4. 将凭据写入 `~/.claude/channels/wechat/account.json`。

![](docs/images/image-0.png)

登录成功后重启 bridge 无需重新扫码。

### 单命令启动（推荐）

进入你要操作的项目目录，然后：

```bash
cd /your/project
npm run kilo:start
```

该命令会自动：

1. 校验或刷新微信登录凭据；
2. 复用当前目录已运行的 bridge，或在当前目录启动新的 bridge；
3. 如果 bridge 正在服务其他目录，则停止旧 bridge 并切换到当前目录；
4. 等待当前目录对应的 Kilo companion endpoint 就绪；
5. 打开可见的本地 Kilo 会话。

### 手动双终端模式（调试/开发）

终端 A（bridge）：

```bash
npm run bridge:kilo
```

终端 B（本地 companion）：

```bash
npm run kilo:panel
```

### 仅启动 bridge（无头服务器模式）

适合在无桌面的服务器上使用 tmux / systemd 运行：

```bash
npm run bridge:kilo
```

bridge 会自动启动 `kilo serve`，通过 HTTP API 收发消息，不需要可见的 TUI。

## 命令说明

### npm scripts

| 命令 | 说明 |
| --- | --- |
| `npm run setup` | 微信扫码登录 |
| `npm run bridge:kilo` | 启动 Kilo bridge（无头模式）|
| `npm run kilo:start` | 单命令启动（bridge + companion）|
| `npm run kilo:panel` | 仅启动 Kilo companion（需要 bridge 已运行）|
| `npm run check` | 检查微信 channel 状态，不启动服务 |
| `npm test` | 运行测试套件 |

### Bridge CLI 参数

```bash
node --no-warnings --experimental-strip-types src/bridge/wechat-bridge.ts --adapter kilo --cwd /your/project
```

支持参数：

- `--adapter kilo`：指定 Kilo 适配器
- `--cwd <path>`：指定工作目录
- `--lifecycle companion_bound`：绑定 companion 生命周期（`kilo:start` 会自动使用）

## 微信侧支持的指令

| 指令 | 说明 |
| --- | --- |
| 普通文本 | 发送给当前活动的 Kilo 会话 |
| `/status` | 查看 bridge 当前状态 |
| `/stop` | 中断当前任务 |
| `/reset` | 重建当前本地会话 |
| `/new` 或 `/new-session` | 新建 Kilo session |
| `/confirm` / `/deny` | 处理 Kilo 权限审批请求 |

## 工作区模型

- 从哪个目录启动 `bridge:kilo`，哪个目录就是当前工作区；
- 同一时间只有一个项目与微信对话（单活工作区切换器）；
- 在当前目录重复执行 `kilo:start` 是幂等的；
- 在其他目录执行会触发工作区切换，而不是并行多开。

## 数据目录与状态文件

默认数据目录：

```text
~/.claude/channels/wechat
```

| 路径 | 作用 |
| --- | --- |
| `account.json` | 微信凭据（0600 权限，删除会强制重新扫码）|
| `sync_buf.txt` | iLink 增量同步游标 |
| `bridge.log` | bridge 运行日志 |
| `bridge.lock.json` | bridge 运行锁 |
| `workspaces/<key>/bridge-state.json` | 当前工作区状态 |
| `workspaces/<key>/codex-panel-endpoint.json` | Kilo companion endpoint 信息 |

## 环境变量

| 变量名 | 说明 |
| --- | --- |
| `WECHAT_ILINK_BASE_URL` | 覆盖默认 iLink API 地址 |
| `CLAUDE_WECHAT_CHANNEL_DATA_DIR` | 覆盖默认数据目录 |
| `KILO_SERVER_PASSWORD` | Kilo HTTP Basic Auth 密码（不设则自动生成随机值）|
| `WECHAT_MAX_IMAGE_MB` | 覆盖图片上传大小限制，默认 20 MB |
| `WECHAT_MAX_FILE_MB` | 覆盖文件上传大小限制，默认 50 MB |

## 生产部署（服务器长期运行）

推荐使用 tmux 保持 bridge 持续运行：

```bash
# 新建 tmux session
tmux new-session -d -s wechat-bridge

# 在 session 里启动 bridge
tmux send-keys -t wechat-bridge "cd /your/project && npm run bridge:kilo" Enter

# 查看日志
tmux attach -t wechat-bridge

# 重连已有 session
tmux attach -t wechat-bridge
```

首次启动会打印二维码，扫码后 credentials 持久化，重启免扫码。

## 常见问题

### bridge 找不到或无法连接

确认 bridge 进程正在运行：

```bash
# 查看日志
tail -f ~/.claude/channels/wechat/bridge.log
```

### 微信没有收到回复

检查 bridge 日志中是否有 `wechat_send_failed` 或 `UND_ERR_CONNECT_TIMEOUT`，通常是出站网络或代理问题。确认终端是否继承了 `HTTP_PROXY` / `HTTPS_PROXY` 等环境变量。

### 全局命令找不到

如果需要将项目安装为全局命令：

```bash
npm install -g .
# 或
npm link
```

安装后可在任意目录使用 `wechat-bridge-kilo`、`wechat-kilo-start` 等命令。

### Kilo serve 没有启动

确认 Kilo CLI 已完成初次登录配置：

```bash
kilo --version
kilo   # 按提示配置 provider 和 model
```

## 开发

```bash
# 安装依赖
npm install

# 运行测试
npm test
npm run test:bridge
npm run test:companion
npm run test:wechat
```

## License

MIT
