---
title: 'Open Design：Claude Design 的开源实现'
description: 'Open Design 可以理解为 Claude Design by Anthropic Labs 的开源实现和开放替代，沿着 artifact-first 工作流把执行层扩展为用户本机已有的各类 code agent。'
pubDate: 'May 05 2026'
---

> [Open Design](https://github.com/nexu-io/open-design) 可以理解为 [Claude Design by Anthropic Labs](https://www.anthropic.com/news/claude-design-anthropic-labs) 的开源实现和开放替代。Claude Design 把 Claude 变成一个可以协作生成 designs、prototypes、slides、one-pagers 的视觉创作产品；Open Design 则沿着这条 artifact-first 工作流继续展开，把执行层从单一 Claude 产品扩展为用户本机已有的 Claude Code、Codex、Cursor Agent、Gemini CLI、OpenCode、Qoder 等 code agent。

<video width="100%" height="560" controls="controls" src="//cloud.video.taobao.com/vod/osl1mfR5p3GmyhGk5amToQyVJkJdTDUaV5KQTab-2lI.mp4"></video>

## 项目背景：Claude Design 之后

Anthropic 在 2026 年 4 月 17 日发布 Claude Design：它可以从一句需求开始生成 polished visual work，并支持通过对话、inline comments、direct edits、custom sliders 继续细调；也可以接入团队 design system，导出到 Canva、PDF、PPTX、standalone HTML，甚至把设计打包 handoff 给 Claude Code。

说白了，Claude Design 做的不是工具升级，而是角色转变：LLM 不再只是写方案，而是直接参与设计产物的生成、预览、修改和交付。

Open Design 站在这个背景下出现。它不是 Anthropic 官方产品的一部分，而是一个开源项目：用本地 daemon、可替换 code agent、Skill 和 Design System，把 Claude Design 式工作流拆成可以自己运行、自己扩展的工程实现。

过去两年，AI 设计工具已经证明了一件事：大模型确实能快速生成页面、海报、PPT、移动端界面和运营素材。但真正用起来时，问题也很明显。

第一，很多工具是云端闭源的。模型、提示词、技能、品牌资产和运行环境都被封在产品里，用户很难自托管，也很难知道产物是怎样被生成出来的。

第二，很多工具只能做一次性 demo。第一版出来很快，但后续要让它更像一个真实作品，往往要用自然语言反复解释：“不是整个 hero，是左上角那行标题”“这几张卡片一起收紧一点”“这个图表和旁边指标的层级不对”。沟通成本很高。

第三，生成质量太依赖模型临场发挥。没有品牌规范时，模型很容易掉进熟悉的 AI 套路：紫蓝渐变、大圆角卡片、泛泛的 SaaS 文案、没有来源的增长数字、随手放的 emoji icon。

Open Design 采用的路线不是“再训练一个更懂设计的模型”，而是换一种架构：以 Claude Design 为产品参照，把本地 code agent 变成执行者，让 Open Design 负责工作流、上下文、界面和质量约束。

换句话说：Claude Design 是 Anthropic 官方的闭源研究预览产品；Open Design 是社区语境下的一条开源实现路径。

## 运行链路

Open Design 的核心链路画出来大概是这样的：

```text
用户输入设计需求
  │
  ▼
Open Design Web UI
  │  选择 agent / skill / design system，展示表单、Todo、预览和评论
  ▼
Open Design Daemon
  │  探测 CLI、拼装 prompt、stage skill、spawn agent、归一化 stream
  ▼
本地 Code Agent CLI
  │  Claude Code / Codex / Cursor Agent / OpenCode / Qoder / Gemini ...
  ▼
真实项目目录
  │  读写 HTML、CSS、图片、deck、artifact、brand-spec、导出文件
  ▼
Sandboxed Preview
```

这条链路里最重要的角色是本地 daemon。浏览器不能直接启动本机 CLI，也不应该直接访问磁盘；daemon 则可以站在浏览器和本地系统之间，成为安全边界和适配层。

Open Design 不会自己去重写 Claude Code 或 Codex 的 agent loop。这些工具本来就会读文件、写文件、跑命令、理解项目、管理用户自己的登录态和 API key，Open Design 直接用就行了。Open Design 做的是把这些能力串起来，搭一个"设计执行层"，再复现 Claude Design 那种协作式 artifact 工作流。

![入口界面](https://img.alicdn.com/imgextra/i4/O1CN01uDnZfs1FTYQ1MS0Bj_!!6000000000488-0-tps-1024-548.jpg)

## 本地 Agent Daemon：统一不同 CLI 的执行世界

不同 code agent CLI 的差异很大。Claude Code、Codex、Cursor Agent、OpenCode、Qoder、Gemini CLI 的参数、权限策略、输出格式、模型选择方式、工作目录规则都不一样。

这一层的核心架构参考来自 [Multica](https://github.com/multica-ai/multica)。Multica 把自己定位为 open-source managed agents platform：本地 daemon 在用户机器上运行，自动探测 `claude`、`codex`、`opencode`、`gemini`、`cursor-agent` 等 CLI，把这台机器注册成可以执行 agent task 的 Runtime，并把任务分配、进度追踪和状态上报做成平台能力。

Open Design 借用了这个思路，但场景从“团队任务调度”换成了“设计 artifact 生成与修改”。也就是说，Multica 关心的是把 coding agents 变成可以领取 issue 的 teammate；Open Design 关心的是把同一类本地 agent runtime 变成 Claude Design 式创作流的执行层。

Open Design 在 `apps/daemon/src/agents.ts` 里把每个 agent 定义成 adapter。一个 adapter 会声明：

- 二进制名和版本探测方式；
- 默认模型和 reasoning 选项；
- 如何构造启动参数；
- prompt 通过 stdin 还是 argv 传入；
- stdout 应该按 plain text、JSONL、stream-json、ACP JSON-RPC 等哪种格式解析；
- 需要注入哪些环境变量。

这样一来，支持一个新 agent 不需要重写产品主流程，而是补一条 adapter 规则。向下，每个 CLI 可以保留自己的运行方式；向上，Web UI 只看到统一的 agent 列表、统一的 run lifecycle 和统一的流式事件。

以 Qoder CLI 为例（[PR #626](https://github.com/nexu-io/open-design/pull/626)），我按照现有 adapter 模式给 Open Design 接入了 Qoder。整个过程只需要定义几件事：二进制名 `qodercli`，版本探测走 `qodercli --version`，prompt 通过 stdin 传入（`promptViaStdin: true`），输出流按 `qoder-stream-json` 格式逐行解析 JSONL（text_delta、thinking_start、usage 等事件），skill 和 design-system 目录通过 `--add-dir` 注入，图片附件通过 `--attachment` 传递绝对路径，无头运行使用 `--permission-mode bypass_permissions` 跳过审批提示。整个 adapter 加上流解析器和测试大约 230 行代码，不需要动产品主流程的任何一行。作为这个 PR 的作者，我的体感是 adapter 架构确实做到了它声称的事：接入一个新 agent 只是补一条规则，不是开一个新分支。

一次本地运行大致会经历这些步骤：

```text
POST /api/runs
  │
  ├─ 校验 agent / model / reasoning
  ├─ 找到 projectId 对应的工作目录
  ├─ stage 当前 skill 到项目目录
  ├─ 拼装系统 prompt、DESIGN.md、SKILL.md、历史消息和附件
  ├─ resolve agent binary
  ├─ spawn CLI，cwd 指向当前项目目录
  └─ 把 stdout / stderr / tool events 转成统一 SSE
```

不管底层跑的是 Claude Code、Codex、Cursor Agent 还是 Qoder，用户看到的体验是一致的：聊天面板流式更新，Todo 卡片实时变化，最终 `<artifact>` 进入预览 iframe。

## BYOK：Key 留在用户自己的边界里

Open Design 的 BYOK 不是单一入口，而是三条互补路径。

第一条是默认的本地 CLI 路径。Open Design 扫描并启动本机已有的 code agent CLI，这些 CLI 自己管理登录态、OAuth 或 API key。Open Design 编排它们，但不托管用户的云账号和 key。

第二条是 API fallback。没有安装本地 CLI，或者用户想直接填 provider endpoint 时，可以切到 API mode。Anthropic、OpenAI-compatible、Azure OpenAI、Google Gemini 等请求会经由浏览器配置和 daemon proxy 进入统一 SSE 流。普通 chat key 保存在浏览器 localStorage；daemon proxy 会校验 `baseUrl`，阻止 link-local 和大多数私网地址，同时允许 localhost 以支持本地模型服务。

第三条是 Media BYOK。图像、视频、音频生成 provider 的 key 保存在本机 daemon 的 `.od/media-config.json`，也可以用环境变量覆盖。Open Design 只做本地配置和调用编排，不做中心化 key 托管。

三条路径指向同一个目的：设计工作流可以开放、可替换、可本地化，而不是被锁在某一家模型或云端账号体系里。

## 先提问，再生成：把模糊需求变成设计 brief

Open Design 比较不一样的一点是：新设计任务第一轮不急着生成代码，而是要求 agent 先输出结构化的 `<question-form>`。

这部分设计和审美方法的重要参考是 [huashu-design](https://github.com/alchaincyf/huashu-design)。huashu-design 是一个面向 Claude Code 等 agent 的 HTML-native design skill，强调 Junior Designer Workflow：不要追求一次性神来之笔，而是先批量问清问题、尽早展示可见雏形，再通过品牌资产、视觉方向、Tweaks 和评审逐步收敛。

![结构化提问](https://img.alicdn.com/imgextra/i4/O1CN01GcRei41TCyhmFReyC_!!6000000002347-0-tps-1024-548.jpg)

这个表单通常会锁定：

- 要做什么：网页原型、移动端原型、dashboard、deck、营销页；
- 面向谁：投资人、客户、开发者、内部团队、学生；
- 视觉语气：editorial、minimal、playful、utility、luxury、brutalist、warm；
- 品牌上下文：让 agent 选方向、使用用户提供的品牌规范、匹配参考网站或截图；
- 规模：几页 slide、几个页面、几屏 mobile；
- 约束：字体、素材、禁忌、deadline、必须包含的信息。

这一步其实在解决一个常见的问题：用户第一句话通常不完整，模型如果太早开始画图，就会拿自己的默认审美去填那些缺掉的信息。Open Design 把这些不确定性提前压缩成 30 秒的表单选择。

## Direction Picker：不让模型自由发明审美

如果用户没有现成品牌，Open Design 会进入第二层分叉：视觉方向选择。

![视觉方向选择](https://img.alicdn.com/imgextra/i3/O1CN01Qh6A4u1DEmPWtcVRQ_!!6000000000185-0-tps-1024-548.jpg)

系统内置了 5 套方向，例如 Editorial Monocle、Modern Minimal、Warm Soft、Tech Utility、Brutalist Experimental。每个方向不是一句风格描述，而是一套可直接绑定到 CSS 的设计参数：字体、OKLch 色板、强调色预算、边框姿态、圆角策略和布局节奏。

这里也能看到 huashu-design 的影响。huashu-design 在 README 中提到用“5 schools × 20 philosophies”处理模糊 brief，并通过差异化方向、代表作品、设计关键词和 demo 让用户选择。Open Design 把这个思路产品化成 direction picker：它不是一个独立的 `skills/*/SKILL.md`，而是 discovery prompt 的第二轮 `<question-form id="direction">`，由 `direction-cards` 问题类型渲染成卡片。具体方向库在 `apps/daemon/src/prompts/directions.ts`，从 huashu-design 的设计哲学压缩出 5 个内置方向，每个方向都带 palette、font stack、references 和 layout posture。

如果用户选择“我有品牌规范”或“匹配参考网站”，agent 则会先抽取真实品牌资产，写出 `brand-spec.md`，再开始生成。

所以 Open Design 处理审美的思路是：

```text
没有品牌
  → 选择确定的视觉方向
  → 绑定 deterministic palette + font stack

有品牌 / 有参考
  → 抽取真实品牌资产
  → 写 brand-spec.md
  → 绑定真实品牌 token
```

它不是让模型少发挥，而是把发挥空间放进清楚的设计边界里。

## Skill 和 DESIGN.md：把提示词变成可维护的项目资产

Open Design 内置多类 Skill：[web prototype](https://github.com/nexu-io/open-design/tree/main/skills/web-prototype)、[mobile app](https://github.com/nexu-io/open-design/tree/main/skills/mobile-app)、[dashboard](https://github.com/nexu-io/open-design/tree/main/skills/dashboard)、[deck](https://github.com/nexu-io/open-design/tree/main/skills/guizang-ppt)、[social carousel](https://github.com/nexu-io/open-design/tree/main/skills/social-carousel)、[magazine poster](https://github.com/nexu-io/open-design/tree/main/skills/magazine-poster)、[email marketing](https://github.com/nexu-io/open-design/tree/main/skills/email-marketing)、[finance report](https://github.com/nexu-io/open-design/tree/main/skills/finance-report)、[PM spec](https://github.com/nexu-io/open-design/tree/main/skills/pm-spec) 等。每个 Skill 都是一个文件夹，至少包含 `SKILL.md`，通常还包含 `assets/template.html`、`references/layouts.md`、`references/checklist.md` 等辅助资料。

Skill 这一层不是 Open Design 自己发明的新格式，而是采用了 [Claude Code Skills](https://docs.anthropic.com/en/docs/claude-code/skills) 的 `SKILL.md` 约定，再叠加 Open Design 自己的 `od:` frontmatter。这样做的好处是：一个 skill 仍然是普通文件夹，可以被复制、fork、版本化，也可以被 daemon 扫描后直接放进 picker。

这里也有几个明确的外部来源。Deck 模式里的 `guizang-ppt` 来自 [op7418/guizang-ppt-skill](https://github.com/op7418/guizang-ppt-skill)，Open Design 把它作为 magazine-style web PPT 的默认 deck skill 接入，并保留原始 LICENSE 和作者归属。部分 taste 系 skill 还从 [Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill) 蒸馏出 editorial、soft、brutalist 等审美规则，作为更窄的风格入口。

Skill 决定产物类型的专业规则。例如 mobile app skill 会要求使用真实设备 frame、状态栏、Dynamic Island、home indicator 和合理触控尺寸；deck skill 会要求 1920×1080 canvas、键盘导航、speaker notes 和导出友好结构；web prototype skill 会要求 section rhythm、responsive reflow 和可评论的 `data-od-id`。

![移动端原型](https://img.alicdn.com/imgextra/i4/O1CN01NlnQUW1ksyUSacntH_!!6000000004740-0-tps-1024-548.jpg)

与 Skill 并列的是 Design System。Open Design 把品牌系统写成 `DESIGN.md`，里面包含颜色、字体、组件、布局、动效、voice、禁忌和 agent prompt guide。同一个项目可以在 web、mobile、deck、dashboard 等不同 Skill 之间复用同一份设计系统。

`DESIGN.md` 这层同样有外部来源。9 段式 schema 主要来自 [VoltAgent/awesome-design-md](https://github.com/VoltAgent/awesome-design-md) 和 [VoltAgent/awesome-claude-design](https://github.com/VoltAgent/awesome-claude-design)：color、typography、spacing、layout、components、motion、voice、brand、anti-patterns。Open Design 通过 `scripts/sync-design-systems.ts` 导入产品系统，例如 Linear、Stripe、Vercel、Airbnb、Tesla、Notion、Apple、Anthropic、Cursor、Supabase、Figma、小红书等；另外还把 [bergside/awesome-design-skills](https://github.com/bergside/awesome-design-skills) 里的设计技能归一化为 `DESIGN.md` 放进 `design-systems/`。

可以这样理解三层关系：

```text
skills/
  规定产物形态：网页、移动端、PPT、dashboard、文档

design-systems/
  规定品牌语言：颜色、字体、组件、布局姿态

craft/
  规定通用专业性：排版、用色、动效、可访问性、反 AI 套路
```

这样一来，Open Design 的提示词栈就不再是一坨没法维护的长文本，而是变成了一组可以版本化、可以复用、可以被 review 的项目文件。

## TodoWrite：让生成过程变成可见账本

方向和品牌锁定后，Open Design 要求 agent 的第一个工具动作是 `TodoWrite`。用户不再只能盯着 streaming 文本猜模型在干什么，而是看到一个实时更新的执行计划。

![实时 Todo](https://img.alicdn.com/imgextra/i3/O1CN01qBKtA91ZPhOs4HomN_!!6000000003187-0-tps-1024-548.jpg)

一个典型计划可能包括：读取 DESIGN.md、绑定视觉 token、规划页面区块、复制 seed template、替换真实文案、跑 checklist、做五维自省、最后输出单个 `<artifact>`。

Todo 状态会从 `pending` 到 `in_progress` 再到 `completed`。如果生成中断，Open Design 还能根据未完成 Todo 构造继续执行的 follow-up prompt，让下一轮不要重做已完成工作，只继续剩余任务。

这也是 Open Design 能走出"一次生成"的关键：它保存 conversation、run events、Todo 状态和真实项目文件，支持恢复、续跑和多轮 refinement。

## Artifact Preview：产物不是聊天文本，而是真文件

Open Design 要求最终输出是单个 `<artifact>` block。前端解析后会把它保存成项目文件，并放进 sandboxed iframe 里渲染。

![预览 iframe](https://img.alicdn.com/imgextra/i1/O1CN01G5TLGk1vbXBKnQYEx_!!6000000006191-0-tps-1024-547.jpg)

这件事很关键。用户看到的不是一段贴在聊天里的 HTML，而是一个可以打开、预览、导出、继续评论修改的作品。后续 agent 也不是凭记忆修改聊天文本，而是在真实项目目录里读写文件。

这让 Open Design 更像一个设计工作台，而不是聊天机器人。

## Tweaks、Picker 和 Pods：从“描述修改”到“指向修改”

生成第一版之后，后续打磨往往会遇到指代问题。Open Design 的 Tweaks mode、Picker 和 Pods 就是在处理这一段工作流。

1. 打开 tweak 模式，可以 picker 选择某个元素进行评论、或者直接发送给 code agent 开始编辑，Open Design 会识别整个元素地址，精准让 claude code、codex 进行编辑，减少大量 token
![](https://img.alicdn.com/imgextra/i1/O1CN01qSaQWL1iTfNBY33kv_!!6000000004414-0-tps-3024-1896.jpg)


2. 在 pods 模式下，可以直接圈选元素，所有元素都会被选中，可以做批量元素的评论或者 code agent 编辑
![](https://img.alicdn.com/imgextra/i4/O1CN01MUkPYw1M3dJTiSeY1_!!6000000001379-0-tps-3024-1896.jpg)

3. 所有的评论可以进入待运行列表，方便随时记录修改，然后 pipeline 的运行，进行批量修改 大大提高从一次性 demo 向完整作品演进的效率
![](https://img.alicdn.com/imgextra/i3/O1CN01irtbat1mzVMwubJc7_!!6000000005025-0-tps-3024-1896.jpg)

在预览画布里，用户可以直接点选一个元素。iframe 内部的 comment bridge 会把视觉点击转换成结构化 DOM 地址：

```text
elementId
selector
label
currentText
position
htmlHint
```

如果元素有 `data-od-id`，selector 可以稳定到：

```text
[data-od-id="hero-title"]
```

这样用户说“把这个标题短一点”时，agent 收到的不只是自然语言，还会收到文件、selector、当前文本、位置和 opening tag 提示。

Pods 则处理区域级反馈。用户在画布上圈选一组元素，Open Design 会把手绘路径和 DOM target cache 做几何命中，生成一组 pod members。agent 收到的是一组结构化 selector，而不是一张截图或一句模糊描述。

这套机制把人类视觉意图翻译成 code agent 能执行的修改上下文：

```text
人类反馈：
  “这里太挤了”
  “这几块一起改”
  “这个标题短一点”

结构化上下文：
  file
  selector
  elementId
  currentText
  htmlHint
  podMembers
  ordered comments
```

它让 Open Design 从“生成 demo”向“持续打磨作品”迈了一步。

## 质量门禁：生成痕迹、Checklist 和五维评审

Open Design 没把设计质量全交给模型自己把关。它把质量约束拆成几层。

这套质量观有两条来源。设计评审和审美收敛可以追溯到 huashu-design，它强调 Core Asset Protocol 和 5-dimension expert critique，用品牌资产、设计哲学、视觉层级、执行细节和可交付性去约束 agent 输出。具体到 `anti-ai-slop`，它不是来自某个 `skills/*` 目录下的 Skill，而是 `craft/anti-ai-slop.md` 这条全局 craft rule；文件头注明它改编自 [refero_skill](https://github.com/referodesign/refero_skill)（MIT），再被 Open Design 收紧到自己的 lint surface。

第一层是 `craft/anti-ai-slop.md`。这里把常见生成痕迹列成可检查规则，例如默认紫蓝渐变、emoji icon、假指标、占位文案、模板式 Hero → Features → Pricing → FAQ、无意义 blob 背景等。它通过各个 Skill 的 `od.craft.requires` 选择性注入，例如 `saas-landing` 会声明 `requires: [typography, color, anti-ai-slop]`。

第二层是 Skill 自带 checklist。很多 Skill 都有 P0/P1/P2 交付条件，P0 失败就必须先修。

第三层是五维 critique：Philosophy、Hierarchy、Execution、Specificity、Restraint。它要求 agent 在交付前主动检查视觉立场、层级、执行细节、内容具体性和克制程度。

更进一步，项目里还有 Design Jury 协议，把 Designer、Critic、Brand、A11y、Copy 等角色变成可流式记录、可评分、可收敛的评审过程。这其实是 Open Design 的一个关键方向：设计反馈不再只是"再高级一点"，而是可以被协议化、记录、回放和修正。

## 开放实现带来的变化

Claude Design 定义了"和 Claude 一起做视觉作品"这件事该怎么做，Open Design 则把这套做法拆开，变成一个可以自行搭建的开放工程。

Open Design 不只是“支持很多模型”或“能生成很多页面”。从项目结构看，它呈现的是一种开放式 Claude Design 实现路径：

- 本地优先：代码、key、CLI 登录态、项目文件尽量留在用户机器上；
- Agent 可替换：Claude Code、Codex、Cursor、OpenCode、Qoder 等都可以成为设计引擎；
- Skill 可扩展：新增一个产物类型就是新增一个文件夹；
- Design System 可复用：品牌不再只是聊天上下文，而是可版本化的 `DESIGN.md`；
- 过程可见：Todo、tool events、stream 和 run 状态都能被 UI 观察；
- 修改可寻址：Picker 和 Pods 把视觉反馈转成 DOM selector 和局部上下文；
- 质量可检查：anti-slop、checklist、critique 把审美要求变成工程化门禁。

这也是它和普通 AI 网页生成工具的区别。Open Design 复刻的不是"生成一个好看页面"这种表面结果，而是 Claude Design 真正重要的 artifact-first creative flow：先问清楚，再选方向，再读 Skill 和 Design System，再计划执行，再预览，再标注修改，再检查质量。

## 最终定位

拆开来看，Open Design 把 Claude Design 的架构做了重新组合：上层是开放的设计工作台，下层不是单一模型，而是用户机器上已有的 code agent。它没有试图取代 Claude Code、Codex、Cursor Agent、OpenCode 这些工具，而是把它们接进同一个本地设计工作台。

向上，它给用户一个统一的创作界面：选择 skill、选择设计系统、回答问题、看 Todo、预览 artifact、标注反馈。

向下，它给每个 agent 保留自己的运行方式：自己的登录态、自己的 CLI 参数、自己的工具调用协议、自己的输出格式。

中间的 daemon、Skill、DESIGN.md、question form、TodoWrite、Preview Comment 和 critique 协议，把这些环节串在一起，把"AI 生成一个页面"变成了"AI 参与一个可持续的设计工作流"。

总的来说，Open Design 就是：Claude Design 的开源实现，一个开放、本地优先、可扩展的 AI 设计工作台。它不是把设计交给一个黑盒模型，而是把用户已有的 agent、品牌资产、项目文件和设计反馈组织成一条可以持续工作的创作流水线。

## 附录：关键代码索引

如果想从代码层面理解 Open Design 如何实现 Claude Design 式工作流，可以重点看这些文件。

- 本地 agent 适配层在 [`apps/daemon/src/agents.ts`](https://github.com/nexu-io/open-design/blob/main/apps/daemon/src/agents.ts)。这里定义 `AGENT_DEFS`、`detectAgents()` 和不同 CLI 的 `buildArgs`、stdin、stream parser、model fallback，是 Claude Code、Codex、Cursor Agent、OpenCode、Qoder 等统一到同一个 daemon runtime 的核心。
- Daemon/runtime 这层的架构参考可以对照 [multica-ai/multica](https://github.com/multica-ai/multica)。Multica 的 README 里把本地 daemon 描述为自动探测 agent CLIs、把机器注册为 Runtime、再执行 agent tasks 的基础设施；Open Design 则把这个模型收敛到本地设计项目和 artifact 生成场景。
- daemon run 与 SSE 入口主要在 [`apps/daemon/src/server.ts`](https://github.com/nexu-io/open-design/blob/main/apps/daemon/src/server.ts) 和 [`apps/web/src/providers/daemon.ts`](https://github.com/nexu-io/open-design/blob/main/apps/web/src/providers/daemon.ts)。前者创建 run、spawn agent、暴露 `/api/runs/:id/events`；后者是 Web 端的 `streamViaDaemon()`，负责把 daemon 事件接回聊天、工具卡和 artifact UI。
- 设计工作流和审美方法的重要参考是 [alchaincyf/huashu-design](https://github.com/alchaincyf/huashu-design)。其中 Junior Designer Workflow、Core Asset Protocol、5 schools × 20 philosophies 和 5-dimension critique，对应到 Open Design 里主要落在 [`apps/daemon/src/prompts/discovery.ts`](https://github.com/nexu-io/open-design/blob/main/apps/daemon/src/prompts/discovery.ts)、[`apps/daemon/src/prompts/directions.ts`](https://github.com/nexu-io/open-design/blob/main/apps/daemon/src/prompts/directions.ts) 和 critique 相关实现。Direction Picker 本身不是 skill，而是 `discovery.ts` 触发的 `direction-cards` 表单；前端渲染在 [`apps/web/src/components/QuestionForm.tsx`](https://github.com/nexu-io/open-design/blob/main/apps/web/src/components/QuestionForm.tsx)，表单结构解析在 [`apps/web/src/artifacts/question-form.ts`](https://github.com/nexu-io/open-design/blob/main/apps/web/src/artifacts/question-form.ts)。
- `anti-ai-slop` 不是某个 Skill，而是 [`craft/anti-ai-slop.md`](https://github.com/nexu-io/open-design/blob/main/craft/anti-ai-slop.md) 这条 craft rule，文件头注明 adapted from [refero_skill](https://github.com/referodesign/refero_skill)（MIT）。它由 Skill 的 `od.craft.requires` 选择性注入，加载逻辑在 [`apps/daemon/src/craft.ts`](https://github.com/nexu-io/open-design/blob/main/apps/daemon/src/craft.ts)，自动检查逻辑在 [`apps/daemon/src/lint-artifact.ts`](https://github.com/nexu-io/open-design/blob/main/apps/daemon/src/lint-artifact.ts)。
- Claude Design 式提问协议在 [`apps/daemon/src/prompts/discovery.ts`](https://github.com/nexu-io/open-design/blob/main/apps/daemon/src/prompts/discovery.ts)。这里写死了新任务第一轮必须输出 `<question-form>`、品牌分支、direction picker、TodoWrite 计划和后续自查规则。
- 系统 prompt 拼装在 [`apps/daemon/src/prompts/system.ts`](https://github.com/nexu-io/open-design/blob/main/apps/daemon/src/prompts/system.ts)，视觉方向 token 在 [`apps/daemon/src/prompts/directions.ts`](https://github.com/nexu-io/open-design/blob/main/apps/daemon/src/prompts/directions.ts)。这两处决定了 `DISCOVERY + DESIGN.md + SKILL.md + craft rules + 项目上下文` 如何组成最终交给 agent 的工作协议。
- `<question-form>` 的前端解析在 [`apps/web/src/artifacts/question-form.ts`](https://github.com/nexu-io/open-design/blob/main/apps/web/src/artifacts/question-form.ts)。它把 agent 输出的结构化 JSON block 变成用户可点击、可提交的表单。
- Skill 目录解析和 seed 组装在 [`apps/daemon/src/skills.ts`](https://github.com/nexu-io/open-design/blob/main/apps/daemon/src/skills.ts)，协议说明在 [`docs/skills-protocol.md`](https://github.com/nexu-io/open-design/blob/main/docs/skills-protocol.md)。这里采用 Claude Code 的 `SKILL.md` 约定，并兼容外部 skill，例如 [`skills/guizang-ppt/`](https://github.com/nexu-io/open-design/blob/main/skills/guizang-ppt/) 对应 [op7418/guizang-ppt-skill](https://github.com/op7418/guizang-ppt-skill)，taste 系 skill 对应 [Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill) 的风格规则蒸馏。
- Design System 解析和展示在 [`apps/daemon/src/design-systems.ts`](https://github.com/nexu-io/open-design/blob/main/apps/daemon/src/design-systems.ts) 与 [`apps/daemon/src/design-system-showcase.ts`](https://github.com/nexu-io/open-design/blob/main/apps/daemon/src/design-system-showcase.ts)。产品系统同步脚本是 [`scripts/sync-design-systems.ts`](https://github.com/nexu-io/open-design/blob/main/scripts/sync-design-systems.ts)，来源包括 [VoltAgent/awesome-design-md](https://github.com/VoltAgent/awesome-design-md)、[VoltAgent/awesome-claude-design](https://github.com/VoltAgent/awesome-claude-design) 和 [bergside/awesome-design-skills](https://github.com/bergside/awesome-design-skills)。
- BYOK 配置入口在 [`apps/web/src/state/config.ts`](https://github.com/nexu-io/open-design/blob/main/apps/web/src/state/config.ts)，API provider 请求路由在 [`apps/web/src/providers/anthropic.ts`](https://github.com/nexu-io/open-design/blob/main/apps/web/src/providers/anthropic.ts)，媒体 provider 本地配置在 [`apps/daemon/src/media-config.ts`](https://github.com/nexu-io/open-design/blob/main/apps/daemon/src/media-config.ts)。这三处对应本地 CLI BYOK、API fallback BYOK 和 Media BYOK。
- TodoWrite 解析和渲染入口在 [`apps/web/src/runtime/todos.ts`](https://github.com/nexu-io/open-design/blob/main/apps/web/src/runtime/todos.ts) 与 [`apps/web/src/components/ToolCard.tsx`](https://github.com/nexu-io/open-design/blob/main/apps/web/src/components/ToolCard.tsx)。它们把 agent 的计划工具调用变成用户看到的实时 Todo 卡片。
- Preview comment、Picker 和 Pods 的数据结构在 [`packages/contracts/src/api/comments.ts`](https://github.com/nexu-io/open-design/blob/main/packages/contracts/src/api/comments.ts)，前端附件构造在 [`apps/web/src/comments.ts`](https://github.com/nexu-io/open-design/blob/main/apps/web/src/comments.ts)，画布交互主要落在 [`apps/web/src/components/FileViewer.tsx`](https://github.com/nexu-io/open-design/blob/main/apps/web/src/components/FileViewer.tsx)。这些代码把用户在预览里的点击、圈选和批量 notes 转成带 selector、text、rect、htmlHint、podMembers 的 agent attachment。
- Anti-slop 检查在 [`apps/daemon/src/lint-artifact.ts`](https://github.com/nexu-io/open-design/blob/main/apps/daemon/src/lint-artifact.ts)，服务端调用点在 [`apps/daemon/src/server.ts`](https://github.com/nexu-io/open-design/blob/main/apps/daemon/src/server.ts)。它把常见生成问题拆成 P0/P1/P2 finding，供 UI 和下一轮 agent 修正。
- Design Jury / critique 协议类型在 [`packages/contracts/src/critique.ts`](https://github.com/nexu-io/open-design/blob/main/packages/contracts/src/critique.ts)，daemon 编排和评分在 [`apps/daemon/src/critique/orchestrator.ts`](https://github.com/nexu-io/open-design/blob/main/apps/daemon/src/critique/orchestrator.ts) 与 [`apps/daemon/src/critique/scoreboard.ts`](https://github.com/nexu-io/open-design/blob/main/apps/daemon/src/critique/scoreboard.ts)。这部分把设计评审变成可流式记录、可打分、可决定是否 ship 的协议。
