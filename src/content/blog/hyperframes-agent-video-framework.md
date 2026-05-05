---
title: 'HyperFrames：一个为 Agent 准备的视频框架'
description: 'HyperFrames 最有意思的地方，不是“又一个代码生成视频工具”，而是它把 HTML 放回了视频创作的入口。'
pubDate: 'Apr 27 2026'
---

最近在看一个挺有意思的项目：`HyperFrames`。

开源地址：<https://github.com/heygen-com/hyperframes>

第一次看到它，很多人都会先拿它和 [Remotion](https://github.com/remotion-dev/remotion) 比。这很自然，因为它们都在做“用代码生成视频”，底层也都借助了浏览器渲染能力。

但继续往下看会发现，HyperFrames 想解决的问题和 Remotion 并不完全一样。

Remotion 更像是在回答：怎么用 React 做视频。  
HyperFrames 更在意的是：如果越来越多视频会先由 AI agent 起稿，再由人类继续编辑，那么什么样的创作介质会更顺手？

它给出的答案是：**HTML。**

![](https://img.alicdn.com/imgextra/i3/O1CN01qWmpb11CVRCMNWHKq_!!6000000000086-2-tps-2048-1152.png)

我觉得这正是 HyperFrames 最值得看的地方。它不是简单换一种方式做“代码视频”，而是换了一个创作入口。

## 为什么这个判断很重要

大多数模型天然更熟悉 HTML、CSS、JavaScript、SVG、Canvas，以及各种网页动画代码。

你让它直接写这些，它通常更自然，视觉表达也更放得开。  
你让它先进入一个 React-first 的视频框架，再去理解组件结构、运行方式和额外约束，成本就会明显更高。

所以 HyperFrames 的思路很直接：既然模型最熟悉的是 Web，那就尽量不要让它绕远路。

另一边，它又把 HTML 当成 **source of truth**。这意味着浏览器里最终渲染出来的 DOM，不只是展示结果，也可以成为后续编辑的直接对象。对 Studio、可视化拖拽、属性面板、时间线编辑来说，这个选择都很友好。

换句话说，HyperFrames 优化的不只是“agent 能不能写出来”，而是“agent 起稿之后，人能不能顺畅接着改”。

## 它和 Remotion 真正差在哪

表面上看，两边都能用代码做视频。  
但真正拉开差距的，还是创作介质。

Remotion 的入口是 React。  
HyperFrames 的入口是 HTML。

在 HyperFrames 里，一个 composition 本质上就是一个 HTML 页面。你直接写 HTML、CSS、JS，用少量 `data-*` 属性描述时间信息，再把动画 timeline 注册到运行时。

比如 composition 根节点通常会有这些信息：

- `data-composition-id`
- `data-start`
- `data-duration`
- `data-width`
- `data-height`

动画 timeline 则挂到：

`window.__timelines["<composition-id>"]`

这套约定很轻。它没有重新发明一套很重的 DSL，而是在浏览器现成能力上补了一层视频所需的时序规则。

直接的好处也很清楚：

- 现成网页或设计稿导出的 HTML 更容易直接拿来改
- 不需要先把 HTML / CSS 翻成 JSX
- agent 可以始终待在自己最熟悉的 Web 语境里

![](https://img.alicdn.com/imgextra/i3/O1CN01m1uIgq1fipdeWS54R_!!6000000004041-2-tps-2048-1152.png)

## 为什么它和 Claude Design 这类工作流接得上

如果把 HyperFrames 放到真实工作流里看，Claude Design 是个很典型的例子。仓库里已经有对应文档，说明怎么让 Claude Design 产出 HTML，再继续 handoff 给 Claude Code。

这条链路之所以顺，核心原因也一样：**中间介质统一。**

大致可以这样理解：

1. Claude Design 先把品牌、版式和视觉结构做出来
2. HyperFrames 在这份 HTML 上补时间线、动画和视频语义
3. Codex、Claude Code、Cursor 这类 coding agent 继续做预览、微调和生产级检查

这和传统视频流程不太一样。很多传统流程里，设计稿、原型、源文件和最终成片之间都有明显断层；而在这套组合里，中间介质更统一，来回折损也会少很多。

下面这个视频就是用 Claude Design + HyperFrames 做出来的示例：

<video width="100%" height="560" controls="controls" src="//cloud.video.taobao.com/vod/AIB6mryT447JR3GcXaLUN1G9fEmmjsnzeK0hVkOBxWI.mp4"></video>

## 一个更容易上手的理解方式

如果只想先抓住它的核心，我觉得可以把 HyperFrames 想成：

**浏览器 + 一层很薄的时间线协议 + 可 seek 的动画运行时 + 视频渲染管线**

真正需要先搞明白的，通常就三件事：

1. composition 根节点怎么声明
2. 元素怎么通过 `data-*` 属性挂到时间线上
3. GSAP timeline 怎么注册给运行时

这三件事通了，后面大部分创作能力其实还是来自 Web 本身。

## 最后

从结果上看，HyperFrames 当然也是“代码生成视频”。  
但它真正特别的地方，不只是能不能做视频，而是它对创作入口的判断。

它没有继续沿着“把前端框架带进视频”这条路往下走，而是反过来问了一步：对 agent 来说，什么才是更原生的工作介质？

它选择了 HTML。

如果只用一句话概括，我会更愿意这样写：

**HyperFrames 不是简单换一种方式做“代码视频”，而是把视频创作的入口往 HTML 挪了一步，让 agent 和人都更容易参与进来。**
