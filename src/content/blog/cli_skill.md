# CLI、MCP、Skill 与 Agent：能力边界和分层实践

越来越多系统强调“一切能力 CLI 化”，因为 CLI 同时适合人类、脚本、CI 和 Agent 调用。但仅仅提供 CLI，并不意味着 Agent 就能可靠完成工作。

更准确地说：CLI、MCP Tool 和 SDK 解决“系统能做什么”，Skill 解决“在什么情况下应该怎么做”，Agent 解决“面对当前目标，下一步做什么”。它们应该分层协作，而不是相互替代。

本文重点回答四个问题：

1. 原子能力和编排能力分别放在哪里？
2. CLI 与 MCP Tool 是什么关系？
3. Domain Skill 和 Workflow Skill 有什么区别？
4. 如何让 Skill 随能力接口演进，而不是变成过期手册？

## 一、先建立共同模型

推荐把系统看成五层：

```text
用户目标
   ↓
Agent
理解目标、动态规划、选择 Skill、处理例外、与用户协作
   ↓
Skill
领域知识、意图路由、工作流、风险策略、验收标准
   ↓
CLI / MCP Tool / SDK
稳定、可发现、可组合的能力接口
   ↓
API / 文件 / 数据库 / SaaS
```

CLI、MCP Tool 和 SDK 位于同一层，不是因为形态相同，而是因为它们承担相同职责：把底层系统能力暴露为稳定的调用契约。它们可以是同一领域能力的不同适配器：CLI 面向终端、脚本和 CI，MCP Tool 面向支持 MCP 的 Agent，SDK 面向应用程序代码。

因此，能力边界清晰、输入输出结构化、错误稳定、可发现、可验证等原则，并非 CLI 独有。MCP 原生提供 Tool 发现和输入 Schema，并可声明输出 Schema、返回结构化结果；CLI 则需要通过 `--help`、schema 命令、JSON 输出、退出码以及 stdout/stderr 约定补齐机器契约。[MCP Tools 规范](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)

可以浓缩成四句话：

> CLI、MCP Tool 和 SDK 给 Agent 手和工具。

> Skill 给 Agent 领域经验和操作方法。

> Agent 根据当前目标动态选择路线。

> 安全、权限、事务和系统不变量必须由确定性程序保证。

