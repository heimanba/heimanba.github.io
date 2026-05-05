---
title: 'wx-acpx：一个微信窗口，接管所有 AI 编程 Agent'
description: 'wx-acpx 把微信聊天变成 Coding Agent 控制台，让 Claude、Qwen、Codex 等 AI 能在手机上随时接手项目分析、写代码和答疑。'
pubDate: 'May 05 2026'
updatedDate: 'May 05 2026'
---

# wx-acpx：一个微信窗口，接管所有 AI 编程 Agent

**项目地址**: https://github.com/heimanba/wx-acpx

> 下班路上发现线上 Bug？打开微信，发一句话，让 Claude 帮你定位；凌晨没带电脑，用手机让 Qwen 生成修复方案——wx-acpx 让你随时随地调用 AI 编程能力，不再受限于是否坐在电脑前。

**wx-acpx** 是一个轻量桥接服务，将微信聊天变成 Claude、Qwen Code、Codex、Kimi、Gemini、Cursor 等主流 Coding Agent 的控制台。无需安装 App，无需打开 IDE，直接在微信发消息即可驱动 AI 写代码、分析项目、解答技术问题。

---

## 三分钟上手

### 安装

```bash
# macOS ARM64（其他平台见 Releases 页面）
curl -fL -o wx-acpx-darwin-arm64 \
  "https://github.com/heimanba/wx-acpx/releases/download/v1.0.1/wx-acpx-darwin-arm64"

chmod +x wx-acpx-darwin-arm64
xattr -cr wx-acpx-darwin-arm64  # 清除 macOS 隔离标记
./wx-acpx-darwin-arm64
```

> 支持平台：macOS (ARM64/x64)、Linux (x64)、Windows (x64)

