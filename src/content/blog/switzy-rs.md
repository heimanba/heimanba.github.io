---
title: '用 Rust 写了一个顺手的 Git 身份切换小工具：switzy-rs'
description: '4 月 20 日写的一个小工具，把 Git 身份和 SSH key 收进可切换的 profile，尽量减少多账号开发里的低级错误。'
pubDate: 'Apr 20 2026'
---

最近写了个小工具叫 `switzy-rs`，用来解决一个挺常见但很容易被忽略的问题。

我平时要维护个人项目、公司项目，还有一些开源仓库，Git 身份来回切换很频繁。时间一长发现，最烦的不是写代码，而是那些琐碎又容易出错的 Git 配置——比如 commit 完才发现邮箱配错了，或者 SSH key 没切过来。

比如：

- 个人仓库要用个人邮箱，公司仓库要用公司邮箱。
- 某些项目要配专门的 SSH key。
- commit 之后才发现 `user.email` 写错了，改历史记录很烦。
- 新机器上还得重新整理 Git、SSH key、`ssh-agent`，步骤零散又容易漏。

这些问题都不大，但很烦，而且会反复出现。

所以我做 `switzy-rs` 的目标也很明确：把「Git 身份」和「SSH key」打包成一个可以保存、切换、复用的 profile。这样我不用每次都去手敲 `git config --global user.name`、`git config --global user.email`、`core.sshCommand`，而是先把身份存好，之后一条命令切过去。

## 它是怎么工作的

先加一个 profile：

```sh
switzy profile add \
  --profile-name work \
  --user-name "Jane Developer" \
  --email jane@company.example \
  --ssh-key ~/.ssh/id_ed25519_work
```

之后切换时只需要：

```sh
switzy profile switch work
```

切换时，`switzy-rs` 会把对应的 Git 全局配置写好；如果 profile 里配了 SSH key，也会尝试把 key 加进 `ssh-agent`。本质上它没有发明什么新系统，而是把原本分散在 Git 和 OpenSSH 里的常用操作，收拢成了一个更顺手的命令行入口。

## 它解决了什么问题

### 1. 避免 Git 身份用错

多身份开发时，最常见的问题就是作者信息错了。比如你在公司项目里带上了个人邮箱，或者在开源仓库里用了公司身份。这种错误往往不是提交前就能发现，而是推送后、Review 时，甚至更晚才暴露出来。

`switzy-rs` 的思路很朴素：把身份固化成 profile，让切换动作尽量稳定、低成本。比起临时手改几条 `git config`，我更相信一个已经保存好的配置。

### 2. 把 Git 身份和 SSH key 绑在一起

Git 身份和 SSH key 平时分散在不同地方：一个在 Git config 里，一个在 `~/.ssh` 和 `ssh-agent` 里。但实际使用时，它们经常又必须成对出现。

比如：

- 公司 GitLab 要用公司邮箱和公司 SSH key。
- GitHub 个人账号要用个人邮箱和个人 SSH key。
- 某些客户项目甚至需要单独的邮箱和单独的 key。

所以在 `switzy-rs` 里，一个 profile 不只是 `user.name` 和 `user.email`，还可以一起保存 SSH 私钥路径、signing key 等信息。切换时一起处理，能减少那种“Git 身份切对了，但 SSH 还是另一个账号”的隐性错误。

### 3. 降低新机器配置成本

除了切换身份，我还顺手把几个常见操作也做进去了，比如导入当前身份、列出 profile、识别当前使用中的 profile、生成 SSH key、查看公钥等。

例如可以直接导入当前 Git 全局身份：

```sh
switzy profile import-current --profile-name personal
```

也可以生成新的 SSH key：

```sh
switzy ssh generate \
  --type ed25519 \
  --email jane@company.example \
  --filename id_ed25519_work
```

这样换电脑或者新开开发环境时，不用再把这些步骤拆散到多个工具里慢慢做。

### 4. 让当前身份更可见

手动配置还有一个问题：你经常不知道自己现在到底处于哪个身份。

所以 `switzy-rs` 也支持根据当前 Git 全局配置推断正在使用的 profile：

```sh
switzy profile current
```

进一个重要仓库前先看一眼，能省掉不少低级但代价不低的错误。

## 为什么用 Rust

这个项目用 Rust，原因其实不复杂。

第一，它很适合这种高频、小操作的 CLI。像切 profile、看当前身份、打印公钥这种命令，理想状态就是想起来敲一下，然后立刻返回。Rust 编译后的二进制启动很快，这种体验很适合工具类项目。

第二，它分发简单。`switzy-rs` 这种基础工具，越轻越好。一个二进制文件放进 PATH 就能用，不需要额外装 Node.js、Python 虚拟环境或者别的运行时，这点对日常工具来说很省心。

另外，这类配置工具虽然不大，但一旦出错，影响的是 commit 历史、SSH 登录和权限。Rust 在错误处理和边界约束上的优势，也让我更放心一点。

## 简单演示

### 查看 profile 命令帮助

![](https://img.alicdn.com/imgextra/i1/O1CN01UcCOef1XWS0Cb5GAF_!!6000000002931-2-tps-1392-598.png)

### 添加 profile

```sh
switzy profile add [OPTIONS] --user-name <USER_NAME> --email <EMAIL>
```

![](https://img.alicdn.com/imgextra/i3/O1CN01TCTquq215N3cltQB5_!!6000000006933-2-tps-1886-924.png)

### 切换 profile 并验证

```sh
switzy profile switch work
switzy profile current
```

![](https://img.alicdn.com/imgextra/i1/O1CN01LLTLVO1dE1lVzFl5v_!!6000000003703-2-tps-2100-734.png)

### SSH key 管理

`switzy-rs` 也提供了几个常用的 SSH key 管理命令，把生成、查看、管理这些动作统一放进 CLI 里。

#### 列出已有 SSH key

```sh
switzy ssh list
```

![](https://img.alicdn.com/imgextra/i3/O1CN01HtYXlZ1XUA1QX3WOL_!!6000000002926-2-tps-1712-264.png)

#### 生成新的 SSH key

```sh
switzy ssh generate --type ecdsa --email "example@company.com" --filename id_work
```

![](https://img.alicdn.com/imgextra/i4/O1CN01aH2yDk1w5Iv9tdfsA_!!6000000006256-2-tps-1696-594.png)

#### 查看公钥内容

```sh
switzy ssh public id_work
```

![](https://img.alicdn.com/imgextra/i3/O1CN01hQ73XU1nx2qvBNC7p_!!6000000005155-2-tps-2290-154.png)

## 适合谁用

如果你只在一台机器上长期使用一个 Git 身份，那手动配置其实就够了。

但如果你和我一样，会在个人项目、公司项目、客户项目、开源仓库之间来回切，`switzy-rs` 这种 profile 化管理就很实用。它不是什么复杂的大工具，价值也不在功能有多重，而在于它能稳定地帮你减少那些重复的小操作，以及由这些小操作带来的低级错误。

## 小结

`switzy-rs` 本质上是在解决一个很小、但很真实的问题：Git 身份和 SSH key 切换太琐碎，也太容易出错。

我做它，不是为了重新发明 Git 或 SSH，而是想把这些本来就存在的能力，整理成一个更顺手的日常工具。如果你也经常在多个身份之间切换，它应该正好能帮你省掉一些烦人的细节。

## 项目地址

- GitHub: https://github.com/heimanba/switzy-rs
