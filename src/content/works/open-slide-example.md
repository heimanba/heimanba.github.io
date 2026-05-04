---
title: 'open-slide-example：用 open-slide 做的一次完整实践'
description: '围绕 open-slide 搭了一个可运行、可预览、可继续迭代的示例 deck，把 agent 参与做 slides 的过程落成了实际项目。'
pubDate: 'May 04 2026'
tags:
  - Open Slide
  - Slides
  - Agent
  - React
role: '实践、验证、实现'
status: '已完成首版'
featured: true
links:
  repo: 'https://github.com/heimanba/open-slide-example'
  article: 'https://heimanba.github.io/blog/open-slide-introduction/'
---

这个项目是我围绕 `open-slide` 做的一次直接实践，目标不是只看框架介绍，而是真的把它拿来做一套 deck，看看它作为 “The slide framework built for agents” 到底顺不顺手。

实践里主要在验证几件事：

- deck 作为 React 代码来维护时，agent 的修改成本是不是更低
- 固定画布和受约束的工作区，能不能让页面结果更稳定
- 浏览器里的可视化反馈，能不能顺畅地回写成源码修改任务
- 从初始化到导出，整条工作流是不是足够完整

这个仓库更偏“把想法做出来”，所以价值主要不在抽象讨论，而在实际结果：

- 可以直接看到 deck 结构怎么组织
- 可以观察 slide、theme、assets 在项目里的分工
- 可以结合文章一起看框架设计和落地实践之间的对应关系

如果想先看整体判断，文章会更完整；如果想直接看项目怎么搭、代码怎么写、目录怎么组织，这个仓库会更直接。
