---
title: '3DSkyForge：基于阿里云百炼，把脑中的航空武器搬进浏览器'
description: '一次从 prompt 到图片、从图片到 3D 模型、再到一个未来感展示网站的完整实践，全程跑在阿里云百炼上。'
pubDate: 'May 16 2026'
---

受 <https://github.com/huangserva/3DCellForge> 启发，做了个航空武器版本，给小孩科普用。

项目地址：<https://github.com/heimanba/3DSkyForge>

## 视频演示

<video width="100%" height="560" controls="controls" src="//cloud.video.taobao.com/vod/VlBQU22k7WIXs4Ju5Fn8swIjgF7wf3ycXd-AXVqK4H8.mp4"></video>

## 整体思路

**文字 → 图片 → 3D 模型 → 展示网站**，每一步交给最合适的模型，自己只负责把它们粘起来。

## 一、在百炼上把 3D 模型造出来

### 1. 用 qwen3.6-plus 批量写 prompt

让大模型把"想看的航空武器"列出来，写成一份适合文生图的 prompt 清单，便于后续批处理。

完整的 prompt 清单放在仓库里：<https://github.com/heimanba/3DSkyForge/blob/master/public/aviation-models/README.md>

### 2. 用 Wan2.7-Image 文生图

把这批 prompt 丢给 Wan2.7-Image 出概念图，挑出合适的几张作为 3D 化的输入。

![](https://img.alicdn.com/imgextra/i2/O1CN01Vz1kBA1YkTkxu6XR3_!!6000000003097-2-tps-2502-1466.png)

这一步的关键不是出多漂亮的图，而是**留下一张"正面、干净、容易被 3D 化"的参考图**。背景越干净、主体越居中，后面 Tripo 出来的模型就越省事。

### 3. 用 Tripo-3D 把图片变成 GLB

百炼提供了 [Tripo-3D](https://help.aliyun.com/zh/model-studio/tripo-3d-generation-api-reference) 的图生 3D 接口，整个调用是异步的：先提交任务，再轮询结果。

提交任务：

```bash
curl --location 'https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/3d-generation' \
    -H 'X-DashScope-Async: enable' \
    -H "Authorization: Bearer sk-xx" \
    -H 'Content-Type: application/json' \
    -d '{
    "model": "Tripo/Tripo-P1.0",
    "input": {
        "image": "https://img.alicdn.com/imgextra/i1/O1CN01phtKfN1k6suD7tsI8_!!6000000004635-2-tps-2048-2048.png"
    },
    "parameters": {
        "texture_quality": "standard"
    }
}'
```

查询结果：

```bash
curl -X GET https://dashscope.aliyuncs.com/api/v1/tasks/<task_id> \
  --header "Authorization: Bearer sk-xx"
```

任务完成后，会返回一份 `.glb` 模型的下载地址，下载到本地放进 `public/aviation-models/` 就行，网站会直接从这里读。

## 二、让 AI 帮我把网站做出来

找了个气质接近的开源项目作参考，让 AI 在它的基础上重做。

参考项目：<https://github.com/huangserva/3DCellForge>

我给的指令大致是：

> 请先阅读一下这个 GitHub 项目，然后模仿这个项目，帮我做一个 3D 航空武器展示的网站，功能与原项目一致，语言改成中文，UI 重新调整为符合"未来科技"审美。相关模型在 `public/aviation-models/` 下的 `.glb` 文件。

为了让 UI 不那么"AI 感"，又额外指定了一份设计参考——x.ai 的 DESIGN.md，整体黑底、高对比、几何感，正好和航空武器的气质对得上：

<https://github.com/VoltAgent/awesome-design-md/blob/main/design-md/x.ai/DESIGN.md>

之后就是跑起来、调交互细节、把模型一个个塞进展示列表。

## 一些小体会

- **3D 化的成败在图片**：花时间挑参考图，比反复调 3D 参数划算。
- **设计风格交给现成的 DESIGN.md**：比自己空口描述"未来科技风"靠谱，AI 也更容易稳定复现。

## 资料

- 本项目：<https://github.com/heimanba/3DSkyForge>
- 灵感来源：<https://github.com/huangserva/3DCellForge>
- Tripo-3D API 文档：<https://help.aliyun.com/zh/model-studio/tripo-3d-generation-api-reference>
- 设计参考：<https://github.com/VoltAgent/awesome-design-md/blob/main/design-md/x.ai/DESIGN.md>
