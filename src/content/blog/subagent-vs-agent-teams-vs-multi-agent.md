---
title: '别急着上多 Agent：先分清 Subagent、Handoff 和 Agent Teams'
description: '从控制权与信息流出发，区分星型 Subagent、链式 Handoff 与网状 Agent Teams 三种多 Agent 形态，并讨论成本、失败模式与企业落地中的架构选择。'
pubDate: 'Aug 31 2026'
---

# 别急着上多 Agent：先分清 Subagent、Handoff 和 Agent Teams

讨论 Subagent 和多 Agent 时，人们常把不同层次的概念放在一起比较。其实，比名称更有用的是看两个问题：谁对最终结果负责，信息在 agent 之间怎么传递。

沿着这两个问题，可以区分三种常见形态：主节点统一调度的**星型**（Subagent）、控制权逐段移交的**链式**（Handoff），以及成员可以直接协作的**网状**（Agent Teams）。OpenAI Agents SDK 对前两种模式的区分是：agents-as-tools 由主管保留答复权，handoff 则把对话交给专家 agent。Claude Code 的 Agent Teams 更进一步，teammate 是相互独立、可以直接通信的实例。

![控制权谱系：三种多Agent拓扑——星型、链式、网状](https://img.alicdn.com/imgextra/i3/O1CN01qo7VOyNmOZC2nDN2_!!6000000002517-2-tps-1376-768.png)

## 一、星型：Subagent 是一次性的上下文分支

Subagent 属于 orchestrator-worker（编排者—工作者）模式。主 agent 保留完整任务，负责拆解、派发和汇总；子代理各自处理一块任务，在隔离的上下文里执行，交付结果后结束。它的结构和 MapReduce、任务队列有些相似，只不过工作单元变成了独立的模型上下文。

以 Claude Code 的 subagents 为例：每个子代理有自己的上下文窗口、系统提示词和工具权限，主代理根据描述选择委派对象。Anthropic 在《Effective context engineering for AI agents》（2025-09）中把上下文视为有限且边际收益递减的资源。子代理为某项任务单独使用一块 token 空间，最后只把压缩后的结果交还主代理，通常是 1,000–2,000 tokens。对检索任务而言，这种压缩尤其重要。

![星型Subagent架构：Orchestrator派发任务，Subagent回传浓缩摘要](https://img.alicdn.com/imgextra/i2/O1CN01FsydanDb2EG2nDN2_!!6000000008027-2-tps-1376-768.png)

这种结构层级清楚：任务自上而下分派，结果回到主代理，子代理通常不直接通信，也不共同维护状态。因为协作路径少，它相对容易预测和调试。OpenAI 的对应实现是 `as_tool()`：专家 agent 被包装成一个工具，主管调用它、取得结果，然后继续处理对话。

Anthropic 在 2025 年 6 月公布的研究系统中，用 Claude Opus 3.5 调度多个 Claude Sonnet 3.5 子代理并行检索；在其内部研究评测中，这套系统比单代理方案高出 **90.2%**。这个结果说明并行检索可能带来明显收益，但它来自特定任务和内部评测，不宜直接外推到所有场景。

## 二、链式：Handoff 把对话交给下一个 agent

Handoff（交接）既不是主从调用，也不是多个 agent 同时协作。控制权会转移，但同一时刻通常只有一个 agent 在处理对话。

客服分流是典型例子：triage agent 判断意图后，把对话交给 billing 或 refund 专家；此后专家直接面对用户，triage 不再参与。Subagent 只是受托完成一项任务，handoff 的接收者则接管后续对话。

因此可以按责任来判断：专家需要接管后续对话，用 handoff；主管仍要合成最终答案，专家只做边界明确的任务，用 agents-as-tools；如果成员之间需要直接讨论，再考虑 agent teams。

![链式Handoff流程：Triage Agent判断意图后移交控制权给专家](https://img.alicdn.com/imgextra/i2/O1CN015HfqvCk4wwB3daAC_!!6000000002383-2-tps-1792-1024.png)

Handoff 通常按顺序发生，一次交给一个专家，因此不适合并行调用多个工具。在 LangGraph 中，agent 可以通过 `transfer_to_<agent>` 工具返回 `Command(goto=目标)`，让执行流跳到另一个节点；`active_agent` 记录当前由谁处理。若要在下一轮继续这段状态，还需要配置 checkpointer。

## 三、网状：Agent Teams 让成员直接通信

Agent Teams 中，每个成员都是相对独立、生命周期较长的实例。它和 subagent 最直观的区别，不是 agent 数量，而是成员之间能否点对点通信。

Claude Code 的 Agent Teams 在 2026 年 2 月随 Opus 4.6 以研究预览形式发布。它包括四部分：负责建队和初始分工的 team lead；不继承 lead 对话历史的独立 teammates；可自行认领任务、按依赖解锁的共享 task list；以及用于成员间私信的 mailbox。消息最终写入 `~/.claude/teams/{team}/inboxes/*.json`，实现并不复杂。

Subagent 只向调用者返回结果，工作仍由主 agent 统一安排；teammate 可以直接发消息，也可以通过共享任务列表协调进度。前者适合边界清楚、只需要交付结果的子任务，后者适合确实需要讨论、质疑和动态调整分工的工作。

![网状Agent Teams：队友间点对点通信，共享任务列表与Mailbox](https://img.alicdn.com/imgextra/i1/O1CN01Crg9LRTOMTI2nDN2_!!6000000004725-2-tps-1376-768.png)

## 四、代价：token、协调和上下文损耗

多 agent 带来的不只是并行能力，也增加了 token 消耗和协调成本。

Anthropic 的数据中，agent 交互消耗的 token 约为普通对话的 4 倍，多智能体系统约为 **15 倍**；token 用量还能解释 80% 的效果方差。换句话说，部分质量提升来自更多的采样、搜索和上下文投入。是否划算，要和任务价值一起计算。

UC Berkeley 团队分析 7 个主流多智能体框架的执行轨迹后，提出了 MAST 失败分类法（NeurIPS 2025），共三大类十四种：41.8% 是规范问题，例如重复步骤或无法适时终止；36.9% 是代理间失配，例如任务跑偏、缺少必要澄清；21.3% 是验证问题，例如过早终止或验证错误。这里暴露出的很多问题都在系统设计层，而不只是模型能力不足。

![冷思考：多Agent成本高达15倍，MAST失败分类揭示系统设计缺陷](https://img.alicdn.com/imgextra/i4/O1CN017imrHRd1qyD3daAC_!!6000000006563-2-tps-1792-1024.png)

Cognition（Devin 团队）在 2025 年 6 月的《Don't Build Multi-Agents》中把问题归到上下文：决策分散后，agent 很难共享行动中形成的隐含判断。文章举了一个例子：两个并行子代理分别绘制 Flappy Bird 的小鸟和背景，合并后风格并不协调。任务说明可以传递，但执行过程中形成的审美选择和局部假设很难完整同步。

拆分方式也会影响结果。Anthropic 后续文章提到，按工种拆分——一个写功能、一个写测试、一个审查——会让上下文在交接中不断损耗，有时协调消耗的 token 甚至多于实际工作。按上下文边界拆分通常更合适：实现功能的 agent 顺手写测试，因为相关判断还在它的上下文中。LangChain 的 Harrison Chase 提供了另一个判断维度：读操作容易并行，写操作耦合度更高，最好由一个 agent 收口。Anthropic 的研究系统正是让 subagent 并行检索，最后由 lead 统一写报告。

这并不意味着多 agent 一概不可用。Anthropic 的研究系统就是一个收益能够覆盖成本的例子。Cognition 的 Walden Yan 一年后也更新了判断：一些配置已经可行，方向主要是异步 agent 和隔离执行，而不是多个成员紧耦合地共享状态。

## 五、怎么选：先从单 Agent 开始

第一个问题不是选哪个框架，而是一个 agent 能否在连贯的上下文中可靠完成任务。如果可以，就没有必要拆分。

OpenAI 的建议是先把单 Agent 的能力用到极致。只有当工具和领域过多、指令互相干扰，或者任务存在明确的上下文隔离与并行收益时，才引入多个 Agent。尤其是修改同一份代码、处理同一笔订单、完成同一条审批这类强耦合写操作，拆分会让隐含决策在交接中丢失。

以下几类任务更可能从拆分中获益：子任务会产生大量中间材料，而主任务只需要结论；多个方向可以独立搜索和验证；不同领域需要的工具、权限或系统指令彼此冲突。

对应到架构，可以参考下表：

| 任务形状 | 推荐架构 | 原因 |
| --- | --- | --- |
| 强耦合的小改动、同一业务对象的连续处理 | 单 Agent | 保留完整上下文，责任集中 |
| 大范围研究、尽调、多源检索 | Subagent / Supervisor | 可并行探索，由主管统一成文 |
| 客服、售前等多轮领域分流 | Handoff | 专家直接接管后续对话 |
| 合规审查、审批和最终结果必须统一负责 | Supervisor | 权限、审计和最终输出有收口点 |
| 固定审批流、ETL、步骤可提前枚举 | 确定性工作流 | 不必让模型重复决定已知流程 |
| 需要长期协作、相互质疑和动态认领任务 | Agent Teams | 点对点沟通本身能产生价值 |

![选型指南：默认单Agent，按任务形状升级到Subagent、Handoff或Agent Teams](https://img.alicdn.com/imgextra/i2/O1CN01iYCFJK2aEzI2nDN2_!!6000000006698-2-tps-1376-768.png)

简化来说，读取密集、可并行、可独立验证的任务更适合拆；写入密集、共享状态、依赖紧密的任务更适合集中处理。最终仍要比较质量、延迟和成本，架构图本身不能证明收益。

## 六、企业落地：平台集中，能力分散

在大型企业里，“单 Agent 还是多 Agent”至少涉及三个层面：用户面对几个助手，一次任务用了几个模型上下文，以及不同业务团队如何建设和维护能力。这三层不必采用相同的组织方式。

一种常见做法是：用户只看到一个入口，后台按需调用不同领域能力；公共平台由中央团队维护，领域 agent 由业务部门负责，具体流程则由应用团队编排。

```text
用户 / 业务系统
       │
       ▼
入口 Agent 或业务应用
       │
       ▼
策略路由与流程编排
身份、权限、预算、审批、超时
       │
       ├── 确定性 API / Tool
       ├── MCP Server
       ├── 领域 Agent
       └── 人工审批 / 传统工作流
              │
              ▼
       企业数据与业务系统
```

![企业多Agent落地架构：平台集中、领域分布式、按场景编排](https://img.alicdn.com/imgextra/i3/O1CN01lhJ1AymsI1B2nDN2_!!6000000004845-2-tps-1376-768.png)

这更接近微服务的联邦模式：基础设施和安全治理集中，业务所有权下放，领域能力通过标准契约接入。

### 6.1 平台团队：提供公共能力和规则

平台团队不必替各部门开发 agent，主要提供模型网关、身份与权限传递、Agent Registry、开发与运行环境，以及评测、追踪、成本控制、发布和下线机制。它维护的是一套标准化的交付和运行环境，而不是包办所有业务的中央 agent。

Microsoft 的企业 Agent 指南把组织模式分为集中式、混合式和联邦式。规模扩大后，可以把平台、身份、安全基线、架构标准和 Registry 留在中央，把 agent 的建设和持续改进交给业务团队。这样既能避免中央团队成为交付瓶颈，也能减少各部门的重复建设。

### 6.2 业务部门：对领域能力负责

财务、HR、法务、采购等团队负责自己的知识、工具、提示词、评测集和业务结果，也要定义 agent 的能力边界。领域内部使用单 agent、Supervisor 还是多个并行 subagent，可以作为实现细节；对外只暴露稳定、可版本化的能力契约。

每个领域能力接入平台时，至少要登记：负责人、能力范围、输入输出、所需权限、是否修改真实数据、风险等级、SLA、成本上限、版本和评测结果。这样平台才能可靠路由，也才能在出错时找到责任主体。

### 6.3 应用团队：编排用户场景

企业助手、采购系统、客服和销售工作台负责最终用户体验，并按具体任务调用领域能力。例如“新员工入职”涉及 HR、IT、门禁和财务，但它首先是一个确定性业务流程，不需要四个 Agent 自由聊天；只有某个环节确实需要开放式推理时，才调用相应领域 Agent。

因此，企业里更常见的多 agent 形态会是主管调用专家：入口 agent 保留最终答复和用户关系，领域 agent 完成边界明确的任务。研究、方案设计、红蓝对抗等需要开放式探索的任务，才可能用到 Agent Teams。

### 6.4 先判断接入的是工具还是 Agent

业务团队提供的每项能力不必都包装成 Agent：

| 业务能力 | 推荐接入方式 |
| --- | --- |
| 查询库存、计算税费、创建工单 | API / Tool |
| 向模型提供企业数据和业务操作 | MCP Server |
| 需要专业推理，但由上级统一收口 | Agent-as-Tool |
| 跨团队、跨平台、异步完成复杂任务 | A2A Agent |
| 步骤固定、涉及审批和事务一致性 | Workflow Engine |

查询、计算、提交等确定性动作通常做成工具就够了。只有当一项能力需要自主规划、多轮协商、维护任务状态，或异步产出复杂结果时，才有必要包装成 agent。

### 6.5 按风险分级，而不是一刀切

治理强度应取决于 agent 的实际行为。总结、搜索、起草等辅助型 agent 风险较低；创建工单、更新客户记录等流程型 agent 需要明确负责人、权限控制和审计；付款、退款、生产变更等自主执行型 agent 则需要限额、人工审批、完整追踪和熔断机制。

比 agent 数量更重要的是：系统在辅助人做决定，还是会直接修改真实状态。增加 agent 不会降低单个动作的风险，却可能拉长责任链。因此，越接近写操作和核心交易，控制权越需要集中。

这套分工可以收束成一句话：一个公共平台承载多个领域能力，应用按场景编排，平台按风险治理。默认使用单 agent；跨领域任务由主管统一收口；Agent Teams 留给确实需要协作探索的任务。

## 七、协议层：MCP 与 A2A

多 agent 互操作还涉及 MCP 和 A2A 两种协议。**MCP**（Model Context Protocol，Anthropic 于 2024 年 11 月发布）连接 agent 与工具、数据源；**A2A**（Agent2Agent Protocol，Google 于 2025 年 4 月发布）用于不同厂商、不同框架的 agent 相互发现和通信。两者后来分别捐赠给 Linux Foundation；截至 2026 年 4 月，A2A 获得了超过 150 家组织支持。两者关注的问题不同，也可以配合使用。

## 结语

Subagent、handoff 和 Agent Teams 的区别，最终落在控制权和信息流上：主 agent 是等待子任务结果、把对话交给下一位专家，还是允许多个成员直接协作。企业还要考虑另一层分工：平台和治理可以集中，领域能力由各业务团队建设，应用再按场景调用。

2025–2026 年间，各框架使用的核心抽象正在靠近：Agent、Tool、Handoff 或 Delegation 已经相当常见，差异更多体现在编排和部署方式。对开发者来说，框架名称不是最重要的。先弄清任务能否并行、上下文在哪里分界、谁负责最终结果，再决定是否拆分，通常更可靠。

## 参考资料

- [Building effective agents — Anthropic（2024-12）](https://www.anthropic.com/engineering/building-effective-agents)
- [How we built our multi-agent research system — Anthropic（2025-06）](https://www.anthropic.com/engineering/multi-agent-research-system)
- [Effective context engineering for AI agents — Anthropic（2025-09）](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- [Subagents — Claude Code Docs](https://code.claude.com/docs/en/sub-agents)
- [Orchestrate teams of Claude Code sessions — Claude Code Docs](https://code.claude.com/docs/en/agent-teams)
- [OpenAI Agents SDK: Multi-agent patterns](https://openai.github.io/openai-agents-python/multi_agent/) / [A practical guide to building agents（PDF）](https://cdn.openai.com/business-guides-and-resources/a-practical-guide-to-building-agents.pdf)
- [LangChain multi-agent docs（subagents / handoffs）](https://docs.langchain.com/oss/python/langchain/multi-agent)
- [CrewAI Documentation](https://docs.crewai.com/en/introduction)
- [Microsoft Agent Framework Overview](https://learn.microsoft.com/en-us/agent-framework/overview/agent-framework-overview)
- [Introducing the Model Context Protocol — Anthropic（2024-11）](https://www.anthropic.com/news/model-context-protocol)
- [A2A: A New Era of Agent Interoperability — Google（2025-04）](https://developers.googleblog.com/en/a2a-a-new-era-of-agent-interoperability/) / [A2A 一周年进展 — Linux Foundation（2026-04）](https://www.linuxfoundation.org/press/a2a-protocol-surpasses-150-organizations-lands-in-major-cloud-platforms-and-sees-enterprise-production-use-in-first-year)
- [Don't Build Multi-Agents — Cognition（2025-06）](https://cognition.com/blog/dont-build-multi-agents)
- [Why Do Multi-Agent LLM Systems Fail?（MAST）— arXiv 2503.13657，NeurIPS 2025](https://arxiv.org/abs/2503.13657)
- [Choose your Agent Center of Excellence operating model — Microsoft](https://learn.microsoft.com/en-us/agents/center-of-excellence/operating-models)
- [Govern agents by risk — Microsoft](https://learn.microsoft.com/en-us/agents/center-of-excellence/govern-agents-risk)
- [Preparing the business for agentic AI at scale — AWS Prescriptive Guidance](https://docs.aws.amazon.com/prescriptive-guidance/latest/strategy-operationalizing-agentic-ai/preparing-business.html)
