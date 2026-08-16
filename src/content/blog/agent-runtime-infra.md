# 手脑分离：Agent Runtime Infra 的架构取舍

2026 年 4 月 Anthropic 发布了 Managed Agents，用于大规模构建和部署云托管代理。随后国内的百炼、火山，国外的 LangChain 等也陆续推出了各自的 Managed Agents 方案。Managed Agents 这套理念有成为 Agent API 标准的趋势。

但在 API 标准之下，各家真正拉开差距的是基础设施层——尤其是 Sandbox。当你把一个 Agent 塞进沙箱运行时，你面对的不是一个隔离问题，而是一个运行时问题。

## Sandbox-as-Agent-Runtime：核心矛盾

理解这个矛盾，需要先区分 Sandbox 在 Agent 中扮演的两种截然不同的角色。

**Sandbox 作为代码执行器**：OpenAI Code Interpreter 和早期的 E2B 集成是这种模式的典型。Sandbox 只负责执行 Agent 生成的代码片段——跑一段 Python、返回输出。LLM 推理、编排逻辑、工具选择全在沙箱外部完成，每次工具调用进入沙箱，执行完即销毁。沙箱是一个**无状态的函数调用**，用完即扔。

**Sandbox 作为 Agent Runtime**：当你把整个 Agent loop 塞进沙箱——LLM 推理、bash 执行、文件操作、MCP 工具调用全在一个运行时里——沙箱的角色发生了质变。Claude Code 是最直观的例子：它作为一个本地 Agent，内部包含完整的 LLM API 调用循环、bash 命令执行、文件系统读写、MCP server 通信，全部在同一个执行环境内完成。此时 Sandbox 不再是"关住代码的笼子"，而是 **Agent 的运行时（Runtime）**。

从代码执行器到 Runtime，这个转变带来的核心矛盾是：沙箱为**短生命周期、无状态、防御性隔离**而设计；Agent Runtime 需要**长生命周期、有状态、协作式隔离**。这两组需求在根本上冲突。

