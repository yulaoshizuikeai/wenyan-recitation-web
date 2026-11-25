# AGENTS.md

给在此仓库工作的 AI Agent 的说明。改动代码前请先读本文件。

## 项目概况

高中古诗文背诵 Web 应用，纯前端离线应用。

- 技术栈：React 19 + TypeScript + Vite + Tailwind CSS 4 + IndexedDB（idb）+ FSRS-5
- 零网络请求、零后端；数据全部存在浏览器本地 IndexedDB
- 收录 100 篇古诗文，11 册教材
- 部署：Cloudflare Pages，构建产物在 `dist/`

## 必须遵守的规则

### 1. 每次改动都要写更新日志

任何代码或内容改动完成后，**必须**在根目录 `CHANGELOG.md` 中追加记录：

- 未发版的新改动写在顶部的 `## [未发布]` 段落里；
- 按 `### 新增` / `### 变更` / `### 修复` 分类；
- 每条写清楚「改了什么」和「为什么改」，不要只写"优化代码"这种空话；
- 发版时把「未发布」的内容归入新的版本号与日期。

### 2. 文案风格

- 中文文案用平实白话，不用"本文通过……表达了……"这类套话，不写伪学术腔。
- 面向学生的说明要具体，能落地。

### 3. 数据文件的边界

- `src/data/curriculumData.ts` 是自动生成的文件，不要手工改动其中的正文内容；需要补充数据时另建文件。
- `src/data/learningContent/part1~5.ts` 是分片的注音与理解数据，由 `articlePhonetics.ts` / `articleUnderstanding.ts` 聚合导出。
- 修改篇目数据后，需保证 `ARTICLE_PHONETICS`、`ARTICLE_UNDERSTANDING` 的 key 覆盖全部 100 个 articleId，且 `paragraphGists.length` 与 `article.paragraphs.length` 一致。

### 4. 架构约定

- 算法与业务逻辑放在 `src/domain/`（fsrs、cloze、recommend），不要塞进视图组件。
- 视图在 `src/views/`，通用弹层/组件在 `src/components/`。
- 保持纯前端离线：不要引入后端服务或运行时外部 API 依赖。

## 常用命令

```bash
npm install       # 安装依赖
npm run dev       # 本地开发，http://localhost:5173
npm run build     # 类型检查 + 生产构建，产物在 dist/
npm run deploy    # 部署到 Cloudflare Pages
```

## 关键文件

- 背诵模式：`src/views/SnowballView.tsx`（滚雪球）、`ClozeView.tsx`（渐进遮挡/刻漏字）、`FlipCardView.tsx`（闪卡与 Anki 牌组背诵）、`ScenarioView.tsx`（情境默写）、`CramModeView.tsx`（考前突击）
- 牌组主控台：`src/components/AnkiDeckHub.tsx`（选册层级展开、三色指标统计、每日排程导览）
- 选册数据架构：`src/data/ankiDecks.ts`（6 大选册与高考 72 篇专项分组、牌组统计计算）
- 挖空引擎：`src/domain/cloze/clozeEngine.ts`
- FSRS 算法与排程：`src/domain/fsrs/fsrsEngine.ts`、`ankiScheduler.ts`（每日新学/复习配额调度与会话内错词循环）
- 模式推荐：`src/domain/recommend/modeRecommender.ts`
- 本地存储：`src/storage/db.ts`、`sessionTracker.ts`
- 学习内容数据：`src/data/articlePhonetics.ts`、`src/data/articleUnderstanding.ts`

## 验证要求

改动后至少执行 `npm run build`，确保 TypeScript 类型检查与构建通过。