**前置要求：** 本地已安装 [Claude Code](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/overview)、[Qwen Code](https://github.com/QwenLM/qwen-code)、[Codex](https://github.com/openai/codex) 等兼容 ACP 协议的 Agent 之一。

### 微信登录

1. 启动后终端显示登录二维码：
   ![](https://img.alicdn.com/imgextra/i3/O1CN019uvgAs1faaVErjQ7K_!!6000000004023-2-tps-1242-894.png)

2. 微信扫码确认后即可使用：
   ![](https://img.alicdn.com/imgextra/i2/O1CN01S7ImF51XxvlMv9EuV_!!6000000002991-2-tps-1206-2622.png)

3. 登录凭证保存至 `~/.wx-acpx/credentials.json`，下次启动自动恢复，无需重复扫码

> **账号安全说明：** wx-acpx 使用微信 iLink 协议（与微信 PC 版相同），凭证仅存储在本地，不经过任何第三方服务器。默认权限策略为 `approve-reads` + `deny` 写操作，Agent 不会在未经确认的情况下修改任何文件。
>
> **⚠️ 安全风险提示：** 鉴于微信协议存在潜在的数据外发风险，**严禁在办公环境或办公设备上运行本工具**。仅限在私人设备上连接使用。

---

## 核心命令

```
# 切换工作目录，Agent 将基于该目录上下文回答
你: /cwd ~/my-project
Bot: 工作目录已切换至: /Users/name/my-project

# 指定 Agent 处理请求
你: /claude 分析一下这个项目的依赖问题
Bot: [Claude 基于 my-project 目录分析后返回结果...]

# 随时切换不同 AI
你: /qwen 生成一个 README
Bot: [Qwen Code 基于项目结构生成文档...]

# 开启新会话，清除上下文
你: /new
Bot: 已开启新会话
```

**完整命令列表：**

| 命令 | 说明 |
|------|------|
| `/claude` 或 `/cc` | 调用 Claude Code |
| `/qwen` | 调用 Qwen Code |
| `/codex` 或 `/cx` | 调用 OpenAI Codex |
| `/cursor` 或 `/cs` | 调用 Cursor Agent |
| `/kimi` 或 `/km` | 调用 Kimi |
| `/gemini` 或 `/gm` | 调用 Gemini |
| `/pi` | 调用 Pi ACP |
| `/openclaw` 或 `/oc` | 调用 OpenClaw |
| `/opencode` 或 `/ocd` | 调用 Opencode AI |
| `/copilot` | 调用 Copilot |
| `/droid` | 调用 Factory Droid |
| `/iflow` | 调用 iFlow |
| `/kilocode` | 调用 Kilocode |
| `/kiro` | 调用 Kiro |
| `/help` | 显示帮助信息 |
| `/info` | 查看当前状态 |
| `/cwd <路径>` | 切换工作目录 |
| `/new` 或 `/clear` | 开启新会话 |

---

## 技术架构

![wx-acpx 技术架构图](https://img.alicdn.com/imgextra/i3/O1CN017pywlr1aSHElTCEEf_!!6000000003328-2-tps-1376-768.png)


| 模块 | 职责 |
|------|------|
| `weixin-bot` | 微信消息收发、二维码登录、长轮询监听 |
| `messaging` | 命令解析、用户状态管理、消息路由、串行队列 |
| `acpx-runtime` | Agent 注册表、会话管理、`ensureSession`/`sendSession` 调用 |

### 为什么用 acpx 而不是直接调用 Agent？

**[acpx](https://github.com/openclaw/acpx)** 是 OpenClaw 开源的 ACP 无头 CLI 客户端，统一封装了各 Agent 的通信协议，让 wx-acpx 无需针对每个 Agent 单独适配：

| 对比维度 | 直接 PTY 调用 | acpx (ACP 协议) |
|----------|---------------|-----------------|
| 通信方式 | 字符流解析，脆弱易变 | 结构化 JSON 消息 |
| 会话管理 | 自行维护，复杂易错 | 内置持久会话 + 命名空间 |
| 多 Agent 支持 | 每个 Agent 适配成本极高 | 统一接口，即插即用 |
| 权限控制 | 难以精细控制 | `--approve-reads` 等安全策略 |

---

## 实现细节：踩过的坑

### 1. 消息串行化——防止用户回复交错

微信 iLink 基于长轮询，多用户并发时 Agent 响应可能交错返回（A 用户收到 B 用户的回复）。为每个用户维护独立的串行队列解决这个问题：

![消息串行化机制](https://img.alicdn.com/imgextra/i2/O1CN016Do6nm220cYwTNQb6_!!6000000007058-2-tps-1376-768.png)

```typescript
const userQueues = new Map<string, Queue>();

async function handleMessage(userId: string, message: string) {
  if (!userQueues.has(userId)) {
    userQueues.set(userId, new Queue());
  }
  await userQueues.get(userId)!.add(() => processWithAgent(userId, message));
}
```

### 2. 超时处理——对抗微信的「发送失败」

Claude 分析大型代码库可能耗时 30 秒以上，而微信超时会导致「发送失败」且无法再发消息。三重策略解决：先发「正在思考中...」心跳，流式接收 Agent 输出，每 400 字符分段推送。

### 3. 会话命名——防止会话爆炸

不加管理的会话会产生大量僵尸会话。采用确定性命名策略：
```
wxacp_{instanceId}_{hash(userId)}_{agentName}_{nonce}
```
`instanceId` 保证重启后不复用旧会话，`nonce` 在用户执行 `/new` 时递增强制新建。

### 4. 微信登录稳定性——自动重连

iLink 长连接受网络波动影响频繁掉线。凭证持久化 + 自动重连 + 降级二维码登录三层保障，通常无感知恢复，极端情况才需要重新扫码。

---

## 从源码运行

```bash
git clone https://github.com/heimanba/wx-acpx.git
cd wx-acpx
bun install
bun run index.ts
```

### 接入新 Agent

只需在 `src/agents/registry.ts` 中添加一行，只要 Agent 支持 ACP 协议即可无缝接入：

```typescript
export const agentRegistry = {
  claude: "bunx -y @zed-industries/claude-agent-acp@^0.21.0",
  qwen:   "qwen --acp",
  // 新增任意 ACP 兼容 Agent
  deepseek: "deepseek-cli --acp",
};
```

---

## 常见问题

**Q: macOS 提示「已损坏」无法打开？**
A: 运行 `xattr -cr wx-acpx-darwin-arm64` 清除隔离属性，或使用终端而非浏览器下载。

**Q: 使用微信小号还是主号？**
A: 推荐使用独立的微信号部署，与自己的主号对话使用。wx-acpx 本身不会上传任何数据，凭证仅存本地。

**Q: 支持哪些消息类型？**
A: 当前版本支持文本消息。图片、语音、文件等多媒体消息计划在后续版本支持。

---

## 相关资源

- [微信 Bot 协议文档](https://github.com/heimanba/wx-acpx/docs/weixin-bot-protocol.md)
- [ACPX Runtime 集成说明](https://github.com/heimanba/wx-acpx/docs/acpx-runtime.md)
- [@tencent-weixin/openclaw-weixin](https://npmmirror.com/package/@tencent-weixin/openclaw-weixin)
- [weixin-bot](https://github.com/epiral/weixin-bot)
