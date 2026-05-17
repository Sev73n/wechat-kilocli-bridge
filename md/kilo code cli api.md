通过终端编排代理。使用键盘优先的导航在命令行中快速规划、调试和编写代码。

Kilo Code CLI 使用与 IDE 扩展相同的底层技术，因此您可以期待相同的工作流程来处理从头到尾的代理编码任务。

## 安装[](https://kilo.org.cn/docs/cli#install "Direct link to Install")

`npm install -g @kilocode/cli`

更改目录到您想要工作的位置并运行 kilocode

```
# Start interactive chat session
kilocode

# Start with a specific mode
kilocode --mode architect

# Start with a specific workspace
kilocode --workspace /path/to/project

# Resume last conversation from current workspace
kilocode --continue
```

以启动 CLI 并使用您首选的模型和相关模式开始新任务。

## 更新[](https://kilo.org.cn/docs/cli#update "Direct link to Update")

升级 Kilo CLI 包

`npm update -g @kilocode/cli`

## Kilo Code CLI 可以做什么[](https://kilo.org.cn/docs/cli#what-you-can-do-with-kilo-code-cli "Direct link to What you can do with Kilo Code CLI")

- **在不离开终端的情况下规划和执行代码更改。** 使用命令行对项目进行编辑，而无需打开 IDE。
- **在数百种 LLM 之间自由切换，不受限制。** 其他 CLI 工具仅适用于一种模型或策划有偏见的列表。使用 Kilo，您可以在无需启动另一个工具的情况下切换模型。
- **在您的工作流程中选择适合任务的模式。** 在 Architect、Ask、Debug、Orchestrator 或自定义代理模式之间进行选择。
- **自动化任务。** 获取 AI 协助，编写用于重命名文件夹中的所有文件或转换一组图像大小等任务的 shell 脚本。
- **通过技能扩展功能。** 通过 [代理技能](https://kilo.org.cn/docs/cli#skills) 添加领域专业知识和可重复的工作流程。

## CLI 参考[](https://kilo.org.cn/docs/cli#cli-reference "Direct link to CLI reference")

### 键盘快捷键[](https://kilo.org.cn/docs/cli#keyboard-shortcuts "Direct link to Keyboard shortcuts")

| 快捷键        | 描述                                                                             |
| ------------- | -------------------------------------------------------------------------------- |
| `Shift+Tab` | 在模式之间循环 (architect → code → ask → debug → orchestrator → 自定义模式) |
| `Ctrl+C`    | 退出 (按两次确认)                                                                |
| `Ctrl+X`    | 取消当前任务                                                                     |
| `Esc`       | 取消当前任务（在流式传输时）或清除输入                                           |
| `Ctrl+Y`    | 切换 YOLO 模式（自动批准所有操作）                                               |
| `Ctrl+R`    | 恢复任务（当任务准备好恢复时）                                                   |
| `!`         | 进入 shell 模式（当输入为空时）                                                  |
| `↑/↓`     | 导航命令历史记录（当输入为空时）                                                 |

### CLI 命令[](https://kilo.org.cn/docs/cli#cli-commands "Direct link to CLI commands")

| 命令                    | 描述                                                       | 示例                             |
| ----------------------- | ---------------------------------------------------------- | -------------------------------- |
| `kilocode`            | 启动交互式                                                 |                                  |
| `/mode`               | 在模式之间切换 (architect, code, debug, ask, orchestrator) | `/mode orchestrator`           |
| `/model`              | 了解可用模型并切换它们                                     |                                  |
| `/model list`         | 列出可用模型                                               |                                  |
| `/model info`         | 按名称打印特定模型的描述                                   | `/model info z-ai/glm-4.5v`    |
| `/model select`       | 选择并切换到新模型                                         |                                  |
| `/checkpoint list`    | 列出所有可用检查点                                         |                                  |
| `/checkpoint restore` | 恢复到特定检查点（破坏性操作）                             | `/checkpoint restore 41db173a` |
| `/tasks`              | 查看任务历史记录                                           |                                  |
| `/tasks search`       | 按查询搜索任务                                             | `/tasks search bug fix`        |
| `/tasks select`       | 切换到特定任务                                             | `/tasks select abc123`         |
| `/tasks page`         | 转到特定页面                                               | `/tasks page 2`                |
| `/tasks next`         | 转到任务历史记录的下一页                                   |                                  |
| `/tasks prev`         | 转到任务历史记录的上一页                                   |                                  |
| `/tasks sort`         | 更改排序顺序                                               | `/tasks sort most-expensive`   |
| `/tasks filter`       | 过滤任务                                                   | `/tasks filter favorites`      |
| `/teams`              | 列出您可以切换到的所有组织                                 |                                  |
| `/teams select`       | 切换到不同的组织                                           |                                  |
| `/config`             | 打开配置编辑器（与 `kilocode config` 相同）              |                                  |
| `/new`                | 使用代理开始一个新任务，从头开始                           |                                  |
| `/help`               | 列出可用命令及其使用方法                                   |                                  |
| `/exit`               | 退出 CLI                                                   |                                  |

## 技能[](https://kilo.org.cn/docs/cli#skills "Direct link to Skills")

CLI 支持 [代理技能](https://agentskills.io/)，这是一种轻量级格式，用于使用专业知识和工作流程扩展 AI 功能。

技能从以下位置发现

- **全局技能**：`~/.kilocode/skills/`（在所有项目中可用）
- **项目技能**：`.kilocode/skills/`（项目特定）

技能可以是

- **通用** - 在所有模式中可用
- **模式特定** - 仅在特定模式（例如 `code`、`architect`）下加载

例如

```
your-project/
└── .kilocode/
    ├── skills/               # Generic skills for this project
    │   └── project-conventions/
    │       └── SKILL.md
    └── skills-code/          # Code mode skills for this project
        └── linting-rules/
            └── SKILL.md
```

### 添加技能[](https://kilo.org.cn/docs/cli#adding-a-skill "Direct link to Adding a Skill")

1. 创建技能目录

   ```
   mkdir -p ~/.kilocode/skills/api-design
   ```
2. 创建一个带有 YAML 前置信息的 `SKILL.md` 文件

   ```
   ---
   name: api-design
   description: REST API design best practices and conventions
   ---

   # API Design Guidelines

   When designing REST APIs, follow these conventions...
   ```

   `name` 字段必须与目录名称完全匹配。
3. 启动新的 CLI 会话以加载技能

#### 查找技能[](https://kilo.org.cn/docs/cli#finding-skills "Direct link to Finding skills")

社区正在努力构建和共享代理技能。一些资源包括

- [技能市场](https://skillsmp.com/) - 社区技能市场
- [技能规范](https://agentskills.io/home) - 代理技能规范

## 自定义命令[](https://kilo.org.cn/docs/cli#custom-commands "Direct link to Custom Commands")

自定义命令允许您创建可重用的斜杠命令，这些命令执行具有参数替换的预定义提示。它们提供了一种简化重复任务和标准化工作流程的便捷方法。

自定义命令从以下位置发现

- **全局命令**：`~/.kilocode/commands/`（在所有项目中可用）
- **项目命令**：`.kilocode/commands/`（项目特定）

命令是带有 YAML 前置信息的简单 markdown 文件。

### 创建自定义命令[](https://kilo.org.cn/docs/cli#creating-a-custom-command "Direct link to Creating a Custom Command")

1. 创建命令目录

   ```
   mkdir -p ~/.kilocode/commands # mkdir %USERPROFILE%\.kilocode\commands on windows
   ```
2. 创建一个 markdown 文件（例如 `component.md`）

   ```
   ---
   description: Create a new React component
   arguments:
       - ComponentName
   ---

   Create a new React component named $1.
   Include:

   - Proper TypeScript typing
   - Basic component structure
   - Export statement
   - A simple props interface if appropriate

   Place it in the appropriate directory based on the project structure.
   ```
3. 在您的 CLI 会话中使用该命令

   ```
   /component Button
   ```

### 前置信息选项[](https://kilo.org.cn/docs/cli#frontmatter-options "Direct link to Frontmatter Options")

自定义命令支持以下前置信息字段

- **`description`**（可选）：在 `/help` 中显示的简短描述
- **`arguments`**（可选）：参数名称列表，用于文档
- **`mode`**（可选）：运行命令时自动切换到此模式
- **`model`**（可选）：运行命令时自动切换到此模型

### 参数替换[](https://kilo.org.cn/docs/cli#argument-substitution "Direct link to Argument Substitution")

命令支持强大的参数替换

- **`$ARGUMENTS`**：用空格分隔的所有参数
- **`$1`、`$2`、`$3` 等**：单个位置参数

**示例**

```
---
description: Create a file with content
arguments:
    - filename
    - content
---

Create a new file named $1 with the following content:

$2
```

用法：`/createfile app.ts "console.log('Hello')"`

### 模式和模型切换[](https://kilo.org.cn/docs/cli#mode-and-model-switching "Direct link to Mode and Model Switching")

命令可以自动切换模式和模型

```
---
description: Run tests with coverage
mode: code
model: anthropic/claude-3-5-sonnet-20241022
---

Run the full test suite with coverage report and show any failures.
Focus on the failing tests and suggest fixes.
```

当您运行 `/test` 时，它将自动切换到代码模式并使用指定的模型。

### 示例命令[](https://kilo.org.cn/docs/cli#example-commands "Direct link to Example Commands")

**初始化项目文档**

```
---
description: Analyze codebase and create AGENTS.md
mode: code
---

Please analyze this codebase and create an AGENTS.md file containing:

1. Build/lint/test commands - especially for running a single test
2. Code style guidelines including imports, formatting, types, naming conventions

Focus on project-specific, non-obvious information discovered by reading files.
```

**重构代码**

```
---
description: Refactor code for better quality
arguments:
    - filepath
---

Refactor $1 to improve:

- Code readability
- Performance
- Maintainability
- Type safety

Explain the changes you make and why they improve the code.
```

### 命令优先级[](https://kilo.org.cn/docs/cli#command-priority "Direct link to Command Priority")

项目特定的命令会覆盖具有相同名称的全局命令，从而允许您自定义每个项目的行为，同时在全球范围内保持合理的默认设置。

## 检查点管理[](https://kilo.org.cn/docs/cli#checkpoint-management "Direct link to Checkpoint Management")

Kilo Code 在您工作时自动创建检查点，允许您恢复到项目历史记录中的先前状态。

### 查看检查点[](https://kilo.org.cn/docs/cli#viewing-checkpoints "Direct link to Viewing Checkpoints")

使用 `/checkpoint list` 列出所有可用检查点

```
/checkpoint list
```

这将显示

- 完整的 40 个字符的 git 提交哈希值
- 相对时间戳（例如“5 分钟前”、“2 小时前”）
- 自动保存的检查点标有 `[auto-saved]`

### 恢复检查点[](https://kilo.org.cn/docs/cli#restoring-checkpoints "Direct link to Restoring Checkpoints")

使用完整的 git 哈希值恢复到特定检查点

```
/checkpoint restore 00d185d5020969752bc9ae40823b9d6a723696e2
```

警告

检查点恢复是一个**破坏性操作**

- 执行 git 硬重置（所有未提交的更改将丢失）
- 删除检查点之后的所有对话消息
- 无法撤销

在恢复之前，请确保您已提交或备份了您想要保留的任何工作。

**别名：** `/cp` 可以用作 `/checkpoint` 的简写

## 任务历史记录[](https://kilo.org.cn/docs/cli#task-history "Direct link to Task History")

直接从 CLI 查看、搜索和浏览您的任务历史记录。

### 查看任务历史记录[](https://kilo.org.cn/docs/cli#viewing-task-history "Direct link to Viewing Task History")

使用 `/tasks` 显示您的任务历史记录

```
/tasks
```

这显示

- 任务编号和描述
- 任务 ID（用于选择）
- 相对时间戳
- 美元成本
- 令牌使用情况
- 收藏指示器 (⭐) 用于收藏的任务
- 分页（每页 10 个任务）

### 搜索任务[](https://kilo.org.cn/docs/cli#searching-tasks "Direct link to Searching Tasks")

按关键字搜索特定任务

```
/tasks search bug fix
/tasks search implement feature
```

搜索会自动按相关性对结果进行排序。

### 选择任务[](https://kilo.org.cn/docs/cli#selecting-a-task "Direct link to Selecting a Task")

使用其 ID 切换到特定任务

```
/tasks select abc123
```

这将加载所选任务及其完整的对话历史记录。

浏览任务历史记录

```
/tasks page 2      # Go to page 2
/tasks next        # Go to next page
/tasks prev        # Go to previous page
```

### 排序任务[](https://kilo.org.cn/docs/cli#sorting-tasks "Direct link to Sorting Tasks")

根据不同标准对任务进行排序

```
/tasks sort newest          # Most recent first (default)
/tasks sort oldest          # Oldest first
/tasks sort most-expensive  # Highest cost first
/tasks sort most-tokens     # Most tokens used first
/tasks sort most-relevant   # Most relevant (used with search)
```

### 过滤任务[](https://kilo.org.cn/docs/cli#filtering-tasks "Direct link to Filtering Tasks")

按工作区或收藏夹过滤任务

```
/tasks filter current    # Show only tasks from current workspace
/tasks filter all        # Show tasks from all workspaces
/tasks filter favorites  # Show only favorited tasks
/tasks filter all-tasks  # Show all tasks (remove filters)
```

**别名：** `/t` 和 `/history` 可以用作 `/tasks` 的简写

## 提供程序配置参考[](https://kilo.org.cn/docs/cli#config-reference-for-providers "Direct link to Config reference for providers")

Kilo 允许您为许多模型提供程序和 AI 网关（如 OpenRouter 和 Vercel AI Gateway）带来您自己的密钥。每个提供程序都有独特的配置选项，有些允许您设置环境变量。

如果您想手动编辑 .config 文件，可以参考 [提供程序配置指南](https://github.com/Kilo-Org/kilocode/blob/main/cli/docs/PROVIDER_CONFIGURATION.md) 获取示例。您还可以运行

`kilocode config`

以交互式工作流程完成配置。

提示

您还可以使用交互式会话期间的 `/config` 斜杠命令，这等效于运行 `kilocode config`。

## 并行模式[](https://kilo.org.cn/docs/cli#parallel-mode "Direct link to Parallel mode")

并行模式允许多个 Kilo Code 实例在同一目录上并行工作，而不会发生冲突。您可以启动任意数量的 Kilo Code 实例！完成后，更改将在单独的 git 分支上可用。

```
# Prerequisite: must be within a valid git repository

# In interactive mode, changes will be committed on /exit
# Terminal 1
kilocode --parallel "improve xyz"
# Terminal 2
kilocode --parallel "improve abc"

# Pairs great with auto mode 🚀
# Terminal 1
kilocode --parallel --auto "improve xyz"
# Terminal 2
kilocode --parallel --auto "improve abc"
```

## 自动批准设置[](https://kilo.org.cn/docs/cli#auto-approval-settings "Direct link to Auto-approval settings")

自动批准允许 Kilo Code CLI 在无需先获得用户确认的情况下执行操作。这些设置可以在交互式模式下逐步建立，也可以通过使用 `kilocode config` 编辑您的配置文件或直接编辑 `~/.kilocode/config.json` 文件来建立。

### 默认自动批准设置[](https://kilo.org.cn/docs/cli#default-auto-approval-settings "Direct link to Default auto-approval settings")

```
{
	"autoApproval": {
		"enabled": true,
		"read": {
			"enabled": true,
			"outside": false
		},
		"write": {
			"enabled": true,
			"outside": false,
			"protected": false
		},
		"execute": {
			"enabled": true,
			"allowed": ["npm", "git", "pnpm"],
			"denied": ["rm -rf", "sudo"]
		},
		"browser": {
			"enabled": false
		},
		"mcp": {
			"enabled": true
		},
		"mode": {
			"enabled": true
		},
		"subtasks": {
			"enabled": true
		},
		"question": {
			"enabled": false,
			"timeout": 60
		},
		"retry": {
			"enabled": true,
			"delay": 10
		},
		"todo": {
			"enabled": true
		}
	}
}
```

**配置选项**

- `read`：自动批准文件读取操作
  - `outside`：允许读取工作区外部的文件
- `write`：自动批准文件写入操作
  - `outside`：允许写入工作区外部的文件
  - `protected`：允许写入受保护的文件（例如 package.json）
- `execute`：自动批准命令执行
  - `allowed`：允许的命令模式列表（例如 \["npm", "git"\]）
  - `denied`：拒绝的命令模式列表（优先级更高）
- `browser`：自动批准浏览器操作
- `mcp`：自动批准 MCP 工具使用
- `mode`：自动批准模式切换
- `subtasks`：自动批准子任务创建
- `question`：自动批准后续问题
- `retry`：自动批准 API 重试请求
- `todo`：自动批准待办事项列表更新

### 命令批准模式[](https://kilo.org.cn/docs/cli#command-approval-patterns "Direct link to Command Approval Patterns")

`execute.allowed` 和 `execute.denied` 列表支持分层模式匹配

- **基本命令**：`"git"` 匹配任何 git 命令（例如 `git status`、`git commit`、`git push`）
- **命令 + 子命令**：`"git status"` 匹配任何 git status 命令（例如 `git status --short`、`git status -v`）
- **完整命令**：`"git status --short"` 仅匹配完全相同的 `git status --short`

**示例**

```
{
	"execute": {
		"enabled": true,
		"allowed": [
			"npm", // Allows all npm commands
			"git status", // Allows all git status commands
			"ls -la" // Only allows exactly "ls -la"
		],
		"denied": [
			"git push --force" // Denies this specific command even if "git" is allowed
		]
	}
}
```

## 交互模式[](https://kilo.org.cn/docs/cli#interactive-mode "Direct link to Interactive Mode")

交互模式是在不使用 `--auto` 标志的情况下运行 Kilo Code 时的默认模式，旨在与用户通过控制台进行交互。

在交互模式下，Kilo Code 将请求尚未自动批准的操作的批准，允许用户在执行操作之前对其进行审查和批准，并可以选择将其添加到自动批准列表中。

### 交互式命令批准[](https://kilo.org.cn/docs/cli#interactive-command-approval "Direct link to Interactive Command Approval")

在交互模式下运行时，命令批准请求现在显示分层选项

```
[!] Action Required:
> ✓ Run Command (y)
  ✓ Always run git (1)
  ✓ Always run git status (2)
  ✓ Always run git status --short --branch (3)
  ✗ Reject (n)
```

选择“始终运行”选项将

1. 批准并执行当前命令
2. 将模式添加到配置中的 `execute.allowed` 列表中
3. 自动批准未来的匹配命令

这允许您无需手动编辑配置文件即可逐步构建自动批准规则。

## 自主模式（非交互式）[](https://kilo.org.cn/docs/cli#autonomous-mode-non-interactive "Direct link to Autonomous mode (Non-Interactive)")

自主模式允许 Kilo Code 在 CI/CD 管道等自动化环境中运行，而无需用户交互。

```
# Run in autonomous mode with a prompt
kilocode --auto "Implement feature X"

# Run in autonomous mode with piped input
echo "Fix the bug in app.ts" | kilocode --auto

# Run in autonomous mode with timeout (in seconds)
kilocode --auto "Run tests" --timeout 300

# Run in autonomous mode with JSON output for structured parsing
kilocode --auto --json "Implement feature X"
```

### 自主模式行为[](https://kilo.org.cn/docs/cli#autonomous-mode-behavior "Direct link to Autonomous Mode Behavior")

在自主模式下运行（`--auto` 标志）时

1. **无用户交互**：所有批准请求均根据配置自动处理
2. **自动批准/拒绝**：操作根据您的自动批准设置获得批准或拒绝
3. **后续问题**：自动回复消息，指示 AI 做出自主决策
4. **自动退出**：任务完成或超时时 CLI 自动退出

### JSON 输出模式[](https://kilo.org.cn/docs/cli#json-output-mode "Direct link to JSON Output Mode")

使用 `--json` 标志和 `--auto` 以获取结构化的 JSON 输出，而不是默认的终端 UI。这对于程序化集成和解析 Kilo Code 响应非常有用。

```
# Standard autonomous mode with terminal UI
kilocode --auto "Fix the bug"

# Autonomous mode with JSON output
kilocode --auto --json "Fix the bug"

# With piped input
echo "Implement feature X" | kilocode --auto --json
```

**要求**

- `--json` 标志要求启用 `--auto` 模式
- 输出以结构化的 JSON 格式发送到 stdout，以便于解析
- 非常适合 CI/CD 管道和自动化工作流程

### 自主模式下的自动批准[](https://kilo.org.cn/docs/cli#auto-approval-in-autonomous-mode "Direct link to Auto-Approval in Autonomous Mode")

自主模式尊重您的 [自动批准配置](https://kilo.org.cn/docs/cli#auto-approval-settings)。未自动批准的操作将不允许执行。

### 自主模式下的后续问题[](https://kilo.org.cn/docs/cli#autonomous-mode-follow-up-questions "Direct link to Autonomous Mode Follow-up Questions")

在自主模式下，当 AI 提出后续问题时，它会收到此回复

> “此过程正在非交互式的自主模式下运行。用户无法做出决定，因此您应该自主做出决定。”

这指示 AI 在没有用户输入的情况下继续。

### 退出代码[](https://kilo.org.cn/docs/cli#exit-codes "Direct link to Exit Codes")

- `0`：成功（任务完成）
- `124`：超时（任务超过时间限制）
- `1`：错误（初始化或执行失败）

### 示例 CI/CD 集成[](https://kilo.org.cn/docs/cli#example-cicd-integration "Direct link to Example CI/CD Integration")

```
# GitHub Actions example
- name: Run Kilo Code
  run: |
      echo "Implement the new feature" | kilocode --auto --timeout 600
```

## 会话延续[](https://kilo.org.cn/docs/cli#session-continuation "Direct link to Session Continuation")

使用 `--continue`（或 `-c`）标志从当前工作区恢复您上次的对话

```
# Resume the most recent task from this workspace
kilocode --continue
kilocode -c
```

此功能

- 自动查找当前工作区中最近的任务
- 加载完整的对话历史记录
- 允许您从上次停止的地方继续
- 不能与 `--auto` 模式或提示参数一起使用
- 如果没有找到以前的任务，则会以错误退出

**示例工作流程**

```
# Start a task
kilocode
# > "Create a REST API"
# ... work on the task ...
# Exit with /exit

# Later, resume the same task
kilocode --continue
# Conversation history is restored, ready to continue
```

**限制**

- 不能与 `--auto` 模式结合使用
- 不能与提示参数一起使用
- 仅当工作区中至少有一个以前的任务时才有效

## 环境变量覆盖[](https://kilo.org.cn/docs/cli#environment-variable-overrides "Direct link to Environment Variable Overrides")

CLI 支持使用环境变量覆盖配置值。支持的环境变量是

- `KILO_PROVIDER`：覆盖活动提供程序 ID
- 对于 `kilocode` 提供程序：`KILOCODE_<FIELD_NAME>`（例如 `KILOCODE_MODEL` → `kilocodeModel`）
- 对于其他提供程序：`KILO_<FIELD_NAME>`（例如 `KILO_API_KEY` → `apiKey`）

## 本地开发[](https://kilo.org.cn/docs/cli#local-development "Direct link to Local Development")

### 开发者工具[](https://kilo.org.cn/docs/cli#devtools "Direct link to DevTools")

为了使用开发者工具运行 CLI，请将 `DEV=true` 添加到您的 `pnpm start` 命令中，然后运行 `npx react-devtools` 以显示开发者工具检查器。

## 从 CLI 切换到组织[](https://kilo.org.cn/docs/cli#switching-into-an-organization-from-the-cli "Direct link to Switching into an Organization from the CLI")

使用 `/teams` 命令查看您可以切换到的所有组织的列表。

使用 `/teams select` 并开始键入团队名称以切换团队。

切换到团队或企业组织的过程相同。