![五层架构模型：用户目标 → Agent → Skill → CLI/MCP/SDK → API/数据库/SaaS](https://img.alicdn.com/imgextra/i2/O1CN01pz3kQayEOsD3daAC_!!6000000003983-2-tps-1792-1024.png)

Skill 通常包含 `SKILL.md`，并可附带 `references/`、`scripts/` 和 `assets/`。Agent 先看到名称和描述，匹配任务后再加载完整说明及必要资源，这是一种渐进式披露设计。[OpenAI Build skills](https://learn.chatgpt.com/docs/build-skills)；[Agent Skills 规范](https://agentskills.io/specification)

## 二、原子能力与三种编排

### 原子性不取决于 API 数量

最常见的误区是：把一次 API 调用当作原子，把多次 API 调用当作编排。

> 原子能力是调用者视角下，一个边界清晰、结果明确、可以承诺的业务操作单元。

例如：

```bash
billing refund create --payment pay_123 --amount 100 --output json
```

它内部可能校验权限、检查可退款额度、创建退款并写审计记录。虽然调用了多个 API，但对调用者而言，它仍然是完整的“创建退款”能力。

相反：

```bash
sales fix-customer-problem --customer cus_123
```

即使只有一个入口，也不是良好的原子能力，因为“修复客户问题”没有稳定边界，可能包含联系客户、退款、改套餐、创建工单等完全不同的副作用。

判断重点不是步骤数，而是：输入输出和成功承诺是否明确，部分失败如何表达，能否安全重试，副作用是否可预测，以及能否写成稳定测试。

### 确定性编排：服务或能力接口

```text
校验请求 → 锁定资源 → 修改状态 → 写审计 → 返回 operation_id
```

固定顺序、状态机、事务、幂等、补偿、权限和审计，不应由模型每次临场发挥，应该放到确定性执行层。

CLI 或 Tool 可以暴露 `deployment rollback`、`employee provision` 这样的复合能力，但事务编排未必真正发生在 CLI 进程内。跨资源事务、持久状态、可靠重试和补偿，通常应由后端服务或工作流引擎保证；能力接口只提供稳定入口。

### 语义工作流编排：Skill

```text
理解请求 → 收集信息 → 选择能力 → 判断风险 → 执行 → 验收和汇报
```

这类流程有相对稳定的方法论，但需要根据用户意图、当前上下文和中间结果调整，适合放在 Skill。

### 目标级动态编排：Agent

```text
用户给出最终目标
→ Agent 选择一个或多个 Skill
→ 根据中间结果调整路线
→ 遇到风险或关键选择时与用户协作
```

Skill 不需要穷举所有路线，Agent 应保留运行时重新规划的能力。

### 一条判断标准

> 把 Agent 换成普通程序后仍然必须完全相同的逻辑，优先放到服务或能力接口；只有理解自然语言目标和当前上下文后才能决定的逻辑，优先放到 Skill 和 Agent。

遇到边界问题时，依次问：

1. 这是系统约束，还是运行策略？
2. 顺序和分支是否长期固定？
3. 失败后谁负责恢复？
4. 应使用确定性测试，还是场景 eval 验证？

![三种编排类型对比](https://img.alicdn.com/imgextra/i2/O1CN01gIaRnQlRhGB2nDN2_!!6000000002522-2-tps-1376-768.png)

## 三、CLI / MCP Tool 应该提供什么

理想的能力接口应让 Agent、人类和程序都能稳定调用、观察和验证。它应围绕明确的领域动作，而不是把 URL、认证、分页、重试和错误码全部转嫁给 Skill。

```bash
crm customer get --id cus_123 --output json
crm customer update --id cus_123 --tier gold --output json
release deployment rollback --deployment dep_123 --output json
```

Raw API 可以作为逃生口，但主路径最好提供 `order refund`、`deployment rollback` 这样的领域能力。另一方面，`deploy everything --be-smart` 也越过了合理边界，因为它需要开放式理解意图，且无法提前描述全部副作用。

CLI 与 MCP Tool 共享一套 Agent-facing capability contract：

| 能力契约 | CLI 中的实现 | MCP Tool 中的对应机制 |
| --- | --- | --- |
| 能力命名与边界 | 命令和子命令 | Tool 名称与描述 |
| 输入约束 | flag、位置参数、schema | `inputSchema` |
| 结构化结果 | JSON 输出 | `structuredContent` / `outputSchema` |
| 能力发现 | `--help`、`schema`、`capabilities` | `tools/list` |
| 失败表达 | 退出码、stderr、JSON error | Tool result / `isError` |
| 长任务 | `start/status/wait/cancel` | 任务或状态查询 Tool |

共同契约不等于实现完全相同。stdout/stderr、退出码、Shell 转义、二进制安装和本地运行环境仍然是 CLI 特有问题。

### 结构化输出与稳定错误

```json
{
  "schema_version": "1",
  "ok": true,
  "data": {"id": "123", "status": "active"},
  "warnings": [],
  "request_id": "req_abc"
}
```

失败结果应提供稳定的错误类型、错误码、是否可重试和恢复提示。CLI 的 stdout 放结果，stderr 放诊断与进度；不要让 Agent 从彩色表格或自由文本中猜字段。

### 自描述能力

```bash
tool command --help
tool schema command.name
tool capabilities --output json
tool version --output json
```

Agent 能动态发现 WHAT，Skill 就不必复制参数手册。MCP 已通过协议提供 Tool 发现和参数 Schema；CLI 若要达到相近的可发现性，需要显式提供机器可读入口。

### 安全执行与长任务

```bash
tool customer update ... --dry-run
tool deploy create ... --idempotency-key task_789_step_4
tool delete ... --confirm-resource-id res_123

release start ...
release status op_123
release wait op_123 --timeout 300
release cancel op_123
```

Skill 可以规定何时 dry-run 或请求确认，但权限检查、资源范围、幂等和审计必须由程序实施。长任务应返回 `operation_id` 并提供明确状态；不要让 Agent 长时间解析滚动日志，也不要把 `submitted` 或 `pending` 误判为完成。


## 四、Skill 应该提供什么

Skill 的定位是：教 Agent 如何把模糊目标转化为可靠行动，同时保留根据上下文判断的空间。

例如用户说：“帮我处理这个客户的逾期账款，但不要破坏关系。”Skill 可以指导 Agent 查询客户价值和逾期账单，选择沟通策略，在高风险情况下生成草稿或请求确认，最后检查状态并生成摘要。

核心不是固定的 Shell 顺序，而是：

- 用户意图如何映射到领域能力；
- 什么情况下使用哪个能力；
- 如何选择身份和权限；
- 何时 dry-run、确认、停止或降级；
- 如何判断任务真正完成。

### 写决策知识，不重写接口手册

脆弱的 Skill：

```markdown
运行 foo list，然后运行 foo get，最后运行 foo update。
```

更好的 Skill：

```markdown
先确认目标资源的当前版本。
如果已经达到期望状态，不执行更新。
存在并发修改时停止，并展示版本差异。
高风险字段变化必须先 dry-run。
执行后根据结构化结果验收。
```

命令名、flag、类型、默认值和输出 Schema 应由能力接口拥有；Skill 维护什么时候用、为什么用、如何判断以及何时停止。

### description、渐进式披露与完成条件

description 是路由器，应写清 WHAT、WHEN、典型用户表达、明确不负责什么，以及相邻 Skill 的边界。过窄会漏触发，过宽会误触发并污染上下文。

```text
my-skill/
├── SKILL.md        # 路由、原则、核心流程
├── references/     # 条件性领域规范和错误恢复
├── scripts/        # 可测试的确定性辅助能力
└── assets/         # 模板和固定资源
```

主 `SKILL.md` 不应成为大全。详细内容移动到 reference 后，要明确说明何时读取哪个文件。

完成条件也必须明确，例如：异步 operation 已进入 `succeeded`，结果包含目标资源 ID，warnings 已披露，并已生成变更摘要。不能把“已提交请求”描述成“已经完成”。

### Skill 中的脚本何时应该下沉

`scripts/` 适合承载格式转换、结果校验、渲染检查、输出规范化和无副作用计算。

当脚本被多个 Skill 使用、形成稳定接口、涉及外部副作用，或需要权限、审计、可靠重试和独立发布时，应升级为正式 CLI、Tool 或服务能力。

```text
Skill 中的命令片段
→ Skill 私有脚本
→ 独立可测试脚本
→ 正式能力接口
→ 后端领域能力或工作流服务
```

![Skill 与 CLI 的职责边界](https://img.alicdn.com/imgextra/i1/O1CN01lBQrfcKZ2QG2nDN2_!!6000000006181-2-tps-1376-768.png)

## 五、Domain Skill 与 Workflow Skill

### Domain Skill：围绕业务领域组织

Domain Skill 教 Agent 如何正确操作 Calendar、Task、CRM、Approval 或 Deployment 等稳定领域。它负责领域概念、身份权限、安全规则、能力路由和相邻领域边界。

Domain Skill 内也可以有多步流程。例如“预约会议室”可能需要推荐时间、查询参与人、查找会议室和创建日程。它仍然是 Domain Skill，因为这些判断属于 Calendar 领域知识。

### Workflow Skill：围绕用户目标组织

Workflow Skill 面向可重复的用户目标，往往跨越多个领域，例如每日工作摘要、新员工入职、客户流失调查或发布上线检查。

```text
Calendar Domain ── 查询当天日程 ─┐
                                 ├─→ Daily Summary Workflow
Task Domain ───── 查询未完成任务 ─┘
```

| 维度 | Domain Skill | Workflow Skill |
| --- | --- | --- |
| 组织中心 | 业务领域 | 用户目标 |
| 范围 | 通常单领域 | 经常跨领域 |
| 主要内容 | 概念、身份、安全、能力路由 | 步骤、数据流、降级、交付物 |
| 变化来源 | 能力契约和领域规则 | 业务流程和完成标准 |
| 复用方式 | 被多个目标复用 | 被具体目标触发 |

判断方法：

> 换一个用户目标后仍然成立的知识，通常属于 Domain Skill；换一套底层工具后目标仍然存在的流程，通常属于 Workflow Skill。

Workflow Skill 可以依赖 Domain Skill，但不应无条件加载多份完整领域手册。它应声明完成目标所需的最小能力契约和领域前提；只有遇到复杂领域判断时，再按需加载特定 reference。

```text
Workflow Skill
    ↓ 使用最小必要能力契约
Domain Skill / reference
    ↓
CLI / MCP Tool / SDK
```

![Domain Skill 与 Workflow Skill 对比](https://img.alicdn.com/imgextra/i3/O1CN01rCXWv5b6Z8K3daAC_!!6000000000415-2-tps-1792-1024.png)

## 六、升级、兼容性与维护

CLI 发布版本不应该与所有 Skill 版本机械绑定。真正需要判断的是：Agent-facing capability contract 是否改变。

| 接口变化 | Skill 处理 |
| --- | --- |
| 内部重构、性能优化、兼容性修复 | 不需要修改 |
| 新增无关的独立能力或可选字段 | 通常不需要修改 |
| 新增更安全或更高效的推荐路径 | 建议小范围更新 |
| 新增用户可表达的业务目标 | 增加 workflow 或 Workflow Skill |
| 修改参数、输出、错误、权限或副作用语义 | 必须更新依赖 Skill 并重新验证 |
| 同步操作改为异步，或完成条件改变 | 必须更新依赖 Skill 并重新验证 |

仅声明依赖某个二进制并不足以说明兼容性。可以声明版本范围：

```yaml
metadata:
  requires:
    bins:
      - name: my-cli
        version: ">=1.8.0 <2.0.0"
  tested_with:
    my-cli: "1.12.3"
```

更成熟的系统可以为能力契约单独版本化：

```yaml
metadata:
  contracts:
    - calendar.agenda@2
    - task.my-tasks@1
```

CLI release version 管理整体发行，command contract version 管理输入、输出和语义兼容性，Skill version 管理工作流、策略和领域知识变化。若同一能力同时提供 CLI 和 MCP Tool，最好复用领域服务与共享 Schema，避免两个适配器分别演化。

### 唯一事实来源

| 信息 | 建议的唯一事实来源 |
| --- | --- |
| 能力名、参数、类型、required | 共享能力契约或 CLI / Tool schema |
| 输出字段和默认值 | 共享输出契约和能力实现 |
| scope、身份、风险等级 | 共享能力 metadata |
| 用户意图如何路由 | Domain Skill |
| 跨领域目标如何完成 | Workflow Skill |
| 固定计算和校验 | CLI、Tool、服务或 scripts |
| 复杂背景知识 | references |

如果相同事实同时出现在代码、README、Skill 和 reference 中，长期一定会漂移。

### 三层质量门禁

```text
格式 lint
→ capability contract test
→ Skill 场景 eval
```

- 格式 lint：检查 frontmatter、description、reference 路径和 metadata。
- Contract test：检查能力、参数和输出字段存在，版本满足要求，写操作具有相应安全机制。
- 场景 eval：检查正确触发、相邻任务不误触发、能力选择、确认时机、完成条件和降级策略。

![能力演进路径：从命令片段到正式能力接口](https://img.alicdn.com/imgextra/i1/O1CN01fvAsvMfj1fI3daAC_!!6000000006445-2-tps-1792-1024.png)

Workflow 还应维护依赖清单，使接口变化时可以自动计算受影响的 Skill：

```yaml
workflow: daily-summary
depends_on:
  - capability: calendar.agenda
    contract: 2
  - capability: task.my-tasks
    contract: 1
```

## 七、常见反模式

反模式往往不是某条指令写错，而是边界、事实来源和执行契约失去唯一性。可以从四类问题识别。

### 边界反模式

**名义分层，实际复制。** Domain Skill 和 Workflow Skill 同时维护命令参数、退出码、确认规则和结果语义。接口变化后需要多处同步，最终产生冲突。能力接口应拥有输入输出契约，Domain Skill 解释领域语义，Workflow Skill 只引用最小必要契约。

**一个 Workflow Skill 包办整个领域。** 查询、写操作、报告、定时任务和外部通知的触发边界、风险与依赖不同，全部塞进一个 Skill 会形成过宽的 description。拆分依据应是用户目标、风险等级、外部依赖和完成条件，而不是命令数量。

**强制完整加载其他 Skill。** “执行前先完整读取 Domain Skill”会引入大量无关上下文和隐式依赖。Workflow 应声明最小能力契约，只有遇到复杂领域判断时再读取特定 reference。

### 契约反模式

**把 Skill 写成 CLI 手册缓存。** 一边声明 `--help` 或 schema 是权威，一边复制全部命令、flag 和输出字段，等于建立第二份事实来源。Skill 应只保留接口无法自描述的 ID 语义、风险策略、选择条件和完成标准。

**软约束重新定义硬契约。** 同一状态、退出码或错误通道在不同段落被赋予不同含义，会直接造成误报和错误恢复。底层事实必须由能力契约唯一规定；Skill 只能决定如何解释，不能重新定义。

**把未验证假设写成强制指令。** 正式契约、经验观察和推测混在一起，Agent 就无法区分“必须遵守”和“可以尝试”。应标明 `verified`、`observed` 或 `assumed`，并记录适用版本；未验证行为只能作为有边界的 fallback。

### 执行反模式

**同一 Workflow 存在多条主路径。** 两套命令、产物位置、错误处理和验收协议即使各自合理，组合后也没有唯一行为。每个 Workflow 应只有一条主路径；兼容性分支通过显式探测选择。

**把工作流程序写进自然语言。** 当 Skill 中出现大段 Shell、HTTP 调用、JSON 解析、重试和补偿，它已经在承担程序职责，却没有独立测试和版本管理。这些逻辑应下沉为脚本、CLI Shortcut 或后端工作流。

### 环境反模式

**将环境偶然性当作通用规则。** 硬编码工作目录、临时路径、Host、超时或某个 Agent 的工具行为，会破坏可移植性。环境差异应通过配置或运行时探测解决；平台专属知识应放入独立 reference，并明确适用范围。

可以用三个信号快速判断 Skill 是否开始失控：

1. 修改一个接口事实，需要同时编辑三处以上；
2. 执行一个简单目标，需要加载大部分与它无关的说明；
3. Agent 必须在多段互相竞争的指令中猜测哪一条更权威。

出现任何一个信号，都应优先收敛事实来源和主路径，再考虑继续增加规则。

## 八、检查清单与结论

设计和维护系统时，重点检查：

- [ ] 能力是否表达清晰、可测试的业务承诺？
- [ ] 输入、输出、错误和副作用是否构成稳定契约？
- [ ] CLI 或 Tool 是否支持机器发现与结构化结果？
- [ ] 权限、dry-run、确认、幂等、审计是否由程序实施？
- [ ] 长任务是否显式建模状态，而不是只返回“已提交”？
- [ ] Skill 是否只保留路由、判断、风险策略和完成条件？
- [ ] Domain Skill 与 Workflow Skill 的边界是否明确？
- [ ] Workflow 是否只依赖最小必要的能力契约？
- [ ] 接口变化能否定位并重新验证受影响的 Skill？
- [ ] 是否分别使用 contract test 和场景 eval 验证确定性与语义逻辑？

最终归纳为五条原则：

1. **CLI、MCP Tool 和 SDK 暴露能力契约，服务封装系统不变量。**
2. **Domain Skill 封装领域知识和正确用法。**
3. **Workflow Skill 封装可复用的目标解决方案。**
4. **Agent 根据上下文进行动态规划和跨域协调。**
5. **能测试的确定性逻辑向下沉，需要理解语境的判断向上留。**

![五条核心原则总结](https://img.alicdn.com/imgextra/i4/O1CN01P2snR2wXRmG3daAC_!!6000000005695-2-tps-1792-1024.png)

最重要的不是争论”CLI 还是 Skill 负责编排”，而是先问：

> 这段逻辑必须由系统可靠保证，还是应该由 Agent 根据当前目标作出判断？

这个答案，决定了它真正应该属于哪一层。
