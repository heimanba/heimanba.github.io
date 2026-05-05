---
title: 'Vibe Coding 不只是写 Prompt：二开桌面应用时我摸出来的 5 个方法'
description: '从二开 claw-switch 的真实过程出发，记录我在 Vibe Coding 桌面应用时总结出的 5 个方法，包括交互图驱动、局部控制和和 AI 协作的实际经验。'
pubDate: 'May 05 2026'
updatedDate: 'May 05 2026'
---

# Vibe Coding 不只是写 Prompt：二开桌面应用时我摸出来的 5 个方法
## 项目背景

[claw-switch](https://github.com/heimanba/claw-switch) 是基于 [cc-switch](https://github.com/farion1231/cc-switch) 二开的桌面应用。cc-switch 是一个 AI Coding 工具的供应商配置切换器（Tauri + React），我在它上面加了这些东西：

1. 重新做了 UI
2. OpenClaw 增强：安装、配置、管理、诊断
3. 新增 Qwen Code、Cline 等 Provider 支持
4. 新用户引导流程

整个项目 100% AI 生成，一行代码没手写，前后花了 5 天。

这篇文章不是教程，就是记录几个我在 Vibe Coding 过程中摸出来的方法。每个方法都有真实案例。

---

## 一、看不懂代码怎么办？用 ASCII 交互图做"ControlNet"

### 问题

第一个挑战：cc-switch 是别人的项目，我对里面的架构和细节完全没概念。

常规的 Vibe Coding 流程是让 AI 先输出执行计划（Plan），工程师 Review 后再开工。但我连代码架构都看不懂，怎么 Review 技术方案？

### 方法

社区有两个有意思的项目：
- [mockup](https://github.com/simpx/mockup.md)
- [mockdown](https://www.mockdown.design/)

特别感谢 [mockup.md](https://mockup.md)  来自 思潜作品给的灵感： The Layout Control Language for Human-AI Collaboration！🔲🔲🔲

思路一样：用 ASCII 码画交互图，让 AI Coding 更"ControlNet"。

所有模型对 ASCII 码都很熟悉。做法是：人只 Review 最终的交互效果，效果 OK 就行，其他的让 AI 自己决定。

这就绕开了一个问题：你不需要看懂代码架构，你只需要看懂交互图。

![ASCII ControlNet 框架：人把控交互设计，AI 处理代码架构](https://img.alicdn.com/imgextra/i2/O1CN01FY0O1n1vOFgVm4cyc_!!6000000006162-2-tps-2752-1536.png)

### 实际案例：添加 Qwen Code Provider

我要在应用里加一个 Qwen Code 的 Provider。给 AI 的 prompt：

```
/plan 仔细理解当前的代码结构，我需要添加一个新的 Provider：Qwen Code，
阅读鉴权文档：https://qwenlm.github.io/qwen-code-docs/en/users/configuration/auth/，
实际配置文件在 ~/.qwen/settings.json

建议 "modelProviders" 字段在 UI 直接使用 JSON 编辑即可。
UI 界面设计效果使用 ASCII 码画图表示，需要在图中标注对应的字段
```

AI 第一次输出的交互图：

```
┌─ ~/.qwen/settings.json ───────────────────────────────────────────┐
│                                                                   │
│  ● 认证方式 (selectedType)                                        │
│    [ openai ▼ ]  (openai / anthropic / gemini / vertex-ai)        │
│                                                                   │
│  ● 默认模型名称 (model.name)                                      │
│    qwen3-coder-plus                                               │
│                                                                   │
│  ● 环境配置 (env)                                                 │
│    ├─ DASHSCOPE_API_KEY : sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxx         │
│    ├─ OPENAI_API_KEY    : sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxx         │
│    └─ [ + 添加 ]                                                  │
│                                                                   │
│  ● 高级 JSON 配置 (modelProviders)                                │
│    [ 编辑 modelProviders 配置... ]                                │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
```

我看了觉得不够好，缺少对旧版配置的兼容处理。跟 AI 又聊了一轮，最终拿到了带折叠区域和废弃字段提示的完整方案：

```
┌─ ~/.qwen/settings.json ──────────────────────────────────────────────┐
│                                                                       │
│  "security" > "auth" > "selectedType"    认证协议（必填）              │
│  ┌─────────────────────────────────────────────────────────────┐      │
│  │  [ openai ▼ ]  openai / anthropic / gemini / vertex-ai     │      │
│  └─────────────────────────────────────────────────────────────┘      │
│                                                                       │
│  "model" > "name"    默认模型名称（需与 modelProviders id 匹配）        │
│  ┌─────────────────────────────────────────────────────────────┐      │
│  │  qwen3-coder-plus                                           │      │
│  └─────────────────────────────────────────────────────────────┘      │
│                                                                       │
│  "env"    API Key 存储（键 = envKey 名, 值 = API Key）                │
│  ┌─────────────────────────────────────────────────────────────┐      │
│  │  DASHSCOPE_API_KEY  │  sk-xxxxxxxxxxxxxxxxxx                │      │
│  │  + 添加             │                                       │      │
│  └─────────────────────────────────────────────────────────────┘      │
│                                                                       │
│  "modelProviders"    ← JSON 编辑器（复杂嵌套结构直接编辑）             │
│  ┌─────────────────────────────────────────────────────────────┐      │
│  │  { "openai": [{ "id": "...", "envKey": "...", ... }] }      │      │
│  └─────────────────────────────────────────────────────────────┘      │
│                                                                       │
│  ▼ 兼容旧版配置（已废弃，建议迁移到 modelProviders + env）  [可折叠]   │
│  ┄ ┄ ┄ ┄ ┄ ┄ ┄ ┄ ┄ ┄ ┄ ┄ ┄ ┄ ┄ ┄ ┄ ┄ ┄ ┄ ┄ ┄ ┄ ┄ ┄ ┄ ┄ ┄ ┄ ┄  │
│  ⚠ "security" > "auth" > "apiKey"   [deprecated since v0.10.1] │      │
│  ┌─────────────────────────────────────────────────────────────┐      │
│  │  sk-xxx（留空则不写入）                                       │      │
│  └─────────────────────────────────────────────────────────────┘      │
│  ⚠ "security" > "auth" > "baseUrl"  [deprecated since v0.10.1] │      │
│  ┌─────────────────────────────────────────────────────────────┐      │
│  │  https://...（留空则不写入）                                  │      │
│  └─────────────────────────────────────────────────────────────┘      │
└───────────────────────────────────────────────────────────────────────┘
```

确认这张图之后，AI 自动生成了完整的执行计划，Rust 后端改 4 个文件，前端改 9 个文件（详见 [spec/添加_qwen_code_provider.md](https://github.com/heimanba/claw-switch/blob/master/spec/添加_qwen_code_provider_e170b9bb.md)）。我不需要理解 `app_config.rs` 里的枚举怎么写，也不需要知道 `live.rs` 的读写策略，我只要确认交互图是我想要的就行。

### 这个方法的适用边界

适合表单类 UI、配置页面、流程引导这类需求，"交互"可以用 ASCII 完整表达。也适合你不熟悉代码架构，但清楚想要什么交互效果的场景。

不太适合复杂动画、拖拽交互、Canvas 绑定，ASCII 表达力有限。纯逻辑变更（没有 UI 的后端重构）也不太合适。

---

## 二、UI 太丑怎么办？"抄"的方法论

### 方法

一个字："抄"。找一个 UI 风格还不错的项目：https://github.com/yiliqi78/TOKENICODE ，然后告诉 AI 参考它来做 UI 升级。

大部分开源项目用 [Tailwind CSS](https://tailwindcss.com/)，AI 能直接理解和复用样式体系，出来的效果还行。

### 为什么有效

你给 AI 的不是一个模糊的"好看一点"，而是一个具体的参考坐标。AI 可以从参考项目里提取配色、间距、组件风格，然后映射到你的项目上。比你用文字描述"我想要现代感的 UI"管用得多。

### 什么时候不够用

"抄"解决的是整体风格问题。但某个具体组件的交互细节要调，就需要更精细的工具了，下一节讲。

---

## 三、小范围交互不满意？设计顾问 Skill

### 方法

[Qiaomu Design Advisor](https://github.com/joeseesun/qiaomu-design-advisor) 是一个设计顾问 Skill，走 Jobs 式产品直觉 + Rams 式功能纯粹主义的路线。它一般会推荐三套方案：小范围优化、结构调整、理想方案。

用法很简单：截图 + 一句话描述问题。

### case 1：概览页面效果不好看

prompt：`/qiaomu-design-advisor 这个效果不好看`

Before:
![](https://img.alicdn.com/imgextra/i3/O1CN01OCjhLD1w30w02ouQ2_!!6000000006251-2-tps-1828-1192.png)

After:
![](https://img.alicdn.com/imgextra/i2/O1CN01RLsvP11rkuouq1nJs_!!6000000005670-2-tps-2000-1300.png)

### case 2：渠道配置页面优化

Before:
![](https://img.alicdn.com/imgextra/i4/O1CN01zlktPV1qvcSdy9tTr_!!6000000005558-2-tps-2176-1328.png)

prompt：`/qiaomu-design-advisor 优化界面`

AI 给出了三套方案的分析：
![](https://img.alicdn.com/imgextra/i1/O1CN01LSyIA426stxm8i3Co_!!6000000007718-2-tps-1044-1210.png)

After:
![](https://img.alicdn.com/imgextra/i4/O1CN01gvFMvK285YWPYupPU_!!6000000007881-2-tps-2554-1720.png)

### "抄"和"设计顾问"怎么配合

两个解决的问题不一样。"抄"管整体风格和审美基线，让项目从"能用"到"好看"。设计顾问管局部交互和细节，从"好看"到"好用"。

我的实际流程：先用参考项目统一整体风格，再用设计顾问逐页打磨。

---

## 四、复杂 BUG 如何定位？Debug 模式的多假设验证

### 问题

有些 BUG，你反复描述现象、引导 AI 分析，它就是定位不了根因。二开项目里这种情况特别多，你对代码不熟悉，AI 对运行时状态不了解，两边都在猜。

### 方法

Cursor 的 Debug 模式就是干这个的。流程：

1. 让 AI 针对当前问题做多方面假设，在代码里加日志调试
![](https://img.alicdn.com/imgextra/i3/O1CN0170HIVO27bKNhsbufz_!!6000000007815-2-tps-902-1576.png)

2. 跑起来看日志输出，不断往不同方向验证，确认根因后修复，最后删掉 DEBUG 日志
![](https://img.alicdn.com/imgextra/i1/O1CN0177weGx1c0unvWG06B_!!6000000003539-2-tps-1216-1496.png)

### 为什么比直接让 AI 修好

直接描述 BUG 让 AI 修，它会基于"最可能的原因"直接改代码。猜对了一次搞定，猜错了就陷入"改了又改"的死循环。

Debug 模式的思路是先收集证据再下结论。日志输出让 AI 能看到实际的运行时数据，不用靠猜。

![Debug 模式流程：多假设验证，先收集证据再下结论](https://img.alicdn.com/imgextra/i2/O1CN011oPBuz1Ml8vbx7YKF_!!6000000001474-2-tps-2752-1536.png)

---

## 五、需求文档也能 Vibe？Spec 驱动的复杂功能开发

### 问题

前面四个方法解决的都是"点"上的问题。但要开发一个完整的复杂功能（比如诊断系统、新用户引导流程），光靠 prompt 对话不够，上下文会丢失，AI 会忘记之前的约定，实现会偏离设计。

### 方法

复杂功能我会先让 AI 生成一份完整的 Spec 文档，然后基于 Spec 逐步实现。Spec 不是写给人看的，是给 AI 当施工图纸用的。

### 实际案例

这个项目里有几个功能是 Spec 驱动完成的：

案例 1：OpenClaw 诊断系统（[spec/diagnostic-system.md](https://github.com/heimanba/claw-switch/blob/master/spec/diagnostic-system.md)）

15 个需求、80 多条验收标准的诊断系统。环境检查、配置验证、网关健康检查、频道状态探测、自动修复、报告生成都在里面。用对话方式开发的话，AI 不可能记住所有这些约束。

Spec 把上下文持久化了。每次让 AI 实现某个需求时，它可以回头翻 Spec，确保实现不跑偏。

案例 2：新用户引导流程（[spec/新用户引导流程设计.md](https://github.com/heimanba/claw-switch/blob/master/spec/新用户引导流程设计_64a81518.md)）

这个 Spec 结合了 ASCII 交互图和 onboarding-cro Skill 的方法论。文档里有三套 UI 方案的 ASCII 图、状态管理设计、CLI 安装服务的 API 设计、国际化文案，还有测试计划。

比较有意思的是，这个 Spec 本身也是 AI 生成的。我只给了需求方向和设计约束，AI 基于 onboarding-cro Skill 的方法论（Time-to-Value 优先、Checklist Pattern 等）自动生成了完整方案。

案例 3：Cline Provider 接入（[spec/cline-provider-integration.plan.md](https://github.com/heimanba/claw-switch/blob/master/spec/cline-provider-integration_89641fc2.plan.md)）

这个案例体现了 Spec 的另一个用处：约束边界。Cline 的配置文件 `globalState.json` 字段很多，但我们只允许 UI 改其中 10 个。Spec 里明确写了"读取-补丁-保存"策略和实现约束（禁止整文件覆盖），这样 AI 实现的时候就不会乱来。

### Spec 的写法建议

- 用 ASCII 图描述 UI 交互（前面讲过）
- 用表格列出文件改动范围（让 AI 知道该改哪些文件）
- 用"实现约束"明确写出不能做什么（比写"应该做什么"更管用）
- 复杂功能拆成 todo list，每个 todo 有明确的 status，方便增量实现

![Spec 驱动架构：Spec 作为 AI 的记忆锚点，驱动 UI、API、状态管理、测试计划](https://img.alicdn.com/imgextra/i2/O1CN01KfRsBG23lcp6uYY4t_!!6000000007296-2-tps-2752-1536.png)

---

## 这些方法的共同点

五个方法其实都在回答一个问题：人应该在哪个层面介入？

| 方法 | 人类介入的层面 | AI 负责的层面 |
|------|--------------|-------------|
| ASCII 交互图 | 交互设计 | 代码架构 + 实现 |
| "抄"参考项目 | 审美方向 | 样式迁移 + 适配 |
| 设计顾问 Skill | 选择方案 | 生成方案 + 实现 |
| Debug 模式 | 判断日志 | 假设 + 插桩 + 修复 |
| Spec 驱动 | 需求边界 | 方案设计 + 逐步实现 |

![五种方法抽象层框架：选对与 AI 对话的抽象层](https://img.alicdn.com/imgextra/i3/O1CN015Eppu71IkuGDfTMD2_!!6000000000932-2-tps-2752-1536.png)

很多关于 AI Coding 的讨论集中在"怎么写更好的 prompt"。但我这个项目做下来的感受是，prompt 写法没那么重要，选对跟 AI 对话的抽象层更管用。画一张 ASCII 图比描述"我想要什么交互"有效，指一个参考项目比说"好看一点"有效，写一份 Spec 约束比逐行 Review 代码有效。

说到底，Vibe Coding 里代码是中间产物，你在什么层面表达意图，决定了 AI 能帮你多少。
