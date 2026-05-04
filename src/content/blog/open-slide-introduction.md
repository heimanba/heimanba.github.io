---
title: 'open-slide：一个为 Agent 准备的幻灯片框架'
description: '从生成第一版到持续迭代，open-slide 把适合 agent 的 slides 工作流真正做成了一个可修改、可协作的框架。'
pubDate: 'May 04 2026'
---

最近在看一个挺有意思的项目：`open-slide`。

开源地址：<https://github.com/1weiho/open-slide>

官方 Demo：<https://demo.open-slide.dev/>

我的实践项目：<https://github.com/heimanba/open-slide-example>

<video width="100%" height="560" controls="controls" src="https://cloud.video.taobao.com/vod/HHHsxzfD425Xi_rq8ZnhPqsCHtNx3n1RM8_1IiTv5uM.mp4"></video>

它的定位很直接，首页第一句话就是：

> The slide framework built for agents

我觉得这句定位抓得挺准：它默认使用者不只是人，还有 agent。`open-slide` 处理的也不是“再做一个演示文稿框架”这么宽的问题，而是更具体地问：当我们已经习惯让 agent 写代码、改页面、搭原型之后，怎么让它也能稳定地产出一套“真的能拿去讲”的 slides。

现在很多 AI 做 PPT 的产品，强项是“先生成一版内容”。但 slides 这件事麻烦的地方，往往不在第一版，而在后面的来回修改：版式不对、字太多、配色不稳、素材要换、某一页要重排。`open-slide` 有意思的地方，在于它不是只做生成，而是把整套迭代过程也设计进去了。

## 它和常见 AI PPT 产品有什么不同

很多 AI PPT 产品擅长的是开头那一步：你给一个主题，它先帮你生成一版结构、文案和视觉风格都还不错的演示稿。这个过程很高效，尤其适合快速起草、做汇报初稿，或者需要在很短时间里拼出一个能看的 deck。

但它们通常把重点放在“先生成第一版”。一旦你开始认真打磨，就会进入另一种工作状态：某一页层级不对、某段话太长、这页图表要换、品牌色不统一、动效太花、结尾想完全重做。这个阶段的难点，已经不是“有没有一版”，而是“能不能稳定地改下去”。

`open-slide` 切的就是后面这半段。

它当然也支持 agent 先生成第一版，但它更在意的是：第一版出来之后，怎么继续迭代，怎么把视觉反馈回写成源码任务，怎么让 agent 在一个受约束的工作区里持续修改，而不是每改一次都像重新生成一遍。

所以这两类工具并不是谁替代谁，而是优化目标不一样。常见 AI PPT 更像“生成器”，目标是更快得到一版像样的成品；`open-slide` 更像“给 agent 用的 slides 工作框架”，目标是让 deck 像代码项目一样可迭代、可修改、可协作。