![Sandbox 的两种角色：代码执行器 vs Agent Runtime](https://img.alicdn.com/imgextra/i2/O1CN01isV7bbjBoGK3daAC_!!6000000001126-2-tps-1792-1024.png)

## 隔离技术谱系

在讨论具体挑战之前，有必要先建立隔离技术的全景认知——Agent Runtime 的方案选择本质上是在下面的谱系中做 trade-off：

| 隔离层级 | 代表技术 | 启动速度 | 隔离强度 | 内存开销 |
|---------|---------|---------|---------|---------|
| 语言运行时级 | V8 Isolates | <5ms | 进程内内存隔离，无独立内核 | ~KB |
| Namespace 级沙箱 | bubblewrap | ~30ms | 共享内核，unprivileged namespace，无 daemon | ~MB |
| OS 级容器 | Docker/runc | ~ms | 共享内核，namespace+cgroup，需 daemon | ~MB |
| 系统调用拦截 | gVisor | ~ms（无需 VM 启动） | 用户态内核拦截 syscall，10-30% I/O 损耗 | ~MB |
| 微虚拟机 | Firecracker | ~125ms | 独立内核，硬件级内存隔离，<5MiB overhead | ~5MiB+ |
| 轻量 VM | Kata Containers | 150-300ms | 完整 VMM 编排 + 硬件虚拟化 | <10MiB+ |

这六个层级不是学术分类——它们直接对应着当下主流厂商的实际选型。从最轻到最重，逐层看关键取舍：

**V8 Isolates**——Cloudflare Workers 选择了最激进的路线：在单个进程内利用 V8 引擎的 Isolate 机制实现租户隔离，启动 <5ms，内存低一个数量级，叠加 Linux namespace + seccomp 作为第二道防线。但代价是严格的功能限制：没有文件系统、不支持原生二进制、不支持多线程。适合边缘计算，不适合 Agent Runtime。

**bubblewrap**——Claude Code 和 OpenAI Codex 都选择了这个层级。它直接使用 Linux 内核的 namespace 机制，不需要 root 权限和 daemon，约 30ms 启动。Claude Code 在此基础上构建了双层沙箱架构：外层 bubblewrap 限制整个进程的可见文件系统和环境变量，内层 native sandbox（macOS Seatbelt / Linux bubblewrap + socat）专门管控 bash 命令和子进程。核心限制是共享宿主机内核——安全研究者已证明 Agent 可以通过 `/proc/self/root` 路径绕过 denylist、通过 `ld-linux.so` 的 `mmap` 绕过 `execve` 钩子。新一代的 Sandlock（Rust，Landlock + seccomp，6ms 启动，无需 namespace）正在尝试补齐这些短板。

**Firecracker**——AWS 发明，Lambda 每月数万亿次调用的底座。Rust 编写的轻量 VMM 通过 KVM 实现硬件级隔离，只虚拟化 5 个 I/O 设备，<5MiB 开销，125ms 启动。配套 jailer 叠加 cgroup、seccomp、chroot 多层防御。正在成为不可信代码执行的事实标准——AWS Lambda、Vercel Sandbox、E2B、Fly.io Sprites、AWS Bedrock AgentCore 都基于它。

**阿里云 FC / ACS**——在 Firecracker 路线之上做了软硬协同：底层 X-Dragon MOC 芯片将管控从主 CPU 卸载到专用硬件，物理层面隔离宿主和 Guest；实例内部使用 MicroVM 安全容器。2025 年 FC 针对 Agent 场景引入 Session 级物理隔离、Snapshot 热唤醒、MCP SSE 亲和路由。ACS 则进一步构建了完整的 Agent Sandbox 纵深防御体系（详见后文章节）。

**Kata Containers / gVisor**——Kata 提供最完整的 VMM 编排和硬件虚拟化，但启动最重（150-300ms）；gVisor 用用户态内核拦截 syscall，不需要嵌套虚拟化，适合 CPU 密集型任务，但 I/O 有 10-30% 损耗。

从整个行业看，技术选型取决于你在"隔离强度 vs 启动速度 vs I/O 性能"三角中落在哪个位置。V8 Isolates 启动最快但功能最受限；bubblewrap/Landlock 是本地 Agent 运行时的最佳轻量选择；Firecracker 在隔离强度和启动速度之间取得了最佳平衡，是云端不可信代码执行的事实标准；Docker 容器在隔离要求不高时提供最大的生态兼容性。

不过，隔离技术只是地基。真正让 Sandbox 成为 Agent Runtime 之后暴露的问题，远不是"用哪种隔离"能解决的。

## 挑战一：长任务的资源与状态管理

Agent 的 session 可能持续数小时甚至数天。一个 coding agent 可能花 30 分钟重构代码，然后等待用户 2 小时后的反馈，再继续下一轮迭代。传统沙箱是 request-response 模型——起容器、跑任务、销毁。Agent Runtime 面临三难选择：

**保活**：容器空转等待，资源利用率极低。一个 2C4G 的沙箱在等待用户输入时 CPU 几乎为零，但内存仍然被占用。如果同时有上千个这样的 idle session，成本不可接受。

**销毁重建**：丢失执行上下文——文件系统状态、已安装的依赖、进程状态全部消失。下次唤醒需要从头 clone 仓库、安装依赖、恢复环境，又回到冷启动问题。

**快照恢复**：技术上最优，但实现复杂度最高。需要同时保存文件系统快照和进程状态（类似 CRIU），并在恢复时保证网络连接、文件句柄、锁状态的一致性。

各方案在长任务上的取舍清晰地反映了这个三难：

E2B 的 Hobby 套餐限制 session 最长 1 小时，Pro 套餐（$150/月）延展到 24 小时，暂停的 sandbox 可以保存完整状态以突破持续运行窗口——但即便 24 小时，本身也是对"Agent 可能需要跑几天"这个需求的妥协。Modal 通过 Volumes（持久化存储）+ filesystem snapshots 解决数据持久化，Sandbox memory snapshots（alpha 阶段）可以 clone 完整的沙箱状态（FS + Memory），用于超出单次执行窗口的工作流。Fly.io Sprites 走得更远，提供 VM 级别的 checkpoint/restore，支持 pause/resume 循环和"wake from hibernation"，session 时长无上限。

学术界的 Crab 项目提出了一个精巧的优化：Agent 的执行是"思考-行动"交替的节奏型负载，LLM 推理的等待窗口（通常数秒）是天然的 checkpoint 窗口。Crab 用 Coordinator 拦截 HTTP 流量识别 turn 边界、eBPF Inspector 判断每个 turn 需要哪种级别的 checkpoint、C/R Engine（ZFS + CRIU）执行快照，恢复时用 fast-forward 机制重放历史动作直到追上断点状态。这个洞察大多数团队无法自行实现——它需要深入修改沙箱运行时、注入 eBPF 探针，远超一般应用层的控制范围。

## 挑战二：全托管 Agent Loop 的架构张力

当 LLM 推理和工具执行都放在同一个沙箱里时——本质上是在沙箱里托管了一个完整的 Claude Code——你面对的是一个架构上的悖论：

沙箱需要**对外通信**（调用 LLM API、访问 MCP server、搜索网页），同时需要**对内保护**（API Key、OAuth token、Git 凭证不能让 Agent 代码看到）。每一次 LLM 推理调用都要穿越沙箱边界——发出 HTTP 请求，等待几秒到几十秒的流式响应；每一次工具调用都在沙箱内部本地执行，毫秒级完成。这产生了一个 I/O 密集的混合负载模式：频繁的外部 API 调用（高延迟）+ 密集的文件读写（低延迟）+ 间歇的用户交互（不可预测延迟）。

Claude Managed Agents 的解法是**架构级分离**：编排层（orchestrator）在沙箱外部，负责 LLM 推理循环和凭证管理；沙箱内部只运行代码执行和工具调用。凭证永远不进入沙箱——Agent 通过代理访问外部服务，"doesn't know what's on the other end"。这个设计的代价是每次工具调用多一跳网络延迟，且 Agent 无法在本地缓存 LLM 响应做复杂的推理链管理。

Claude Code 作为本地 Agent 走了另一条路：所有网络调用走用户环境的网络栈，凭证管理采用 mask/deny 机制——代理拦截出站请求，将 sentinel value 替换为真实凭证，甚至能自动重算 AWS SigV4 签名。沙箱模式从 OS 原生的 Seatbelt（macOS）/ bubblewrap（Linux），到 Docker dev container，到完整的 microVM，提供多个隔离层级供选择。但这意味着安全性取决于用户的配置——你可以完全关闭沙箱保护。

两者的差异本质上是**谁控制运行时**的问题。Claude MA 是 Anthropic 控制的托管运行时，可以在架构层面强制凭证隔离；Claude Code 是用户控制的本地运行时，安全模型退化为"配置级"——用户有能力也有责任正确配置沙箱策略。当你构建自己的 Agent Runtime 时，这个选择不可回避：你是做托管方案（牺牲灵活性换安全保证），还是做自托管方案（给用户完全控制权但承担安全风险）？

## 挑战三：安全模型的方向反转

传统沙箱的威胁模型是**防逃逸**：不可信代码在沙箱里运行，可能尝试提权、逃逸到宿主。防御方向是从内向外。

Agent Runtime 的威胁模型是**防内窥**：Agent 的代码由 LLM 生成，理论上"可信"，但可能被 prompt injection 操纵，去读取 API Key、访问 .ssh 目录、通过 DNS 隧道外传凭证。防御方向是从外向内——Agent 需要访问外部资源，但不能看到凭证本身。

这个反转意味着传统沙箱的"关在里面"解决不了"Agent 需要合法地访问 Git、数据库、MCP server，但绝不能看到 access token"这个需求。围绕这个需求，安全防御经历了四个演进阶段：

**阶段一：隔离即安全**——关进容器就认为安全了，E2B、Modal 的默认姿态。凭证和网络完全留给用户。

**阶段二：隔离 + 网络管控**——加上出口白名单或全禁策略。但 AWS Bedrock AgentCore 的 MMDS 事件（SSRF 窃取 IAM 凭证 → DNS 隧道外泄）证明，网络管控的遗漏点可以击穿整个安全栈。Google Vertex AI 选择全禁——安全但 Agent 无法访问任何外部资源。

**阶段三：凭证代理**——核心洞察是"凭证不应该以真实形态存在于沙箱内"。Claude Code 的 mask/deny、Claude MA 的 vault 零信任、ACS 的 fake token + egress 替换，本质都是同一个思路：在沙箱和网络边界之间插入凭证代理层。这是当前最成熟的方案。

**阶段四：纵深防御 + 动态权限**——不仅代理凭证，还叠加 STS 动态收窄、网络微隔离、HTTPS 拦截、CSI 数据隔离。每一层独立防线，单层突破不导致全面沦陷。ACS 代表了最前沿的实践（详见后文"纵深案例：ACS"）。

务实的建议：至少做到阶段三，需要访问云资源则必须做到阶段四。

Agent Sandbox Taxonomy（AST）项目的 7 层防御框架（计算隔离、资源限制、文件系统、网络、凭证、行为控制、审计）进一步印证了这个演进：**没有单一产品覆盖所有层**，E2B/Modal 在 L5-L7 几乎空白，Google Vertex AI 在 L4 选择了最简单粗暴的全禁，只有 Claude MA 和 ACS 在多数层级有系统性覆盖——但实现路径完全不同（详见方案对比表）。


## 挑战四：冷启动与首 token 延迟

用户发起请求后，如果需要先 clone 仓库、安装依赖、启动容器，可能要等几十秒才能看到第一个 token。这在聊天式交互中是致命的——用户对"第一个响应"的心理预期是秒级，不是十秒级。

各方案的冷启动优化策略可以归纳为四类：

**预热池（warm pool）**：预先创建一批已启动的空沙箱，请求到来时直接分配。解决了容器启动延迟，但解决不了环境准备延迟（clone 代码、装依赖）。维护成本高——空闲的 warm pool 实例也在消耗资源。

**微虚拟机**：Firecracker 100-200ms 启动，E2B 优化到 80ms。启动延迟本身已经不是瓶颈。

**快照恢复**：从之前运行过的状态恢复，跳过环境准备。Fly.io Sprites、Modal memory snapshots 都走这条路。恢复速度取决于快照大小和存储延迟。

**持久卷（persistent volumes）**：代码和依赖存储在持久卷上，沙箱重启后直接挂载，无需重新 clone 和安装。Modal 的 Volumes、Daytona 的 stateful workspace 采用此方案。

真正的瓶颈不在沙箱启动本身（现代方案已做到毫秒级），而在**环境准备**。一个需要 clone 大型仓库 + 安装数千个 npm 包的项目，即使沙箱 80ms 启动，环境准备仍可能需要 1-5 分钟。持久卷 + 快照恢复的组合是当前最有效的解法，但它引入了状态管理的额外复杂度——卷的一致性、快照的时效性、多实例共享卷的冲突处理。

## 挑战五：状态连续性与上下文管理

Agent 的对话可能持续数小时，中间会断网、会崩溃、会等用户回来。更棘手的是模型上下文窗口的硬限制——即使 200K token 也不够长任务用，历史事件必须被压缩或选择性回放。

这个挑战有两种截然不同的应对思路。一种是把完整的事件流持久化在服务端作为 source of truth，模型的上下文窗口只是一个"视图层"——压缩后的历史被喂给模型，但完整记录永远在。另一种是基于 checkpoint 做版本化管理，每个快照关联一个版本化 manifest，支持事务性的回滚——比脆弱的 shell 级清理操作（`rm -rf` 后 `git checkout`）可靠得多，但实现复杂度更高。

前者的代价是持续的存储压力（每个 event 都要持久化），后者的代价是进程级快照 + 增量差异计算的工程复杂度。Anthropic 最终选择了前者，但把它嵌入了一个更大的架构框架中——这正是下一节要讲的。

![Agent Runtime 的五大挑战及其耦合关系](https://img.alicdn.com/imgextra/i1/O1CN014LWr8oDuB5C2nDN2_!!6000000002181-2-tps-1376-768.png)

## Anthropic 的工程解答：手脑分离

上面五个挑战不是各自独立的——它们有一个共同的根因：**脑（推理/编排）和手（执行/工具）耦合在同一个沙箱里**。Anthropic 在构建 Managed Agents 的过程中踩过这个坑，最终走向了"手脑分离"的架构。他们的工程实践是目前公开资料中对 Sandbox-as-Agent-Runtime 问题最系统的解答。

![手脑分离架构：Session / Harness / Sandbox 三层接口](https://img.alicdn.com/imgextra/i3/O1CN01xSuCaosNIFL2BxHU_!!6000000008170-49-tps-1080-1080.webp)

### 从单体容器到三层接口

Anthropic 最初的做法是把所有东西塞进一个容器——harness（编排逻辑）、sandbox（代码执行）、凭证全在一起。这看起来最直接：直接 syscall 改文件、零服务边界、延迟最低。但实际运行中暴露了致命问题："debugging nearly impossible without exposing user data"，容器崩溃时整个 session 状态丢失，客户无法在自己的 VPC 里部署（因为 harness 假设所有资源都在本地，强制要求客户与 Anthropic 做网络对等连接）。

重构后的架构拆成了三个标准化的接口：

**Session（会话）**：一个 append-only 的事件日志，独立于模型的上下文窗口存在。harness 通过 `emitEvent(id, event)` 写入持久状态，通过 `getEvents()` 按位置切片读取。Session 不关心上下文压缩、prompt caching 这些"怎么喂给模型"的工程决策——它只负责可靠地记录发生了什么。

**Harness（编排层）**：无状态的协调者，负责从 session 读取事件、组装上下文、调用模型、分发工具调用。harness 本身可以崩溃——因为 session 日志完整保留了所有状态，新的 harness 实例通过 `wake(sessionId)` + `getSession(id)` 就能从最后一个事件接续。

**Sandbox（执行环境）**：被彻底降格为无状态的可替换资源。harness 调用 sandbox 的唯一接口是 `execute(name, input) → string`——一个标准化的工具调用，返回字符串。如果容器死了，不做任何抢救，直接 `provision({resources})` 起一个新的。

### 手脑分离如何解决五个挑战

这个三层拆分不是一个抽象的架构练习——它精准地对应了前面五个挑战：

**冷启动**：手脑耦合时，每个 session 启动都必须先付出容器准备的成本（clone 仓库、装依赖、启动进程），用户要等几十秒才能看到第一个 token。手脑分离后，推理立即开始——harness 从 session 读取事件、调模型、返回第一个 token，整个过程无需等待 sandbox。只有当模型决定需要执行代码时，才按需 `provision` sandbox。这个改变让 **p50 TTFT 下降约 60%，p95 TTFT 下降超过 90%**。

**凭证隔离**：手脑耦合时，所有凭证都在容器环境变量里，一次 prompt injection 就能全部窃取。手脑分离后，凭证在架构层面不可能到达 sandbox——不是配置约束，而是物理上不存在通路。挑战二中 Claude Code 的 mask/deny 是"尽量让你看不到"，这里是"根本没有东西可以看"。

**长任务与状态管理**：harness 是无状态的，所有状态都外化到 session 的事件日志中——这同时解决了挑战五的上下文窗口问题。完整事件流在服务端持久化作为 source of truth，模型的上下文窗口只是一个"视图层"，内置的 prompt caching 和 compaction 机制自动压缩历史，Agent "醒来"后从压缩后的上下文继续，而非重放完整历史。

**崩溃恢复**：sandbox 的死亡被设计为预期内的事件。`execute()` 调用失败后，错误作为标准的 tool-call error 返回给模型，由模型自主决定是重试还是请求新的 sandbox。不需要基础设施层面的抢救逻辑——Agent 自己就是恢复策略的一部分。

**VPC 兼容**：手脑耦合时，harness 假设所有资源在本地，强制要求网络对等连接。把 harness 从容器中移除后，外部资源的访问走代理路由，客户不再需要暴露自己的 VPC。

### Meta-Harness：对抗 Harness 腐烂

Anthropic 还有一个更深的洞察："Harnesses encode assumptions that go stale"——编排逻辑编码了对模型能力的假设，而模型每几个月就升级一次，旧的假设会成为障碍。他们的解法是 meta-harness：一个不预设具体编排策略的框架层，让 harness 成为可热替换的组件——session 和 sandbox 是稳定的"硬件接口"，harness 是可以迭代的"驱动程序"。

### 对自研 Agent Runtime 的启示

手脑分离架构的核心启示不在于具体的接口设计，而在于一个架构原则：**把有状态的、需要持久的部分（session）和易变的、可以丢弃的部分（harness、sandbox）显式分离**。这让你可以在不改动状态层的前提下，独立演进编排逻辑和执行环境。

但要注意，Anthropic 的方案有一个隐含前提：Agent 的执行必须是可以被中断和重放的。如果你的 Agent 涉及不可逆的外部副作用（比如发送了一封邮件、触发了一个支付），那么 sandbox 死亡后的"起一个新的"策略需要额外的幂等性保证——这恰恰是 Crab 的 versioned manifest 和 fast-forward replay 试图解决的问题。

## 存储：贯穿所有挑战的隐藏维度

前面的五个挑战和手脑分离架构，都隐含地依赖一个没有被充分讨论的子系统：**存储**。快照恢复到什么粒度？环境如何在 session 之间复用？checkpoint 多了以后怎么管理？这些存储层面的决策，直接决定了冷启动、长任务、崩溃恢复等上层能力的实际表现。

### 快照的粒度问题：存什么，不存什么

快照恢复的核心矛盾是**恢复完整度 vs 操作复杂度**。当前业界存在三个粒度的快照方案，各有取舍：

**Filesystem-only（仅文件系统）**：只保存磁盘状态，丢弃内存和进程。E2B 支持这种模式（`keepMemory: false`），创建速度更快、存储体积更小，但恢复时需要 cold boot——sandbox 重启后进程全部丢失，已打开的网络连接、数据库连接、运行中的服务全部要重新初始化。适合"只关心文件产物"的场景（比如保存编译结果、写好的代码），不适合需要保持进程状态的场景（比如正在监听端口的开发服务器）。

**Full snapshot（完整快照）**：同时保存文件系统和内存状态。E2B 的默认模式、Modal 的 memory snapshot（alpha）都走这条路。恢复时 sandbox 从内存镜像直接继续——但"直接继续"远比听起来困难：CRIU（Checkpoint/Restore in Userspace）在 TCP 连接重建、GPU 状态捕获、定时器一致性等方面都有已知限制，完整快照的工程复杂度远高于文件系统快照。

**Delta snapshot（增量快照）**：只保存两个 checkpoint 之间的差异。这是学术界的 DeltaBox 项目提出的方向——在 Firecracker microVM 之上，用修改过的 overlayfs（DeltaFS）实现运行时层栈重配（不需要 unmount），用 XFS reflink 做 4KB 粒度的 copy-on-write，使得未修改的数据块跨代共享引用。进程状态（DeltaCR）基于 CRIU 做异步增量内存转储，同时 `fork()` 一个冻结模板用于快速恢复。DeltaBox 的关键性能指标：checkpoint 的阻塞时间约 **14.57ms**，通过模板快速恢复约 **5.14ms**——它把异步内存转储隐藏在 LLM 推理的等待时间里，使得 checkpoint 对 Agent 执行几乎零感知。

三个粒度对应三种工程复杂度。Filesystem-only 最简单但恢复最弱，full snapshot 恢复最强但 CRIU 的工程挑战巨大，delta snapshot 在存储效率和性能上最优但实现复杂度最高。

### 环境复用：避免每次都从零开始

Agent 环境准备（clone 仓库、安装依赖、配置工具链）的耗时远超沙箱启动本身——现代 microVM 80ms 就能启动，但 `npm install` 一个大型项目可能需要 1-5 分钟。这个问题在规模化场景下被放大：如果同时有 1000 个 Agent session 都需要相同的依赖环境，每次都从头安装是不可接受的。

各方案形成了四种策略：**预构建模板**——E2B 用 Dockerfile 构建 VM 镜像推送到 registry，新 sandbox 从模板恢复内存快照实现 near-instant startup，代价是依赖列表必须预先知道；**运行时动态定义**——Modal 在创建时由代码（甚至 LLM 运行时）定义环境，灵活性最大但每次都要重新安装，配合 filesystem snapshot 复用；**持久卷挂载**——Modal Volumes、Daytona S3 volumes 把依赖目录挂载到共享卷上，跳过安装，但引入并发一致性难题；**镜像缓存 + 预热池**——ACS 用镜像缓存把 image pull 时间降 90% 以上，相同基础镜像共享底层 layer，这是传统容器编排的标准做法。

### 环境复用的前沿：投机准备

SpecBox 项目走得更激进：不等 Agent 发出工具调用，在 LLM 生成 token 的过程中就推测下一步需要什么环境。**Step 内预热**从部分 token 流推断工具需求，**跨 Step 预取**用一阶马尔可夫模型追踪工具调用转移概率，在当前工具还在执行时就预热下一步最可能的环境。本质是用预测换延迟——对 edit → test → fix 这样模式固定的 coding agent 效果显著。

### Checkpoint 的存储膨胀

一个跑了几百个 turn 的 Agent 可能有几百份快照，完整快照会让存储成本线性增长——4GB RAM 的沙箱每 turn 一份就是 400GB/100 turn。增量方案（DeltaBox 的 XFS reflink 4KB CoW、E2B 的 diff-based 存储、Fly.io Sprites 的 JuiceFS 分块 + NVMe 缓存）把实际增量压到几百 MB 级别，但引入了垃圾回收问题：当 Agent 的探索形成树状结构，哪些 checkpoint 不可达、可以安全删除？DeltaBox 用蒙特卡洛树搜索的可达性规则来剪枝。这个选择直接决定了大规模场景下存储成本是可控的还是不可控的。

### FUSE 挂载：让 Agent 用文件系统的方式访问一切

FUSE 是让远程对象存储以 POSIX 文件系统形态出现在 sandbox 内部的通用桥梁——Agent 天然熟悉 `ls`、`cat`、`grep`，数据源挂载成目录就 "just works"。Fly.io Sprites 的 JuiceFS（S3 之上的 FUSE 分布式文件系统 + NVMe 读缓存）、Vercel Sandbox 的 Mountpoint for S3、Daytona 的 S3-backed volumes 都走这条路。

代价是性能损耗和语义损失：每次 I/O 都要内核 → 用户态往返，对象存储的 list/prefix 降级为 `readdir()`，multipart upload 语义被 `write()` + `close()` 隐藏。但这个天花板正在被快速拉高——JuiceFS 单线程 2.4 GiB/s、20 线程 25.1 GiB/s，内核侧 iomap 集成让 fuse2fs 吞吐从 60-90MB/s 跃升到 2-2.5GB/s。

社区对 "everything is a file" vs 直接调 API 仍有分歧，但实际取决于 Agent 的 I/O 模式：读几个大文件 FUSE 完全够用，遍历十万个小文件的 `stat()` 风暴则会显著拖慢。从架构层面看，FUSE 正在从"不得已的兼容层"转变为"有意设计的统一存储接口"。

## 纵深案例：ACS Agent Sandbox 的安全工程

前面在挑战三中讨论了安全模型的方向反转和凭证代理的演进阶段。阿里云 ACS 的 Agent Sandbox 是目前公开文档中对"托管沙箱安全"最系统的工程实现，值得单独展开——它覆盖了阶段四（纵深防御 + 动态权限）的全部要素。

### 凭证代理体系：假凭证 + 出站替换

ACS 的核心设计是 `SecurityProfile` 中的 `tokenTransformation` 规则：沙箱内配置假 Token（如 `fake-token`、`FAKE_AK` / `FAKE_SK`），egress-gateway 拦截出站请求，匹配目标域名后从 K8s Secret 或 RRSA（RAM Roles for Service Accounts）获取真实凭证并替换。对于阿里云 API 调用，网关还会**重新计算请求签名**（SigV4），对应用完全透明。

这个设计比 Claude MA 的"凭证永远不进沙箱"更灵活——Agent 可以"以为"自己持有 AK/SK，正常调用阿里云 API，但实际上它持有的是占位符。代价是 egress-gateway 成为了关键的安全组件，必须保证：第一，假凭证永远不能意外泄露到沙箱之外；第二，网关的凭证替换逻辑不能被绕过。

### 阻断底层凭据泄露途径

ACS 还解决了一个容易被忽视的侧信道：云平台元数据服务。在阿里云 ECS 实例上，沙箱代码可以通过访问 `100.100.100.200`（元数据服务地址）获取宿主机的 RAM 角色临时凭证。如果沙箱跑在 ECS 上且没有阻断这个地址，Agent 就能窃取宿主机身份，横向移动到同账号下的其他资源。ACS 用 `GlobalTrafficPolicy` 最高优先级硬拒绝这个地址段。类似地，K8s ServiceAccount Token 也必须禁用（`automountServiceAccountToken: false`），环境变量中的 `KUBERNETES_SERVICE_HOST` 需要显式覆盖清洗，防止 Agent 获取集群 API 访问权限。

### STS 动态权限收窄

ACS 的 RAM 角色管理采用两层模型：第一层是 RAM 控制台创建的最大权限边界（覆盖所有 Sandbox 可能访问的资源范围）；第二层是集群内的 `CredentialProvider` CRD，必须是第一层的子集，且支持**模板变量**——根据每个 Sandbox 实例的 Label 动态生成仅针对特定子路径的 STS Token。这意味着同一个 Sandbox Pool 中的不同租户，拿到的 STS Token 只能访问各自的 OSS 子目录，权限在签发时就已经收窄到最小范围。

### 网络微隔离与 HTTPS 拦截

沙箱算力被划为"不可信"网络分区：专属 VSwitch（不与控制面混用）、企业级安全组（默认组内隔离，防止沙箱间横向移动）、L4 微隔离（TrafficPolicy 默认 deny 所有私有网段 10.0.0.0/8、172.16.0.0/12、192.168.0.0/16，仅白名单放行 DNS 和系统组件）。在 L7 层，自动注入的 `traffic-proxy` Sidecar 做 HTTPS 拦截——TLS termination 后匹配规则，封锁 `/admin`、`/console` 等管理路径，限制 HTTP 方法（只读模式拦截 POST/PUT/DELETE），然后重新加密转发。

### 数据隔离：CSI 动态挂载 + 身份鉴权

多租户共享 OSS 存储时，ACS 通过 `subPath` + 独立的 `CredentialProvider` 实现租户级数据隔离——不同租户挂载同一个 PV，但各自只能访问自己的子目录。PV 配置中不挂载任何长期静态 AccessKey（`authType: agent-identity`），通过 RRSA + SigV4 动态签名，彻底消除密钥落盘风险。

### 纵深防御的本质

ACS 的方案揭示了一个现实：在托管 Agent 服务中，安全问题需要从网络层（VSwitch/安全组/TrafficPolicy）、凭证层（fake token + egress gateway）、存储层（CSI + 身份鉴权）、入站层（JWT 动态令牌）构建完整的纵深防御。任何一个层的缺失都可能成为突破口。

## 方案对比：各家如何取舍

| 维度 | Claude MA | E2B | Modal | Daytona | 阿里云 FC | ACS Agent Sandbox | Vercel Sandbox | Fly.io Sprites |
|------|-----------|-----|-------|---------|----------|-------------------|----------------|----------------|
| **沙箱技术** | 托管隔离环境 | Firecracker microVM | Serverless container | 容器化 workspace | MicroVM + X-Dragon | MicroVM + X-Dragon | Firecracker microVM | Firecracker microVM |
| **冷启动** | 持久化 sandbox | 80-200ms | Sub-second | <90ms | 镜像缓存 + warm pool | 镜像缓存 + warm pool | 状态快照恢复 | VM checkpoint 恢复 |
| **长任务** | 支持，含 cron | 基础 24h | Snapshot 延展窗口 | Auto-stop on idle | Snapshot 热唤醒 | Session 级物理隔离 | 状态快照 | VM pause/resume，无上限 |
| **快照粒度** | 事件流级 | Full / FS-only 两档 | Dir / FS / Memory 三档 | Snapshot → OCI registry | Snapshot 热唤醒 | Memory checkpoint | 状态快照 | VM 级 checkpoint |
| **环境复用** | 持久化 sandbox | 预构建 Template | 代码动态定义 + FS snapshot | S3 Volumes | 镜像缓存共享 layer | 镜像缓存共享 layer | FUSE 挂载 S3 | JuiceFS + NVMe 缓存 |
| **凭证隔离** | 架构级 vault + proxy | 用户自行管理 | Built-in tunnelling | 用户自行管理 | 可禁用 STS Token | fake token + egress 替换 + STS 收窄 | 用户自行管理 | 用户自行管理 |
| **安全纵深** | 手脑分离架构保证 | L1 隔离为主 | L1 隔离为主 | L1 隔离为主 | 硬件级隔离 | 7 层全覆盖（详见纵深案例） | Firecracker + 网络管控 | VM 级隔离 |
| **编排模型** | 手脑分离三层接口 | SDK 嵌入 | Python 函数定义 | API 驱动 | Serverless 函数 | K8s CRD 声明式 | 平台托管 | API 驱动 |
| **自主扩展** | Anthropic 管理 | 0→10,000+ 并发 | 0→10,000+ 并发 | 弹性分布式 | 弹性伸缩 | K8s 弹性调度 | 平台托管 | 按需 VM |

几个值得注意的差异：**E2B / Daytona / Modal** 定位 sandbox-as-a-service——隔离之外的状态管理、凭证安全、长任务调度都留给你的应用层；**Claude MA** 是唯一在架构层面实现手脑分离的方案，代价是无法自定义 harness 推理策略；**阿里云 FC / ACS** 是国内外适配最深的组合——FC 做 Serverless 层的 Agent 场景优化（Snapshot 热唤醒、MCP SSE 亲和），ACS 做 K8s 层的纵深防御；**Fly.io Sprites** 在状态持久化上走得最远（VM 级 checkpoint/restore，session 无上限）但复杂度也最高；**Vercel Sandbox** 的双轨制（可信代码走 Functions，AI 代码走 Firecracker）是务实的信任分级。

**没有一个方案**完美解决了所有挑战。这是 Agent Infra 仍需要持续投入的根本原因——不是某个单点技术不成熟，而是挑战之间的耦合让系统设计极其复杂：优化长任务 checkpoint 可能拖慢冷启动，加强凭证隔离可能增加 loop 延迟，持久化状态可能与安全隔离冲突。

## 小结

Sandbox 从隔离容器演进为 Agent Runtime，本质上是在要求一个容器具备操作系统的核心能力——进程调度、状态管理、安全代理——但保持容器的轻量。Anthropic 的工程实践给出了最清晰的架构回答：把手和脑显式分离——推理和编排（脑）是无状态可替换的进程，状态外化到 session 事件日志，执行环境（手）降格为按需 provision 的资源。这让 p50 TTFT 下降 60%、p95 下降 90%，同时从架构层面解决了凭证泄露和崩溃恢复。

对于正在构建 Agent Infra 的团队，五个关键决策点：**Agent Loop 在沙箱内还是沙箱外**（配置级 vs 架构级安全）；**长任务间歇性怎么处理**（保活 / 销毁重建 / checkpoint-restore 三难）；**隔离技术选型**（容器 vs microVM，取决于代码信任级别）；**凭证代理选型**（阶段三 vs 阶段四，取决于是否需要访问云资源）；**快照粒度**（FS-only / Full / Delta，直接影响冷启动、连续性和存储成本）。

这些选择没有标准答案，但理解每个选择的 trade-off 是做好 Agent Infra 的前提。而 Anthropic 的手脑分离架构至少证明了一件事：面对 Sandbox-as-Agent-Runtime 的挑战，最有力的武器不是更强的隔离技术，而是更清晰的架构分层。

## 工程落地：OpenAgentPack

这篇文章讨论的是"如何构建 Agent Infra"。但如果你站在各家 Managed Agents 之上——它们已经替你解决了冷启动、长任务、凭证隔离这些基础设施问题——一个自然的追问是：**谁来管理这些 Agent 本身？**

[OpenAgentPack](https://github.com/modelstudioai/OpenAgentPack) 是我们开源的一个答案——一个面向托管 AI Agent 的 IaC 控制平面。它把这篇文章里的架构原则落成了可操作的工程工具：

**手脑分离的声明式表达**。Agent 的"脑"（模型、指令、工具、Skills、MCP 接线、记忆）声明在 `agents.yaml` 里，"手"（执行沙箱环境）是独立的 `environment` 资源，两者只在 session 创建时通过 SessionBindings 绑定——与 Anthropic 的三层接口同构，但抽象成了可 diff、可 review 的 Git 资产。沙箱还可以是 BYOC 的自建环境，OpenAgentPack 只引用、不接管其生命周期。

**凭证不进配置**。密钥在 YAML 里只是 `${VAR}` 引用，实际值存放在平台侧的 vault 中——对应文章中的"阶段三：凭证代理"，且天然支持跨环境复用同一份声明。

**跨平台可移植**。同一份声明渲染到百炼、Qoder、Claude、火山引擎 Ark 四个平台。`validate → plan → apply → destroy` 的 Terraform 式工作流，配合内容哈希 diff 和漂移检测，让 Agent 变更第一次有了变更治理：可审查、可回滚、可追溯。

当 Agent 从实验品变成生产资产时，它的变更频率和影响面都逼近了传统微服务——但大部分团队的 Agent 仍躺在各家控制台的 GUI 里，没有版本、没有 review、没有回滚。OpenAgentPack 试图用 Git 和 YAML 回答这个问题：Agent 资产变更的治理权，应该回到工程师手里。

项目处于 beta 阶段，Apache-2.0 开源，欢迎 star、试用和反馈。

## 参考资料

#### 隔离技术演进

- [Kata Containers vs Firecracker vs gVisor](https://northflank.com/blog/kata-containers-vs-firecracker-vs-gvisor) — 三种容器隔离技术的启动速度、内存开销、安全模型对比
- [What is AWS Firecracker](https://northflank.com/blog/what-is-aws-firecracker) — Firecracker 架构详解：125ms 启动、<5MiB 开销、jailer 多层防御
- [Your Container Is Not a Sandbox](https://emirb.github.io/blog/microvm-2026/) — 容器 vs microVM 隔离本质差异，Firecracker 生态全景
- [MicroVM vs Container: How to Isolate AI-Generated Code](https://vercel.com/i/microvm-vs-container) — Vercel 对 microVM 与容器隔离的分析

#### 各厂商隔离选型

- [How Workers Works](https://developers.cloudflare.com/workers/reference/how-workers-works/) — Cloudflare Workers V8 Isolates 架构：进程内隔离、<5ms 启动
- [Cloudflare Workers Security Model](https://developers.cloudflare.com/workers/reference/security-model/) — Spectre 缓解、cordons 分组、namespace+seccomp 第二道防线
- [V8 Isolates for AI Agents](https://www.kunalganglani.com/blog/cloudflare-workers-v8-isolates-ai-agents) — V8 Isolates 性能与限制分析
- [函数计算安全隔离](https://help.aliyun.com/zh/functioncompute/fc/how-is-security-guaranteed) — 阿里云 FC 虚拟机级别隔离（非容器级别）
- [函数计算进化之路：AI Sandbox 新基座](https://developer.aliyun.com/article/1682182) — FC 的 X-Dragon 硬件卸载、MicroVM 安全容器、Snapshot 热唤醒、MCP SSE 亲和
- [Container Compute Service: Agent Sandbox](https://www.alibabacloud.com/help/en/cs/user-guide/agent-sandbox/) — ACS Agent Sandbox：镜像缓存降 90%、15000/min 创建、memory checkpoint

#### Claude Code / OpenAI Codex 沙箱

- [Claude Code Sandboxing](https://code.claude.com/docs/en/sandboxing) — macOS Seatbelt / Linux bubblewrap+socat 双层沙箱、mask/deny 凭证策略
- [Claude Code Sandbox Environments](https://code.claude.com/docs/en/sandbox-environments) — 从 native bash 限制到 microVM 的多级沙箱选项
- [Sandboxing Claude Code CLI on Linux](https://labs.esokia.com/post/sandboxing-claude-code-cli-linux-bubblewrap/) — bubblewrap 双层架构详解
- [How Claude Code Escapes Its Sandbox](https://ona.com/stories/how-claude-code-escapes-its-own-denylist-and-sandbox) — /proc/self/root 绕过 denylist、ld-linux.so mmap 绕过 execve
- [Sandlock: Confining AI Agent Code with Unprivileged Linux Primitives](https://arxiv.org/html/2605.26298v1) — Landlock+seccomp 替代 bubblewrap，6ms 启动，无需 namespace
- [Sandboxing AI Agents in Linux](https://blog.senko.net/sandboxing-ai-agents-in-linux) — bubblewrap 实战配置与局限分析
- [Coding Agents: Why Bubblewrap Wraps Agents](https://palaimon.io/blog/coding-agents-bubblewrap-deep-dive/) — bubblewrap 内部机制、与 Docker/Firecracker 对比

#### Claude Managed Agents

- [Anthropic Engineering: Managed Agents](https://www.anthropic.com/engineering/managed-agents) — 手脑分离架构原始论文：session/harness/sandbox 三层接口、p50 TTFT -60%
- [Claude Managed Agents Overview](https://platform.claude.com/docs/en/managed-agents/overview) — 官方文档：SSE 事件流、凭证 vault、cron 调度
- [Claude MA vs LangGraph vs CrewAI](https://till-freitag.com/en/blog/agent-runtime-comparison) — 编排模型、状态管理、凭证隔离横向对比
- [Inside Claude Managed Agents](https://pluto.security/blog/inside-claude-managed-agents/) — vault 架构详解：write-only secrets、proxy 注入、结构性防 prompt injection

#### 长任务与状态管理

- [Crab: Semantics-Aware Checkpoint/Restore Runtime for Agent Sandboxes](https://arxiv.org/html/2604.28138v1) — Coordinator+eBPF Inspector+C/R Engine、fast-forward replay、versioned manifest
- [Best Stateful Sandboxes for Long-Running Agent Sessions](https://modal.com/resources/best-stateful-sandboxes-long-running-agent-sessions) — Modal/Fly.io/Blaxel/Runloop/E2B 长任务方案对比
- [Fly.io Sprites: Design & Implementation](https://fly.io/blog/design-and-implementation/) — JuiceFS+S3 存储架构、元数据级 checkpoint/restore、NVMe 读缓存

#### 存储与快照

- [E2B Sandbox Snapshots](https://docs.e2b.dev/sandbox/snapshots) — full snapshot：文件系统+内存、pause 期间断连
- [E2B Filesystem-only Snapshots](https://docs.e2b.dev/sandbox/filesystem-only-snapshots) — 仅磁盘快照、cold boot 恢复、keepMemory: false
- [DeltaBox: Scaling Stateful AI Agents with Millisecond-Level Checkpoints](https://arxiv.org/html/2605.22781v1) — DeltaFS+DeltaCR、XFS reflink 4KB CoW、checkpoint 阻塞 14.57ms / 恢复 5.14ms
- [SpecBox: Speculative Sandbox Scheduling for Efficient LLM Agent Serving](https://arxiv.org/html/2607.23933v2) — Step 内预热 + 跨 Step 马尔可夫预取、语义缓存
- [Behind the Scenes of Modal Sandboxes](https://www.amplifypartners.com/blog-posts/behind-the-scenes-of-modal-sandboxes) — Modal 三种快照原语：Directory / Filesystem / Memory
- [Checkpoint/Restore Systems: Evolution and Applications in AI Agents](https://eunomia.dev/zh/blog/2025/05/11/checkpoint-restore-systems-evolution-techniques-and-applications-in-ai-agents/) — CRIU 技术详解：TCP Repair、GPU checkpoint、timerfd 恢复

#### FUSE 与远程存储

- [JuiceFS Architecture](https://juicefs.com/docs/community/architecture/) — FUSE 分布式文件系统：64MB chunk、元数据引擎、碎片整理
- [JuiceFS: Design Journey of FUSE](https://juicefs.com/en/blog/engineering/design-fuse-kernel-user-space) — FUSE 内核↔用户态开销分析、单线程 2.4 GiB/s、20 线程 25.1 GiB/s
- [Vercel Sandbox: Mount Remote Storage](https://vercel.com/docs/sandbox/mount-remote-storage) — Mountpoint for S3 FUSE 集成、firewall 策略管控
- [DFUSE: Strongly Consistent Write-Back Kernel Caching](https://arxiv.org/html/2503.18191v3) — 分布式租约、吞吐 +68%、延迟 -40.4%
- [Toward Fast, Containerized, User-Space Filesystems](https://lwn.net/Articles/1044432/) — iomap 集成让 fuse2fs 从 60-90MB/s 跃升到 2-2.5GB/s

#### 安全与凭证隔离

- [ACS Agent Sandbox 安全最佳实践](https://help.aliyun.com/zh/cs/user-guide/acs-agent-sandbox-security-best-practices) — fake token + egress 替换、STS 动态收窄、元数据服务阻断、网络微隔离
- [Agent Sandbox Taxonomy (AST)](https://github.com/kajogo777/the-agent-sandbox-taxonomy) — 7-7-3 框架：7 层防御 × 7 类威胁 × 3 评估维度
- [Cracks in the Bedrock: Escaping AWS AgentCore Sandbox](https://unit42.paloaltonetworks.com/bypass-of-aws-sandbox-network-isolation-mode/) — MMDS SSRF 凭证窃取、DNS 隧道外泄
- [Credential Theft in AWS Bedrock AgentCore](https://sonraisecurity.com/blog/sandboxed-to-compromised-new-research-exposes-credential-exfiltration-paths-in-aws-code-interpreters/) — 代码解释器中的凭证外泄路径
- [Hardware-Bound Identity for AI Agents](https://www.beyondidentity.com/resource/the-attacker-gave-claude-their-api-key-why-ai-agents-need-hardware-bound-identity) — TPM/Secure Enclave + DPoP 来源证明
- [The Balkanization of Execution-Security Research](https://arxiv.org/html/2607.05743v1) — 39 项研究综述：碎片化、69-98.6% 黑名单脆弱、权限模型忽略人为错误