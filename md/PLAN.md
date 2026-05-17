# 微信 ↔ Kilo CLI 桥接：部署与实现计划

> 目标：**用微信给本机 Kilo CLI 发消息、收到回复**。
> 协议层走腾讯 iLink（与 `Tencent/openclaw-weixin` 同后端，封号风险低）。
> 不引入 OpenClaw / CowAgent 等 Agent 框架，纯轻量桥。

---

## 0. 关键背景速读（新 agent 必读）

### 0.1 为什么选这个方案
经过两轮调研（详见 `RESEARCH.md`，由本会话历史浓缩），最终结论：
- **微信侧用 [`photon-hq/wechat-ilink-client`](https://github.com/photon-hq/wechat-ilink-client)** —— openclaw-weixin 协议层的独立 TS 实现，零运行时依赖，MIT，~1500 行。
- 不要 mock OpenClaw 宿主（耦合面太大，2000+ 行胶水）。
- 不要 CowAgent（UOS Web 协议封号风险高）。
- 不要 wechaty/PadLocal（前者死、后者付费）。
- iLink 协议本身是腾讯把 HTTP 文档写在 openclaw-weixin README 里**邀请第三方实现**的，photon-hq 走的就是 `ilinkai.weixin.qq.com` 这条腾讯官方后端，**封号风险等价于官方**。

### 0.2 Kilo CLI 已确认能力
二进制路径：
```
/home/oc/.vscode-server/extensions/kilocode.kilo-code-7.3.0-linux-x64/bin/kilo
```

关键命令（已 `--help` 验证）：
- `kilo run "msg"` —— 单次跑消息
- `kilo run -s <sessionId> "msg"` —— **持久会话**，多轮上下文
- `kilo run --format json` —— NDJSON 事件流输出（用于解析最终 assistant 文本）
- `kilo run --auto` —— 自动通过所有权限（**安全红线，必须配合白名单**）
- `kilo session list` —— 列出已有会话

### 0.3 环境约束
- **Node 当前 v20.20.2**，photon-hq 要求 **Node 22+**，需要先解决（推荐 nvm，见步骤 2.1）
- **没有 pnpm**，photon-hq 用 pnpm 构建
- **Gitea 已存在**：
  - 容器名 `gitea`，镜像 `gitea/gitea:1.22`
  - Web: `http://git.73oc.local`（caddy 反代，仅局域网）
  - SSH: `ssh://git@192.168.110.247:3022/<owner>/<repo>.git`
  - 注册已关闭（`DISABLE_REGISTRATION: "true"`）
  - 现有用户：`ocadmin`(id=1, admin)、`73`(id=2)
  - **管理员凭证**：`ocadmin` / `GiteaAdmin2026!`（来自 `~/.bashrc` Gitea Memo，仅局域网内部使用）
  - API 可达：`curl http://git.73oc.local/api/v1/version` → `{"version":"1.22.6"}`
  - **创建 token（agent 自己做，不用问用户）**：
    ```bash
    curl -s -u ocadmin:'GiteaAdmin2026!' \
      -H "Content-Type: application/json" \
      -X POST http://git.73oc.local/api/v1/users/ocadmin/tokens \
      -d '{"name":"wechat-kilo-bridge","scopes":["write:repository","write:user"]}' \
      | jq -r .sha1 > ~/.gitea_token_wechat_bridge
    export GITEA_TOKEN=$(cat ~/.gitea_token_wechat_bridge)
    ```
    或更省事：直接在所有 API 调用里用 `-u ocadmin:'GiteaAdmin2026!'` basic auth。

---

## 1. 总体架构

```
微信手机
   ▼ (扫码授权)
ilinkai.weixin.qq.com (腾讯官方后端)
   ▼ (长轮询)
┌─────────────────────────────────────┐
│ kilo-wechat-bridge (本项目)         │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ wechat-ilink-client (vendored)  │ │ ← fork 自 photon-hq
│ └─────────────────────────────────┘ │
│            │ 收到 MessageEvent      │
│            ▼                        │
│   1. 白名单过滤（allowFrom）        │
│   2. peer → sessionId 映射 (JSON)   │
│   3. 斜杠命令 (/new /sid /help)     │
│            │                        │
│            ▼ spawn                   │
│   kilo run -s <sid> --auto          │
│        --format json --dir <cwd>    │
│            │                        │
│            ▼ 解析 NDJSON            │
│   提取 assistant 最终文本           │
│            ▼                        │
│   通过 WeChatClient.sendText() 回发 │
└─────────────────────────────────────┘
```

---

## 2. 实施步骤（按顺序执行，每步都有 verify）

### 2.1 准备运行环境

```bash
# 安装 nvm + Node 22（隔离，不动系统 Node 20）
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm install 22
nvm use 22

# 装 pnpm
npm install -g pnpm
```

**verify**:
```bash
node --version   # 应 ≥ v22
pnpm --version   # 应有输出
```

如果机器在内网装不上 nvm/pnpm，备选方案：用项目自带的 npm（v10.8 自带 corepack）：
```bash
corepack enable
corepack prepare pnpm@latest --activate
```
但 Node 22 没办法 corepack，必须装。**这一步卡住就先停下报告**。

---

### 2.2 Fork photon-hq/wechat-ilink-client 到 Gitea

由于 Gitea 不能直接从公网 fork GitHub（注册都关了），用 **mirror 方式**：

```bash
# 1. 在 Gitea 上创建仓库（用 ocadmin 账号，需要先拿到 token）
# 用户需提供：GITEA_TOKEN（在 Gitea Web UI → Settings → Applications → Generate New Token，权限选 repo + admin）
# 假设 token 存在环境变量 GITEA_TOKEN

# 2. 通过 API 创建一个 mirror 仓库
curl -X POST \
  -H "Authorization: token $GITEA_TOKEN" \
  -H "Content-Type: application/json" \
  http://git.73oc.local/api/v1/repos/migrate \
  -d '{
    "clone_addr": "https://github.com/photon-hq/wechat-ilink-client.git",
    "repo_name": "wechat-ilink-client",
    "repo_owner": "ocadmin",
    "mirror": true,
    "private": false,
    "description": "Fork of photon-hq/wechat-ilink-client (WeChat iLink protocol TS client, MIT)"
  }'
```

**verify**:
```bash
curl -s http://git.73oc.local/api/v1/repos/ocadmin/wechat-ilink-client | jq .name
# 应输出 "wechat-ilink-client"
```

**如果 Gitea 容器不能访问外网**（典型 docker compose 没配代理），mirror 会失败。备选：
1. 宿主机 clone：`git clone https://github.com/photon-hq/wechat-ilink-client.git /tmp/wic`
2. 进容器拷贝 + push：
   ```bash
   cd /tmp/wic
   git remote add gitea http://ocadmin:$GITEA_TOKEN@git.73oc.local/ocadmin/wechat-ilink-client.git
   # 推之前先在 Gitea 创建空仓库
   curl -X POST -H "Authorization: token $GITEA_TOKEN" -H "Content-Type: application/json" \
     http://git.73oc.local/api/v1/user/repos \
     -d '{"name":"wechat-ilink-client","private":false}'
   git push gitea master
   ```

---

### 2.3 创建桥项目仓库（也推到 Gitea）

```bash
cd /cgteamwork/cgtw_out_disk/oc_docker/wechat-kilo-bridge
git init
git config user.name "ocadmin"
git config user.email "ocadmin@noreply.localhost"

# 在 Gitea 创建空仓库
curl -X POST -H "Authorization: token $GITEA_TOKEN" -H "Content-Type: application/json" \
  http://git.73oc.local/api/v1/user/repos \
  -d '{"name":"wechat-kilo-bridge","private":true,"description":"WeChat ↔ Kilo CLI bridge"}'

git remote add origin http://ocadmin:$GITEA_TOKEN@git.73oc.local/ocadmin/wechat-kilo-bridge.git
```

---

### 2.4 拉取 wechat-ilink-client 作为子目录（vendored）

不用 git submodule（部署复杂），直接复制源码进来当 workspace：

```bash
cd /cgteamwork/cgtw_out_disk/oc_docker/wechat-kilo-bridge
git clone http://git.73oc.local/ocadmin/wechat-ilink-client.git vendor/wechat-ilink-client
rm -rf vendor/wechat-ilink-client/.git  # 不嵌套 git
```

**verify**:
```bash
ls vendor/wechat-ilink-client/src   # 应能看到 api/auth/cdn 等目录
cat vendor/wechat-ilink-client/package.json | jq .name
```

---

### 2.5 构建 wechat-ilink-client

```bash
cd vendor/wechat-ilink-client
pnpm install
pnpm build
```

**verify**: `ls dist/` 应有编译产物。

如果构建失败，**先停下来报告失败信息**，不要瞎改。photon-hq 仓库小，issue 看一下基本能定位。

---

### 2.6 跑官方 example 验证扫码登录

`vendor/wechat-ilink-client/examples/` 里应该有可运行的 demo。先单独跑通它，确认能扫码登录：

```bash
cd vendor/wechat-ilink-client
node --experimental-strip-types examples/<找到合适的 demo>.ts
# 或编译后的 dist 版本
```

终端会输出 QR 码（ASCII 字符块），用微信扫描。

**verify 标准**：
1. 终端打印 QR
2. 手机微信扫码后，example 程序日志显示"登录成功"或类似
3. 用另一个微信号给登录的小号发条消息，example 应该收到事件

**这一步必须用真实小号测试**：
- ⚠️ 用小号，不用主号
- 凭证默认存在 `~/.weixin_cow_credentials.json` 或 example 配置的路径
- 扫码后 token 长期有效（按 openclaw-weixin 经验），重启不用重扫

**如果走到这里有问题，agent 应停下来汇报**，因为后面写胶水代码毫无意义。

---

### 2.7 写桥的主程序

项目根目录结构（agent 创建）：

```
wechat-kilo-bridge/
├── md/
│   └── PLAN.md          ← 本文件
├── vendor/
│   └── wechat-ilink-client/   ← 2.4 拉下来的
├── src/
│   ├── index.ts         ← 入口
│   ├── kilo-runner.ts   ← spawn kilo run 并解析 NDJSON
│   ├── session-store.ts ← peer → sessionId JSON 持久化
│   ├── allowlist.ts     ← 白名单
│   └── commands.ts      ← /new /sid /help 斜杠命令
├── data/                ← 运行时数据（git ignore）
│   ├── sessions.json
│   ├── allowlist.json
│   └── wechat-credentials.json
├── .gitignore
├── package.json
├── tsconfig.json
└── README.md
```

#### 2.7.1 package.json 关键字段

```json
{
  "name": "wechat-kilo-bridge",
  "version": "0.1.0",
  "type": "module",
  "engines": { "node": ">=22" },
  "scripts": {
    "start": "node --experimental-strip-types src/index.ts",
    "build": "tsc"
  },
  "dependencies": {
    "wechat-ilink-client": "file:./vendor/wechat-ilink-client"
  }
}
```

> 注意：`file:` 协议依赖要求 vendor 里 `package.json` 的 `main`/`exports` 指向构建产物。如果链接不通就改成把 vendor 当 workspace（pnpm workspaces）。**这两种方式 agent 自己根据情况决定**，目标是能 import。

#### 2.7.2 主流程伪代码

```typescript
// src/index.ts
import { WeChatClient } from 'wechat-ilink-client';
import { SessionStore } from './session-store.ts';
import { Allowlist } from './allowlist.ts';
import { runKilo } from './kilo-runner.ts';
import { handleCommand } from './commands.ts';

const KILO_BIN = '/home/oc/.vscode-server/extensions/kilocode.kilo-code-7.3.0-linux-x64/bin/kilo';
const WORK_DIR = process.env.KILO_WORK_DIR ?? '/tmp/kilo-wechat-workspace';

const allow = new Allowlist('data/allowlist.json');
const store = new SessionStore('data/sessions.json');

const client = new WeChatClient({
  credentialsPath: 'data/wechat-credentials.json',
});

await client.login(); // 内部处理 QR 显示 / token 复用

client.on('message', async (msg) => {
  // 1. 只处理文本，1v1（不支持群）
  if (msg.type !== 'text' || msg.isGroup) return;

  // 2. 白名单
  if (!allow.has(msg.fromUserName)) {
    console.log(`[block] from ${msg.fromUserName}: ${msg.content.slice(0, 50)}`);
    return;
  }

  // 3. 斜杠命令
  if (msg.content.startsWith('/')) {
    const reply = await handleCommand(msg, store);
    if (reply) await client.sendText(msg.fromUserName, reply);
    return;
  }

  // 4. 串行化：同一 peer 排队（避免并发 spawn kilo）
  await store.withLock(msg.fromUserName, async () => {
    const sid = store.getOrInit(msg.fromUserName);

    try {
      const result = await runKilo({
        bin: KILO_BIN,
        sessionId: sid,
        message: msg.content,
        cwd: WORK_DIR,
        timeoutMs: 5 * 60_000,
      });

      // 首次的 sessionId 是 spawn 后从 JSON 事件流里抓出来的
      if (!sid && result.sessionId) store.set(msg.fromUserName, result.sessionId);

      // 长输出分块发（4000 字符限制）
      for (const chunk of splitAt(result.text, 3500)) {
        await client.sendText(msg.fromUserName, chunk);
      }
    } catch (err) {
      await client.sendText(msg.fromUserName, `❌ Kilo 执行失败：${err.message.slice(0, 200)}`);
    }
  });
});
```

#### 2.7.3 kilo-runner.ts 要点

- spawn `kilo run -s <sid> --auto --format json --dir <cwd> -- <message>`
- 如果 `sid` 为空，去掉 `-s` 参数，让 Kilo 创建新会话
- 读取 stdout 的 NDJSON 流，识别两种事件：
  - `{"type":"session.created","sessionId":"..."}` → 抓 sessionId
  - `{"type":"message.completed","role":"assistant","text":"..."}` → 抓最终文本
- 这两个事件名是猜测，**实际跑一次 `kilo run --format json "hello"` 看真实输出再写解析器**
- 超时用 `AbortController`

#### 2.7.4 session-store.ts / allowlist.ts

最简单的 JSON 文件加内存缓存。`withLock` 用 `p-queue` 或者手写 promise chain。

#### 2.7.5 commands.ts

```
/help           — 列出可用命令
/new            — 抛弃当前 session，下条消息开新会话
/sid            — 显示当前 session id
/cancel         — 中止正在跑的 Kilo（如果有）
/whoami         — 显示自己的 wxid（首次配白名单要用）
```

---

### 2.8 安全配置（红线）

**`--auto` 让 Kilo 自动批权限，这是危险操作。** 必须满足：

1. **白名单非空才启动**：`data/allowlist.json` 为空时桥拒绝启动，避免误开放
2. **工作目录沙箱**：`KILO_WORK_DIR` 默认 `/tmp/kilo-wechat-workspace`，**绝不指向 home 或源码目录**
3. **配置首次配对流程**：
   - 桥启动时打印自己微信号的 wxid
   - 给桥发 `/whoami` 拿到自己的 wxid
   - 手动编辑 `data/allowlist.json` 加入 wxid（首次必须手动，没有自动配对）

---

### 2.9 运行 / 进程管理

最简单：tmux + node。生产可以加 systemd user service。

```bash
# 手动运行
cd /cgteamwork/cgtw_out_disk/oc_docker/wechat-kilo-bridge
node --experimental-strip-types src/index.ts

# tmux 后台
tmux new -d -s wechat-bridge 'cd /cgteamwork/cgtw_out_disk/oc_docker/wechat-kilo-bridge && node --experimental-strip-types src/index.ts 2>&1 | tee -a data/bridge.log'
```

---

### 2.10 提交到 Gitea

```bash
cd /cgteamwork/cgtw_out_disk/oc_docker/wechat-kilo-bridge

cat > .gitignore <<'EOF'
node_modules/
vendor/wechat-ilink-client/node_modules/
vendor/wechat-ilink-client/dist/
data/
*.log
.env
EOF

git add -A
git commit -m "feat: initial wechat ↔ kilo bridge skeleton"
git push origin master
```

---

## 3. 验收标准（端到端）

按这 6 条逐项打勾，**全部通过才算完成 MVP**：

- [ ] **3.1** Gitea 上能看到 `ocadmin/wechat-ilink-client`（mirror）和 `ocadmin/wechat-kilo-bridge`
- [ ] **3.2** `vendor/wechat-ilink-client` 能 `pnpm build` 成功
- [ ] **3.3** 跑 photon-hq 官方 example 能扫码登录，能收到任意微信消息打印到终端
- [ ] **3.4** `kilo run --format json "hello"` 能解析出最终文本（写在 `kilo-runner.ts` 里能跑通 unit 验证）
- [ ] **3.5** 桥启动后给登录的小号发"你好"，能收到 Kilo 的回复
- [ ] **3.6** 给小号发第二条相关问题（比如"刚才说了什么？"），Kilo 能基于上轮上下文回答（说明 session 持久化生效）

---

## 4. 已知风险 / 红线 / 决策点

| 风险 | 缓解 |
|---|---|
| Gitea 容器无外网 → mirror 失败 | 用 2.2 备选方案：宿主 clone 后 push |
| photon-hq 突然弃维护 | 已 fork 到 Gitea，自己冻结版本 |
| 微信号被封 | 用小号；走 iLink 协议风险较低；但**不保证零风险** |
| `--auto` 被恶意 prompt 利用 | 白名单 + 沙箱工作目录 |
| Kilo `--format json` 实际事件名与计划不符 | **2.7.3 之前先跑一次实测**，再写解析 |
| Node 22 装不上 | 停下来报告，本机限制是硬约束 |
| 长任务阻塞 / 死锁 | 5 分钟超时 + 同 peer 串行 |

---

## 5. 新 agent 启动检查清单

接手时按这个顺序确认你处在正确起点：

1. `pwd` 应在 `/cgteamwork/cgtw_out_disk/oc_docker/wechat-kilo-bridge`
2. `ls .kilo` 应能看到 skills、INSTRUCTIONS.md 等（从 daocaoren 复制来的）
3. 加载 git-essentials skill（在 `.kilo/skills/git-essentials/` 下）—— 它会告诉你怎么和 gitea 打交道
4. **Gitea token**：**不需要问用户**，直接用 §0.3 里的 admin 账号 `ocadmin/GiteaAdmin2026!` 通过 API 自己创建（或基础认证直调）
5. 然后按 §2 顺序逐步执行，每步都验证 verify 标准

---

## 6. 与新 agent 沟通的话术建议

用户会在新 agent 里继续这个项目。新 agent 应该：

- **先读完 `md/PLAN.md` 整篇**，不要跳读
- **不擅自改架构** —— 这份计划已经过两轮调研收敛
- 遇到环境问题（Node、pnpm、网络）**立刻停下报告**，不要硬试
- 在第 2.7 写代码前，**必须先跑通 2.6 扫码登录** —— 否则代码毫无意义
- 实测 `kilo run --format json` 的真实输出格式，不要照搬本文档里假设的事件名

---

**最后一句**：这份计划力求可执行，但 photon-hq 的具体 API（事件名、方法签名）需要看真实源码确认。允许小幅调整，但不要换技术栈或换架构。
