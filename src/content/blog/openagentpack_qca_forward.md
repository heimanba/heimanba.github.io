---
title: 'OpenAgentPack + Qoder Forward Mode：一条配置把 Agent 接入IM'
description: 'OpenAgentPack 负责把 Agent、身份、环境、IM 渠道声明为代码，Qoder Forward Mode 负责把这些声明分发到 IM 并执行会话。一条 agents apply 就能让研发值班、客服、知识库 Agent 进钉钉、飞书、企业微信。'
pubDate: 'Aug 25 2026'
---

# OpenAgentPack + Qoder Forward Mode：一条配置把 Agent 接入IM

> OpenAgentPack 负责把 Agent、身份、环境、IM 渠道声明为代码，Qoder Forward Mode 负责把这些声明分发到 IM 并执行会话。一条 `agents apply` 就能让研发值班、客服、知识库 Agent 进钉钉、飞书、企业微信。

项目地址：[modelstudioai/OpenAgentPack](https://github.com/modelstudioai/OpenAgentPack)

IM 里的问答机器人已经不少见了。但一个能查日志、跑定时任务、还能在协作中记住团队规则的 Agent，和普通的 FAQ 机器人不是一回事。

OpenAgentPack 的做法是把 Agent、身份、运行环境、IM 渠道都写到 `agents.yaml` 里，像管理 Terraform 或 Kubernetes 资源一样管理 Agent。配置进 Git 后，可以用 PR 审查、回滚、复用。Qoder Forward 负责把这些声明分发到 IM 渠道，支持钉钉、飞书、企业微信。

下面以一个钉钉研发值班 Agent 为例，看看一条配置能做出什么样的 Agent，以及 Memory 和 `/clear` 在实际使用中怎么处理。

## 一条配置，把值班 Agent 接进钉钉

这是钉钉研发值班 Agent 的 `agents.yaml`。Qoder Forward 里，Identity 对应终端用户或租户，Environment 是运行环境，Agent 定义模型、指令和工具，Channel 负责把 Agent 接入 IM。

```yaml
version: "1"

providers:
  qoder:
    api_key: ${QODER_PAT}

defaults:
  provider: qoder
  identity: oncall

identities:
  oncall:
    external_id: oncall
    name: "oncall"

environments:
  oncall-env:
    config:
      type: cloud
      networking:
        type: unrestricted

agents:
  oncall-agent:
    instructions: |
      你是团队研发值班助手。
      负责分诊告警、解答技术问题，并按既定流程升级故障。
    environment: oncall-env
    model:
      qoder: auto
    tools:
      builtin: [Bash, Read, Write, Edit, Glob, Grep, WebFetch, WebSearch]
      default_permission: allow
    managed_tool_config:
      enabled_tools:
        - create_forward_schedule
        - list_forward_schedules
        - delete_forward_schedule
    delivery:
      qoder:
        type: forward

channels:
  oncall-dingtalk:
    name: "oncall Agent DingTalk"
    agent: oncall-agent
    type: dingtalk
    credentials:
      client_id: ${DINGTALK_CLIENT_ID}
      client_secret: ${DINGTALK_CLIENT_SECRET}
    options:
      include_thinking: false
```

执行 `agents apply` 后，OpenAgentPack 会按依赖关系创建或更新环境、身份、Agent 模板和钉钉 Channel。

![`agents apply` 创建环境、身份、Agent 模板与钉钉 Channel 的执行结果](https://img.alicdn.com/imgextra/i2/O1CN01qkm3je7DoVD3RUo8_!!6000000004462-2-tps-1696-596.png)

密钥通过 `${VAR_NAME}` 从环境变量读取，不进 Git；Agent 和 Identity 用逻辑名引用，不用复制远端资源 ID。同一份配置可以在多个环境复用，变更也可以走 PR 审查。

部署完成后，Agent 以机器人身份进入钉钉会话。团队成员 `@` 它，就能发起告警分诊、技术答疑、故障升级、定时巡检或代码与日志查看等任务。

![钉钉中的研发值班 Agent 能力说明](https://img.alicdn.com/imgextra/i3/O1CN01FPn6PEbCxML2qUNo_!!6000000001346-2-tps-1402-1122.png)

## 不只是被 @，Agent 会主动执行任务

接入 IM 后，Agent 不应该只在被提问时出现。

Qoder Forward 的 Schedule 能力可以让 Agent 在设定时间自动执行任务，并把结果回传到 IM 会话。比如：

- 每天 9 点汇总昨晚未关闭的告警；
- 每周一提示本周高风险变更；
- 每 30 分钟检查错误率，异常时通知值班群；
- 每天下午汇总客户支持问题与待处理事项。

这些场景下，Agent 不只是一个聊天窗口，而是按规则持续执行的协作者。

![在钉钉中设置每天上午 9 点推送 AI Agent 最新资讯](https://img.alicdn.com/imgextra/i2/O1CN01pB8HswAMcrJ3PU1Q_!!6000000002291-2-tps-1680-936.png)

到了设定时间，Agent 会以机器人身份把执行结果直接推送到群里：

![定时任务执行结果：Agent 在钉钉群中自动推送 AI Agent 资讯速递](https://img.alicdn.com/imgextra/i2/O1CN010rLEa1bzWJJ2jBj8_!!6000000003841-2-tps-1344-1170.png)

## Memory：让 Agent 在协作中学会团队规则

接入 IM 之后，Agent 会在答疑和协作中积累团队的工作方式。Memory 机制让它可以像实习生一样，被不断纠正、补充领域知识。

实际落地时，Memory 有几个用法：

- **区分管理员与普通用户。** 管理员对 Agent 的纠正和规则要求，会沉淀为 Memory 中的高优先级指示；普通用户的临时提问不应反过来改写团队规则。这样可以避免 Agent 被一次普通对话带偏。
- **用“记住规则”承接运行中发现的经验。** 新流程、例外情况、团队习惯会不断出现，SKILL 不一定能及时覆盖。可以直接让 Memory 先接住，稳定后再写回 SKILL。
- **让 SKILL 收敛为稳定边界。** 很多为了编排流程而写得很细的 SKILL，经过持续纠错后，可以收敛为稳定的能力边界；具体的团队知识、口径和例外，由 Memory 在实际协作中逐步补齐。

但这不意味着 SKILL 可以被替代。权限、工具边界、安全红线、可复用的标准流程，还是应该保留在 YAML 与 SKILL 中，接受 Git 审查。Memory 适合承载管理员持续校正出来的、贴近业务现场的经验。

## `/clear`：群聊上下文需要定时清理

一个 IM 群对应一个固定的 Session。答疑持续进行，会话上下文会不断累积，时间一长就可能触及模型的上下文长度上限，表现为回答变慢、变贵，甚至报错。

遇到这种情况，在群里发送 `/clear` 即可清理当前会话的对话历史，让 Agent 从干净状态继续工作。`/clear` 只清会话历史，管理员沉淀在 Memory 中的规则、YAML 和 SKILL 里声明的能力都不受影响。

实际使用中会形成一个节奏：长期经验交给 Memory，会话变长或话题切换时用 `/clear` 重置。既保留 Agent 的“记性”，又避免上下文无限膨胀。

## 三个适合先试的场景

- **值班群**：告警分诊、日志检索、故障升级建议；
- **支持群**：FAQ 回答、工单摘要、知识库检索；
- **项目群**：日报汇总、风险跟踪、定时提醒。

建议先从一个低风险、高频、上下文集中在 IM 中的场景开始，最容易看到效果。

## 把 IM Agent 当作工程资产来交付

把 Agent 接入 IM 不该是一次性的机器人配置。

OpenAgentPack 把 Agent、身份、环境和渠道声明为代码；Qoder Forward 提供身份隔离、会话执行、渠道分发和定时触发的运行能力。两者结合，可以把 IM Agent 的交付从手工配置变成可版本化、可审查、可复用的流程。

```text
Agent 定义 + Identity + Environment + IM Channel
                        ↓
                   agents.yaml
                        ↓
              Git / PR / Plan / Apply
                        ↓
           可用、可审查、可演进的 IM Agent
```

想试一下？先安装 CLI 并配置好 Qoder 与 IM 机器人凭据：

```bash
npm i -g @openagentpack/cli
```

将上文 `agents.yaml` 保存到项目目录，按需填入环境变量后执行：

```bash
agents apply
```

把你的第一个 AI Agent 接入团队 IM。
