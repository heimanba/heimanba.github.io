---
title: 'Workflow 与 AI Agent：不是谁取代谁，而是各管一段'
description: '从确定性与涌现性的差异出发，整理工作流与 AI Agent 的两种协作模式，以及在自动化、编排和调用层面的分工。'
pubDate: 'May 05 2026'
updatedDate: 'May 05 2026'
---

AI 时代，工作流（Workflow）与 AI Agent 的关系引发了很多讨论：工作流会被 Agent 取代吗？Agent 能否完全接管流程编排？答案正在变得清晰——它们不是替代关系，而是互补关系。判断标准只有一个：**这个任务需要确定性，还是涌现性？**

## 一、确定性 vs 涌现性：两条路径的分界

![确定性与涌现性对比](https://img.alicdn.com/imgextra/i4/O1CN015Iukrw1bLEldqu8YS_!!6000000003448-2-tps-1792-1024.png)

以 n8n、Dify、百炼 Workflow 为代表的工作流引擎提供**确定性执行**：你画一条线，数据就沿着这条线走。每一步都是预定义的、可观测的、可审计的。适合已知流程的场景，比如每日定时抓取 RSS、过滤关键词、推送通知。

以 Claude Code、Qwen code、OpenClaw 为代表的 AI Agent 提供**涌现式行为**：你给一个目标，Agent 自主决定调用什么工具、何时停止、是否需要重新搜索。适合路径不确定的场景——如技术调研、创意探索、Bug 排查。

两者的稳定性来源截然不同：

- 工作流的稳定性是“我知道它会怎么做”
- Agent 的稳定性是“我知道它能搞定，但不知道它怎么搞”

**选错工具的代价很高：** 让 Agent 做路由控制，token 成本不可控；让工作流做创意工作，维护会成为噩梦。

## 二、模式一：Workflow 编排 Agent

![Workflow 编排 Agent 架构](https://img.alicdn.com/imgextra/i2/O1CN014T4B2A29xQjQgJIMT_!!6000000008134-2-tps-2752-1536.png)

既然工作流引擎天生擅长确定性控制，那在多 Agent 架构中，它就是 supervisor agent 的天然人选。与其让一个 LLM 来做调度（成本高、行为不可控），不如让工作流引擎来扮演这个“大管家”——流程确定的部分由它掌控，需要智能的部分交给 Agent 执行。

企业场景尤其适合这种模式：业务流程相对固定，将确定性编排与 Agent 的泛化能力有机结合，正是最佳实践。

### 架构设计

| 层级 | 角色 | 职责 |
|------|------|------|
| **工作流引擎（如 n8n）** | Manager/Orchestrator | 定义业务逻辑、处理触发器、管理凭据、提供审计日志、实施人机协作审批 |
| **AI Agent（如 Qwen code）** | Executor/Architect | 访问终端和文件系统、编写代码、运行测试、修复 Bug、生成工作流 JSON |

### 为什么这种组合比单一工具更强？

| 维度 | 工作流 + Agent 的优势 |
|------|------|
| **安全性** | 工作流引擎提供“架构边界”。Agent 只能通过 Webhook 与外界通信，真实 API 密钥存储在加密凭证库中，Agent 无法直接窥视 |
| **可观测性** | Agent 的执行过程往往是“黑盒”。通过工作流编排，每个决策步骤和数据转换都可以在可视化画布上追踪和审计 |
| **自我进化** | Agent 可以作为“自修复专家”。当工作流节点报错时，Agent 读取错误日志，定位问题根因，自动修正工作流 JSON 并重新部署，相当于工作流拥有了自愈能力 |
| **跨环境能力** | 工作流引擎擅长 App 之间连接，Agent 擅长处理本地文件和复杂逻辑，两者结合实现了 “SaaS 自动化” 与 “本地开发自动化” 的打通 |

### 典型场景

**场景一：自动化运维闭环**

Sentry 捕获线上异常 → 百炼 Workflow（Manager）接收告警，判断严重等级，决定是否触发修复流程 → Qwen Code（Executor）进入项目目录，排查代码、修复 Bug、提交 PR → 百炼 Workflow 记录修复结果，通知相关人员。整个流程在百炼 Workflow 中可追溯，而 Agent 承担了最需要智能的技术重活。

**场景二：多 Agent 协作流水线**

百炼 Workflow（Manager）接收到代码提交事件 → 分发给 Qwen Code（Executor）完成代码编写 → 转交给另一个 Agent 进行代码 review → 结果回传百炼 Workflow 存档并通知团队。每个 Agent 专注自己擅长的领域，工作流引擎负责串联和调度。

### 社区案例

**案例：n8n + Claude Code 构建 AI IT 部门**

社区 AI 博主将 n8n 和 Claude Code 有机结合（[GitHub](https://github.com/theNetworkChuck/n8n-claude-code-guide) | [YouTube](https://www.youtube.com/watch?v=s96JeuuwLzc)），目标是构建一个完整的 IT 部门：
- n8n 作为编排层
- Claude Code、Qwen Code、Codex 作为 Worker 执行者
- 自动化监控、警报与修复

**案例：阿里云百炼 Workflow 告警诊断**

使用阿里云百炼 Workflow，从接收告警到聚合代码进行问题根因诊断，工作流负责流程串联，Agent 负责智能分析：

![](https://img.alicdn.com/imgextra/i3/O1CN01o3FjmI1qDC310RHg7_!!6000000005461-2-tps-3088-1170.png)


#### 使用 FC Sandbox 接入 Qwen Code 作为 Remote Agent

将 [Qwen Code](https://github.com/QwenLM/qwen-code) 部署在 [阿里云函数计算（FC）](https://help.aliyun.com/zh/functioncompute/fc/sandbox-sandbox-code-interepreter) 上，利用 FC 的 Session 亲和机制实现多轮对话的会话隔离。

<video width="100%" height="560" controls="controls" autoplay="autoplay" src="//cloud.video.taobao.com/vod/_wD85QxErh6-h6laL6El-Pp1qfjingf0j44Z7zwCYvk.mp4"></video>

项目地址：<https://github.com/heimanba/qwen-code-serverless>

## 三、模式二：Agent（OpenClaw）驱动 Workflow

![Agent驱动Workflow架构](https://img.alicdn.com/imgextra/i3/O1CN01fuIhmx23WVl4ZtfwN_!!6000000007263-2-tps-2752-1536.png)

> 工作流引擎没有过时，只是需要一个更聪明的大脑来驱动它。

模式一中，工作流是指挥官，Agent 是执行者。但如果任务本身路径不确定呢？这时需要反转控制，让 Agent 成为“决策中枢”，负责理解意图、拆解任务、委派工作；工作流引擎作为“执行层”，提供确定性工具调用和外部 API 集成。

### 核心逻辑

这种架构的关键在于**分层决策**：

| 层级 | 角色 | 职责 |
|------|------|------|
| **AI Agent** | 决策中枢 | 理解用户意图、拆解复杂任务、判断执行路径、决定调用哪个工作流 |
| **工作流引擎** | 执行层 | 处理确定性子任务、管理 API 凭证、提供可观测性、确保执行可靠性 |

Agent 不直接操作外部 API，而是通过调用工作流的 webhook 或 API 来“委派”确定性任务。这样既保留了 Agent 的灵活性，又获得了工作流的稳定性和安全性。

### 实现路径

#### 路径 A：Agent 生成并调用工作流

Agent 根据任务需求动态创建工作流，后续通过 webhook 持续调用。

**案例：awesome-openclaw-usecases**

[awesome-openclaw-usecases](https://github.com/hesamsheikh/awesome-openclaw-usecases/blob/main/usecases/n8n-workflow-orchestration.md) 描述了一种代理模式：

```text
┌──────────────┐     webhook call      ┌──────────────────┐     API call     ┌──────────────┐
│   OpenClaw   │ ───────────────────→  │   n8n Workflow   │ ─────────────→   │  External    │
│   (agent)    │   (no credentials)    │  (locked, with   │  (credentials    │  Service     │
│              │                       │   API keys)      │   stay here)     │  (Slack, etc)│
└──────────────┘                       └──────────────────┘                  └──────────────┘
```

工作流程：
1. Agent 分析需求，设计工作流结构
2. 通过 n8n API 创建工作流（仅包含 webhook 触发器）
3. 用户手动添加 API 凭证并锁定工作流
4. 后续所有外部调用都通过 webhook 进行，Agent 不接触凭证

**优势**：可观察性（可视化 UI）、安全性（凭证隔离）、性能（确定性任务不消耗 LLM token）

#### 路径 B：Agent 基于模板快速生成工作流

Agent 利用现有模板库，快速组装工作流，降低生产成本。

**案例：n8n-mcp**

[n8n-mcp](https://github.com/czlonkowski/n8n-mcp) 是一个 MCP 服务器，让 Claude 等 AI 助手能够：

- 访问 1,396 个 n8n 节点的文档和属性
- 参考 2,709 个工作流模板和 2,646 个预提取配置
- 基于模板快速生成新的工作流

核心价值：**降低工作流的生产成本**，让 Agent 能够像调用工具一样“编写”工作流。

### 阿里云百炼 Workflow 的实践方向：bailian CLI

![bailian CLI 工作流生命周期](https://img.alicdn.com/imgextra/i1/O1CN01F9WgeB1ZWZKr1HQzu_!!6000000003202-2-tps-1792-1024.png)

> 百炼 CLI 让工作流具备代码的可复用性和 API 的可调用性——开发者用 CLI 生产，Agent 用 webhook 消费。

百炼平台有 300+ 官方工作流模板，但它们大多锁在 UI 里，不能被外部 Agent 方便地复用。bailian CLI 要解决的核心问题是：**让工作流变成可生产、可消费的服务（Workflow as a Service）**。

借鉴 [n8n-mcp](https://github.com/czlonkowski/n8n-mcp) 的「模板即代码」思路，bailian CLI 把工作流的完整生命周期搬到命令行：

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         bailian-cli                                      │
├─────────────────────────────────────────────────────────────────────────┤
│  $ bailian search "RSS 抓取"          # 搜索相关模版                      │
│  $ bailian clone rss-summary     # 下载模版到本地                    │
│  $ bailian edit                       # 交互式编辑配置                    │
│  $ bailian deploy                     # 部署到百炼平台                    │
│  $ bailian invoke rss-summary    # 触发执行（Agent 也用这个）         │
└─────────────────────────────────────────────────────────────────────────┘
```

#### 命令设计

| 命令 | 用途 | 开发者场景 | Agent 场景 |
|------|------|-----------|-----------|
| `search <keyword>` | 从 300+ 模板库语义检索 | 找到合适的起点 | Agent 自动匹配用户需求 |
| `clone <template-id>` | 下载模板到本地 | 本地开发、版本管理 | 获取工作流定义文件 |
| `edit` | 交互式编辑工作流配置 | 调整参数、定制逻辑 | Agent 程序化修改配置 |
| `validate` | 校验配置合法性 | 上线前检查 | 部署前自动校验 |
| `deploy` | 部署到百炼平台 | 发布上线 | Agent 自动部署 |
| `invoke` | 触发工作流执行 | 调试验证 | Agent 通过 webhook 调用 |

同一套命令，开发者和 Agent 都能用——区别只在于谁在敲键盘。

#### 端到端示例：RSS 监控 + 飞书推送

**第一幕：开发者生产工作流**

```bash
# 搜索 RSS 相关模板
$ bailian search "RSS 抓取"
  → rss-summary (RSS 定时抓取 + AI 摘要 + 飞书群通知)

# 下载到本地
$ bailian clone rss-summary
  → ./rss-summary/template.yml

# 编辑配置：修改 RSS 源和飞书 webhook 地址
$ bailian edit --file=rss-summary/template.yml

# 部署到百炼平台
$ bailian deploy --env=prod
  → 已部署，webhook: https://bailian.aliyuncs.com/#/app-center/app-work-flow/xxx
```

工作流上线了。开发者可以在百炼平台的可视化界面追踪每次执行。

**第二幕：Agent 消费工作流**

```
┌──────────────┐   invoke webhook      ┌─────────────────┐   百炼能力调用   ┌──────────────┐
│  OpenClaw    │ ───────────────────→  │  百炼 Workflow   │ ─────────────→ │  百炼大模型/   │
│  (Agent 网关) │   (不接触凭证)         │  (已部署为服务)    │  (定时调度/     │  知识库/       │
│              │                       │                  │   长时运行)     │  外部 API     │
└──────────────┘                       └──────────────────┘                └──────────────┘
         ↑                                                                    │
         └────────────────────  webhook 回调结果 ──────────────────────────────┘
```

用户在钉钉中对 OpenClaw 说：“帮我监控 Hacker News 的 AI 相关文章。”OpenClaw 的处理：

1. `bailian search "RSS 抓取"` → 找到已部署的 rss-summary
2. `bailian invoke rss-summary --rss-url=https://hn.algolia.com/... --schedule=daily` → 触发执行

OpenClaw 不存储任何 API Key，不运行定时任务，不消耗 LLM token 做 RSS 解析——这些全部由百炼平台承担。Agent 只做了它最擅长的事：理解用户意图，找到合适的工作流，调用它。

#### 为什么是 CLI 而不是 MCP？

CLI 是最小公约数。开发者直接用，Agent 通过 shell 调用，CI/CD 管道也能集成。未来可以在 CLI 之上封装 MCP Server，但 CLI 本身就是最通用的接口。

#### 核心价值

一句话：**开发者用 CLI 把工作流变成服务，Agent 用 webhook 把服务变成能力**。百炼 CLI 是连接人和 Agent 的桥梁——同一个工作流，人来生产，Agent 来消费，百炼平台提供运行时保障（凭证隔离、可观测性、定时调度）。



## 四、如何选择：决策框架

![三步决策框架](https://img.alicdn.com/imgextra/i4/O1CN01P84CGt1efKzsDVpNL_!!6000000003898-2-tps-1792-1024.png)

当你面对一个自动化需求时，问自己三个问题就够了：

### 三步决策

**第一步：路径是否已知？**

如果你能在白板上画出完整的流程图（每一步做什么、数据怎么流转、异常怎么处理），那就是工作流的活。如果你只能描述目标但说不清中间步骤，那需要 Agent 介入。

**第二步：哪些环节需要 LLM？**

把流程拆成节点，标记哪些需要 LLM 判断。如果大部分节点是确定性的（API 调用、数据转换、条件分支），只有少数需要智能处理（内容生成、意图理解、错误诊断），那就用工作流编排 Agent（模式一）。如果连“下一步该做什么”都需要 LLM 来决定，那就让 Agent 驱动工作流（模式二）。

**第三步：执行频率和成本能接受吗？**

Agent 每次执行都消耗 token。高频任务（每天数百次以上）尽量把确定性部分抽成工作流节点，只在必要环节调用 Agent。低频但复杂的任务（每天几次到几十次），Agent 全程参与的成本通常可以接受。

```
你的任务 → 路径是否已知？
  ├─ 是 → 大部分节点是确定性的？
  │    ├─ 是 → 纯工作流 或 模式一（Workflow 编排 Agent）
  │    └─ 否 → 模式二（Agent 驱动 Workflow）
  └─ 否 → 模式二（Agent 驱动 Workflow）
```

### 两种模式的适用场景

| 架构选择 | 适用场景 | 典型案例 |
|----------|----------|----------|
| **模式一：Workflow 编排 Agent** | 流程框架确定、局部需要智能 | 运维告警自动修复、定期报告生成 |
| **模式二：Agent 驱动 Workflow** | 目标明确、路径未知、需要多轮探索 | 复杂调研任务、自动化测试编排 |

**最佳实践：** 工作流触发 Agent 执行复杂任务，结果回流到工作流存储。

**避免陷阱：**
- 别让 AI 干流程控制的活——成本失控
- 别让流程引擎干创造性的活——维护噩梦

## 最后

Workflow 和 Agent 最适合的关系，不是谁替代谁，而是谁负责哪一层。流程已知、要求稳定、需要审计的部分，交给 Workflow；目标明确但路径不固定、需要推理和探索的部分，交给 Agent。

真正好用的系统，往往不是把所有事情都压给一个更“聪明”的组件，而是把确定性和涌现性放在各自最合适的位置。这样成本更可控，系统也更容易长期维护。
