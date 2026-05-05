---
title: 'wx-acpx：把微信聊天变成 AI Coding Agent 控制台'
description: '一个把微信消息桥接到 Claude、Qwen、Codex、Kimi、Gemini 等 Coding Agent 的轻量服务，让用户不用打开 IDE，也能直接在手机上分析项目、写代码和切换会话。'
pubDate: 'May 05 2026'
updatedDate: 'May 05 2026'
tags:
  - WeChat
  - AI Agent
  - ACP
  - CLI
  - Automation
role: '产品定义、交互设计、Agent 工作流整合'
status: '已完成首个可用版本'
featured: true
links:
  repo: 'https://github.com/heimanba/wx-acpx'
  article: 'https://heimanba.github.io/blog/wx-acpx/'
---

`wx-acpx` 是一个很直接、也很实用的想法：把微信聊天窗口变成 AI Coding Agent 的控制台。用户不需要打开 IDE，也不需要坐在电脑前，只要在微信里发一句话，就能让 Claude、Qwen、Codex、Kimi、Gemini、Cursor 等 Agent 基于指定项目上下文继续工作。

这个项目的核心价值不在“又接了一个聊天入口”，而在于它把移动端触达、项目上下文和 Agent 会话管理连在了一起。对真实使用场景来说，这意味着下班路上、临时离开工位、甚至只有手机在手边时，也能继续让 Agent 做项目分析、问题定位和方案生成。

当前这版主要跑通了几件事：

- 把微信文本消息路由到多个兼容 ACP 协议的 Coding Agent
- 支持 `/cwd`、`/new`、`/info` 等命令，管理工作目录与会话上下文
- 用 `acpx` 统一接入不同 Agent，避免逐个适配底层协议
- 通过用户级串行队列和确定性会话命名，降低并发回复交错和会话失控问题
- 基于本地凭证保存和自动重连机制，提升微信登录和长连接稳定性

这个项目对我来说也验证了一件事：AI 编程入口不一定非得停留在 IDE 或 Web 页面里。只要上下文、权限边界和会话机制设计得合理，聊天工具也可以成为足够顺手的 Agent 入口。

如果想先看完整背景、技术架构和实现细节，文章会更完整；如果想直接看代码组织、Agent 注册方式和命令路由实现，这个仓库会更直接。
