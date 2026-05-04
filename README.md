# Heimanba Blog

基于 Astro 的个人博客，部署目标为 GitHub Pages。

## 本地开发

```sh
npm install
npm run dev
```

默认开发地址是 `http://localhost:4321`。

## 常用命令

```sh
npm run dev
npm run check
npm run build
npm run preview
```

## 部署说明

仓库里已经包含 GitHub Pages 工作流：[deploy.yml](/Users/mamba/workspace/heimanba.github.io/.github/workflows/deploy.yml)。

推送到 `main` 分支后，GitHub Actions 会自动执行：

- `npm ci`
- `npm run check`
- `npm run build`
- 发布 `dist/` 到 GitHub Pages

如果这是你的用户主页仓库 `heimanba.github.io`，最终地址就是：

- [https://heimanba.github.io](https://heimanba.github.io)

如果 GitHub Pages 还没启用，需要在仓库设置里把 Pages 的构建来源切到 `GitHub Actions`。

## 内容位置

- 首页：[src/pages/index.astro](/Users/mamba/workspace/heimanba.github.io/src/pages/index.astro)
- 关于页：[src/pages/about.astro](/Users/mamba/workspace/heimanba.github.io/src/pages/about.astro)
- 文章目录：[src/content/blog](/Users/mamba/workspace/heimanba.github.io/src/content/blog)
- 站点常量：[src/consts.ts](/Users/mamba/workspace/heimanba.github.io/src/consts.ts)
