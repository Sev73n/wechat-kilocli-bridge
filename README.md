# wechat-kilocli-bridge

因为我习惯在 VS Code 里使用 [Kilo Code CLI](https://kilo.ai) 作为 agent 脚手架，所以有了这个项目。

![](https://ocdockerdify.oss-cn-shanghai.aliyuncs.com/images/bffe42d8d37f83a351703638f0002634.png)

将微信 ClawBot 与本地运行的 [Kilo Code CLI](https://kilo.ai) 双向桥接：在微信里发消息 → bridge 转给本地 `kilo serve` 推理 → 回复发回微信。同时本地终端保持完整的原生交互体验。

[![status: working](https://img.shields.io/badge/status-working-brightgreen.svg)]()
[![node: >=22](https://img.shields.io/badge/node-%3E%3D22-blue.svg)]()

## 这个项目解决什么问题

- 你的主工作流在本地 Kilo CLI 中进行；
- 你希望在离开电脑时，仍能通过微信向本地会话发送请求，接收输出与状态同步；
- 本地 `kilo serve` 是主工作界面，微信是远程入口。

## 功能

- 微信扫码登录、credentials 持久化（重启免扫码）
- 桥接本地 `kilo serve` HTTP API，消息双向同步
- 支持 Kilo CLI 推理结果回复微信（自动按长度切片）
- "对方正在输入" 心跳保持
- 工作区隔离：从哪个目录启动 bridge，哪个目录就是活动工作区
- 单活工作区切换器：同一时间只有一个项目与微信对话
- user-level systemd 服务，开机自启

## 架构

```
┌────────┐  iLink poll   ┌──────────────┐  HTTP API + SSE   ┌────────────┐
│ 微信   │ ────────────▶ │ wechat-bridge│ ─────────────────▶│ kilo serve │
│ ClawBot│ ◀──────────── │ (bridge 进程) │ ◀───────────────── │ (本地独立) │
└────────┘  sendMessage  └──────────────┘  JSON 事件流       └────────────┘
                                │
                                ├── ~/.claude/channels/wechat/account.json
                                ├── ~/.claude/channels/wechat/bridge.log
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

- Linux（服务器部署推荐）
- [Node.js](https://nodejs.org/en/download) `>= 22.0.0`（推荐用 nvm 管理）
- [Kilo CLI](https://kilo.ai) 已安装并完成初次登录配置

```bash
# 全局安装 Kilo CLI
npm install -g @kilocode/cli
kilo --version

# 完成 Kilo CLI 初次登录（一次性）
kilo   # 按提示完成 provider/model 配置
```

## 安装

```bash
git clone http://git.73oc.local/73/wechat-kilocli-bridge.git
cd wechat-kilocli-bridge
npm install
```

## 微信扫码登录

```bash
npm run setup
```

该流程会：

1. 获取微信登录二维码并在终端打印；
2. 等待你在微信中扫码确认；
3. 将凭据写入 `~/.claude/channels/wechat/account.json`。

登录成功后重启 bridge 无需重新扫码。

## 启动方式

### 方式 A：systemd 服务（推荐，已开机自启）

安装并启用 user-level systemd 服务：

```bash
bash deploy/install.sh
```

常用命令：

```bash
systemctl --user status wechat-bridge    # 查看状态
systemctl --user restart wechat-bridge   # 重启
systemctl --user stop wechat-bridge      # 停止
journalctl --user -u wechat-bridge -f    # 实时日志
```

服务配置文件：`deploy/wechat-bridge.service`，已安装到 `~/.config/systemd/user/`。

### 方式 B：直接启动（开发/调试）

```bash
cd /your/project
npm run bridge:kilo
```

### 方式 C：tmux 后台运行

```bash
tmux new-session -d -s wechat-bridge "cd /your/project && npm run bridge:kilo"
tmux attach -t wechat-bridge   # 查看日志
```

## 命令说明

| 命令 | 说明 |
| --- | --- |
| `npm run setup` | 微信扫码登录 |
| `npm run bridge:kilo` | 启动 Kilo bridge（无头模式）|
| `npm run kilo:start` | 单命令启动（bridge + 本地 companion TUI）|
| `npm run kilo:panel` | 仅启动 Kilo companion（需要 bridge 已运行）|
| `npm run check` | 检查微信 channel 状态，不启动服务 |
| `npm test` | 运行测试套件 |

## 微信侧支持的指令

| 指令 | 说明 |
| --- | --- |
| 普通文本 | 发送给当前活动的 Kilo 会话 |
| `/status` | 查看 bridge 当前状态 |
| `/stop` | 中断当前任务 |
| `/reset` | 重建当前本地会话 |
| `/new` 或 `/new-session` | 新建 Kilo session |
| `/confirm` / `/deny` | 处理 Kilo 权限审批请求 |

## 数据目录与状态文件

默认数据目录：`~/.claude/channels/wechat`

| 路径 | 作用 |
| --- | --- |
| `account.json` | 微信凭据（删除会强制重新扫码）|
| `sync_buf.txt` | iLink 增量同步游标 |
| `bridge.log` | bridge 运行日志 |
| `bridge.lock.json` | bridge 运行锁 |
| `workspaces/<key>/bridge-state.json` | 工作区状态 |

## 环境变量

| 变量名 | 说明 |
| --- | --- |
| `WECHAT_ILINK_BASE_URL` | 覆盖默认 iLink API 地址 |
| `CLAUDE_WECHAT_CHANNEL_DATA_DIR` | 覆盖默认数据目录 |
| `KILO_SERVER_PASSWORD` | Kilo HTTP Basic Auth 密码（不设则自动生成随机值）|
| `WECHAT_MAX_IMAGE_MB` | 图片上传大小限制，默认 20 MB |
| `WECHAT_MAX_FILE_MB` | 文件上传大小限制，默认 50 MB |

## 常见问题

### bridge 找不到或无法连接

```bash
tail -f ~/.claude/channels/wechat/bridge.log
systemctl --user status wechat-bridge
```

### 微信没有收到回复

检查 bridge 日志中是否有 `wechat_send_failed` 或 `UND_ERR_CONNECT_TIMEOUT`，通常是出站网络或代理问题。

### Kilo serve 没有启动

确认 Kilo CLI 已完成初次登录配置：

```bash
kilo --version
kilo   # 按提示配置 provider 和 model
```

## 开发

```bash
npm install
npm test
npm run test:bridge
npm run test:companion
npm run test:wechat
```

## License

MIT