![](https://img.alicdn.com/imgextra/i3/O1CN010EB9BJ1rBBwDMLeDk_!!6000000005592-2-tps-2516-1526.png)

这也解释了为什么 `open-slide` 没有再设计一层新的 slides DSL，而是直接让每一页就是一个 React 组件。对 agent 来说，少一层抽象，通常就少一层出错空间；对人来说，也更容易把“这里要改什么”准确地交还给 agent。

## 为什么它叫 “The slide framework built for agents”

`open-slide` 这句定位不是停在文案层面，项目里确实做了不少配套设计。

首先，它生成的不是一个普通前端项目，而是一个带约束的 slide workspace。工作区里会有 `AGENTS.md`、`CLAUDE.md`，还有几组预置的 skills，比如：

- `/create-slide`
- `/slide-authoring`
- `/apply-comments`
- `/create-theme`

这些文件不是摆设。它们的作用是把“agent 应该怎么在这个项目里工作”写清楚，比如 slides 应该放在哪个目录、入口文件叫什么、不要碰哪些配置、不要随便加依赖。换句话说，`open-slide` 不只是提供运行时，也顺手把 agent 的工作边界框了出来。

这个边界对 agent 很有用。很多时候它不是写不出来，而是自由度太大，容易改过头。`open-slide` 的做法，是主动把范围缩小：你就写 `slides/<id>/index.tsx`，资源放在 `assets/`，别乱碰别的地方。对人来说这像限制，对 agent 来说这是保护。

## 核心设计思路：少抽象，多约束，结果可预测

`open-slide` 的设计思路比较一致，大概可以看成三件事。

### 1. Slides 既然本质上是代码，那就直接写代码

在 `open-slide` 里，一套 deck 就是一些 React 组件。每个 slide 目录下有一个 `index.tsx`，默认导出的是页面组件数组。没有额外 DSL，也没有复杂模板系统。

这样做的好处很直接：agent 本来就擅长处理这种明确的代码结构。它不需要先学一套 slides 语法，再把需求翻译进去，而是可以直接在 JSX、style、组件层面工作。

### 2. 固定 1920×1080 画布，优先保证可预测性

`open-slide` 的每一页都渲染到固定的 `1920 × 1080` 画布里，运行时再统一缩放到不同屏幕。

这看起来是个很传统的设计，但对 agent 非常友好。因为固定画布意味着布局是可推理的：标题 80px 会占多少高、左右 padding 留多少、三段文字会不会溢出，都是可以算的。相比响应式页面那种依赖断点和流式布局的写法，固定画布更适合让 agent 稳定地产出“看起来就是一页幻灯片”的东西。

### 3. 不只考虑生成，还考虑修改

这是 `open-slide` 里我最喜欢的一点。

很多工具会把“生成第一版”当成终点，但真实工作流里，第一版通常只是开始。`open-slide` 把后续修改也当成框架的一部分：预览、点选、批量修改、评论、回写源码、再交给 agent 处理。这比单纯生成一堆页面更接近实际使用场景。

## 它的典型使用方式

`open-slide` 的工作流不长，大概就是：

`init -> create -> preview -> comment -> apply -> export`

先用 CLI 起一个工作区：

```bash
npx @open-slide/cli init my-deck
```

生成出来的项目很轻，`slides/`、`themes/`、`open-slide.config.ts` 这些都准备好了，运行时相关的 Vite、React 配置基本被藏在框架内部，不需要自己搭。

接下来把工作区交给 agent，用 `/create-slide` 之类的 skill 生成第一版 deck。这个阶段 agent 负责的是页面代码本身，框架负责的是预览、缩放、导航、演讲模式、导出这些运行时能力。

等第一版出来之后，就进入迭代阶段。到了这里，`open-slide` “为 agent 设计”的味道会更明显。

## 网页怎么把反馈交给 agent

通常我们说 agent 改代码，还是停留在“你在聊天框里告诉它怎么改”。`open-slide` 往前走了一步：它让浏览器里的视觉反馈也能进入源码。

它内置了一个 inspector。你可以在预览界面里直接点某个元素，然后做两类操作。

第一类是直接编辑，比如改文字、字号、字重、颜色、背景色、图片路径。这类修改会先缓存在内存里，最后一次性保存成一次 HMR 更新。

第二类是留评论。比如有些改动不适合做成几个输入框，像“这个标题更有冲击力一点”“这里换成强调色”“这块信息重排一下”。这时候可以直接在元素上挂 comment。

![](https://img.alicdn.com/imgextra/i1/O1CN01yS5OZh1ejSZ9MpYgg_!!6000000003907-2-tps-2516-1526.png)

这个 comment 不只是前端状态，它会被写回到源码里，变成一个 `@slide-comment` marker。后面执行 `/apply-comments` 时，agent 会扫描这些 marker，读取附近代码和注释内容，完成对应修改，然后把 marker 清掉。

![](https://img.alicdn.com/imgextra/i2/O1CN01XwQZLh1EA1v0bKEMc_!!6000000000310-2-tps-2338-1436.png)

整个链路大概是这样：

`点元素 -> 留 comment -> 写入源码 marker -> /apply-comments -> agent 改代码 -> marker 删除`

这套设计好在它没有试图让网页“直接替 agent 改所有事”，而是把网页里的视觉意图，转换成 agent 能处理的源码任务。这样前端交互和代码编辑不是两套系统，而是能接在同一个闭环里。

## 一些很实用的设计细节

除了主流程，`open-slide` 还有几个细节，看得出来是围绕真实使用场景补出来的。

一个是素材管理。真实的 slides 往往要塞 logo、截图、视频、图片，不可能全靠 agent 凭空生成，所以它专门给每个 slide 留了 `assets/` 目录，也支持用占位组件先占坑，后面再替换成真实图片。

一个是 theme 机制。它不是那种重型主题系统，而更像一份给 agent 看的设计说明：配色、字体、布局语言、页面语气。后续再生成新 deck 时，agent 可以沿着已有视觉风格写，不至于每次都从头发挥。

还有一个是工作区里的规则文件和 skills 都跟项目放在一起。这样它们不是某个工具的私有配置，而是项目本身的一部分，能跟着版本一起走，也更方便团队协作。

## 最后

`open-slide` 不一定会替代现有的 slides 工具。它切的场景很明确：不是“我想自己高效写一套 slides”，而是“我想把做 slides 这件事交给 agent，但又希望结果可控、可改、能演示”。

具体到 `open-slide`，它的价值不在于“AI 帮你做 PPT”这种泛泛的说法，而在于它把 agent 参与创作时最容易翻车的部分拎了出来：约束、可预测性，以及修改闭环。

过去的 slides 工具主要服务的是“人直接编辑”。`open-slide` 想做的事情，则是把 slides 变成一种适合 agent 参与生产的代码产物。这件事做得越顺，agent 离“交付成品”也就越近。
