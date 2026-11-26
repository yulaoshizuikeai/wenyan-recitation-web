# 更新日志

本项目的所有重要更改都记录在此文件中。

远端仓库：[yulaoshizuikeai/wenyan-recitation-web](https://github.com/yulaoshizuikeai/wenyan-recitation-web)

> **约定**：每次改动代码后，都要在顶部 `## [未发布]` 段落中追加一条记录，写清改了什么、为什么改。发版时再把「未发布」的内容归入新的版本段落并标注日期与提交号。

## [未发布]

## [1.1.0] - 2026-11-26

### 新增

- **长篇分段滚雪球与段间衔接卡（Track L3.2）**：在 `src/domain/cloze/snowballEngine.ts` 新增 `buildParagraphStages(article, paragraphIndex)`（同步支持 `SnowballChainingEngine.buildStages(article, { paragraphIndex })`）与 `buildBridgeCards(article)`，分别按自然段拆分滚雪球联次、生成「上段末句 → 默写下段首句」跨段接口卡；`buildSnowballCompletionPlan` 改按全局 `newlyAddedUnit.index` 匹配卡壳标记，确保分段结算与全篇卡壳下标一致。在 `src/views/SnowballView.tsx` 中，对 `paragraphs.length >= 3` 的长篇开放「全篇通滚 / 分段攻坚 / 段间衔接」三模切换与段落选择胶囊，支持单段独立结业沉淀 FSRS-5 并接续下一段，同时将卡壳标记、进度持久化与写卡接入 `studyStore`。新增 `tests/snowballParagraph.test.ts` 覆盖分段构建、单段结算与段间衔接卡生成。
- **跨模式记忆回流与高频卡壳急救包（L3.1）**：新增 `src/domain/fsrs/rescueQueue.ts`（导出 `buildRescueFlashcardQueue`、`buildRescueQueueEntries` 与 `findMatchingFlashcardsForText`）及单元测试 `tests/rescueQueue.test.ts`，聚合滚雪球 `bottlenecks`、抱佛脚 `stuck` 标记与高考情境默写错题，按多信号重合度与最近标记时间去重排序；在 `src/storage/db.ts` 与 `src/storage/studyStore.ts` 中新增 `scenario_wrong_items` 持久化及操作方法；在 `AnkiDeckHub.tsx`、`DashboardView.tsx`、`StudyAppContext.tsx`、`useFlipCardSession.ts` 与 `FlipCardView.tsx` 中接入「高频卡壳急救 (N 张)」一键专练入口与 `"rescue"` 队列模式。
- **高考默写错题自动降权与热力图联动**：在 `ScenarioView.tsx` 批改核对时调用 `studyStore.recordDailyActivity` 计入每日学习热力图；答错时记录 `scenario_wrong_items` 并对对应篇目/句子的匹配闪卡触发 FSRS `Rating.AGAIN` 降权与提前复习调度，答对时自动清除对应错题记录。
- **背诵结算联动本篇高考理解性默写（L3.3）**：新增 `src/components/ArticleScenarioLink.tsx`，通过 `getScenarioQuestionsByArticle(articleId)` 检索当前篇目关联的高考情境默写真题，并在 `FlipCardSettlement.tsx` 单篇背诵结算页挂载「顺手做 N 道本篇高考真题」联动入口；同时更新 `FlipCardView.tsx` 传入当前篇目 `articleId`，并在 `ScenarioView.tsx` 中支持按 `activeArticleId` 过滤显示对应篇目真题。
- **响应式客户端缓存层 `StudyStore`（Phase 3.1）**：新增 `src/storage/studyStore.ts`（导出 `studyStore`、`hydrateStudyStore` 与 `useStudyStore`）。应用启动时在 `StudyAppContext` 异步预水合 IndexedDB 的 `cards`、`daily_records`、`bottlenecks`、`settings` 至内存 `Map`（并发调用自动去重）；评分与进度变更先 0ms 乐观更新内存态并即时驱动各视图派生统计，再按序后台异步落盘，同时监听 `db.ts` 外部写入事件保持跨视图实时一致。
- **全量备份 Schema v2 与统一本地持久化（Phase 3.3）**：在 `src/storage/db.ts` 中新增 `getAllBottlenecks`、`getAllLogs`、`getAllSettings` 与 `exportAllProgress()`，将 JSON 备份升级至 `version: 2`，完整覆盖 `cards`、`records`、`logs`、`bottlenecks`、`settings` 以及 `localPreferences`（抱佛脚掌握标记、滚雪球进度、牌组展开状态、断点续学记录）；`importAllProgress()` 向下兼容 v1（无版本号或 `"1.0"`）与旧版 `"2.0.0"` 备份并支持全库事务性恢复。首次水合时自动将零散 `localStorage` 键值一次性迁移进统一 `settings` 存储并保留双向镜像。
- **客户端缓存与备份恢复单元测试**：新增 `tests/studyStoreAndBackup.test.ts`，覆盖 `StudyStore` 乐观更新、`Map` 引用稳定性、并发水合去重、跨模块写入同步、`localStorage` 一次性迁移以及 v1/v2 备份导入导出校验。

### 变更

- **核心视图接入内存缓存 0ms 派生**：`DashboardView.tsx`、`AnkiDeckHub.tsx`、`CatalogView.tsx` 与 `useFlipCardSession.ts` 改用 `useStudyStore()` 直接从内存 `Map` 派生统计与卡壳计数，移除每次挂载重复调用 `getAllCardStates()` 的开销；`CatalogView.tsx` 新增「状态」筛选条（未背诵 / 研习中 / 已熟记 / 含卡壳标记）；`CramModeView.tsx` 接入 `studyStore` 统一管理抱佛脚标记；`SettingsView.tsx` 切换至 `exportAllProgress()` / `importAllProgress()` v2，并在导入或重置后调用 `studyStore.refreshFromDB()` 刷新内存缓存。
- **全 100 篇理解串讲与难词注音改为按分片动态按需加载**：重构 `src/data/articlePhonetics.ts` 与 `src/data/articleUnderstanding.ts`，抽离 `src/data/learningContentLoader.ts` 维护轻量的 `articleId -> part1~5` 路由表与内存缓存，移除对 `part1~5.ts` 的静态聚合导入；同步更新 `PhoneticsPanel.tsx`、`UnderstandingCard.tsx`、`ClozeView.tsx`、`keywordExtractor.ts`、`flashcardGenerator.ts`、`FlipCardBody.tsx` 与 `tests/dataIntegrity.test.ts`，避免首屏与主工作区静态打包 ~128 KB 串讲注音语料，改为在打开注音/理解抽屉、进入刻漏字或翻转闪卡时按需拉取对应 20 篇分片。

### 修复

- **桌面端顶栏导航项与右侧控制区重叠遮挡**：修复在中宽屏（1024px~1360px 宽度区间，如部分笔记本屏幕）下，`Navbar.tsx` 中间导航栏（`flex-1`）与右侧搜索框、接续按钮、教材范围按钮宽度不足互相挤压重叠的样式缺陷。将 `<nav>` 改为 `shrink-0` 锁定基础间距，右侧接续按钮限制在超宽屏 `2xl` 展示，教材范围标签宽度自适应截断（`max-w-[130px] md:max-w-[160px]`），各元素添加 `shrink-0`，彻底根除遮挡。
- **FSRS 调度、跨模式急救队列与核心背诵算法边界修复**：
  - `src/domain/fsrs/fsrsEngine.ts`：改用本地年月日构造 `Date.UTC` 零点配合 `Math.round` 计算 `elapsedDays`，避免夏令时切换（23 小时日）把跨天误判为同一天；在 `REVIEW`+`EASY` 分支改用 `safeStability`/`safeDifficulty` 并为 `nextInterval`/`retrievability` 增加 `<= 0` 或非有限值保护，消除 `0 * Math.pow(0, -w9)` 导致的 `NaN`；先对 `GOOD` 间隔做 `applyFuzz` 再钳制 `EASY` 间隔下限，避免模糊扰动后出现 `EASY < GOOD` 倒挂。
  - `src/domain/fsrs/rescueQueue.ts`：在 `buildRescueQueueEntries` 中当 `verse.articleId` 未直接匹配到闪卡时按篇名与作者回退匹配 `ALL_ARTICLES`，避免遗留金句被静默丢弃。
  - `src/domain/cloze/clozeEngine.ts`：L1 关键词匹配前先对关键词执行 `trim()` 并去重（`Set`），避免含首尾空白的词条在 `startsWith`/`indexOf` 匹配时漏挖空。
  - `src/domain/cloze/snowballEngine.ts`：将 `bottleneckCount` 计数移至 `primaryId` 缺失与 `seenSegments`/`seenCardIds` 去重 `continue` 之后，并改用 `Math.max(0, updatedCards.length - bottleneckCount)` 计算 `smoothCount`，防止结算统计与真实写卡数错位；调整 `cleanSnowballUnitText` 清洗顺序，先剥离 `【填空正解】`/`【对句】` 再去除残留 `【`/`】`，修复正则失效问题。
  - `src/domain/scenario/diffEngine.ts`：批改对齐与 `findFailedKeyPointIndices` 统一改用 `Array.from(...)` 码点数组索引，避免四字节字符触发 UTF-16 下标偏移；扫描目标考点在标准答案中的所有出现位置，避免同一词在句中第二次写错时漏报提醒。
  - `src/sound/audioSynthesizer.ts`：处理 `AudioContext` 处于 `"closed"` 状态时的重建，为 `new AudioCtx()` 增加 `try/catch` 与 `resume().catch(() => {})` 容错，将发声逻辑收敛为 `playTones` 并在 `osc.onended` 中断开 `osc`/`gain` 节点，同时新增 `dispose()` 防止 WebAudio 资源泄漏。
- **语料数据、闪卡分句与按需加载缓存联动修复**：
  - `src/data/goldenVersesData.ts` & `src/data/articleRepository.ts`：修正《将进酒》《春江花月夜》《锦瑟》5 条错配的 `articleId`/`moduleId`，并导出 `resolveArticleIdForGoldenVerse` 作为兜底解析。
  - `src/data/scenarioData.ts` & `src/data/learningContent/part5.ts`：补全《兰亭集序》`gk_lanting_02` 漏字「丝竹」并更新考点关键词；在不改动自动生成文件 `curriculumData.ts` 的前提下，将《苦斋记》（`art_xx_29`）的 `gist` 与首段串讲对齐正文。
  - `src/data/flashcardGenerator.ts` & `scripts/generate-curriculum-index.mjs`：闪卡切句仅按 `，`/`：` 分句并保留原分隔符（不再被顿号 `、` 拆碎或把冒号覆写为逗号）；合并「青，…」「曰：…」等单字分句以及「嗟乎！」「呜呼！」等短感叹句，避免核心名句首句或短叹词被静默丢弃；多段拆卡的非末段改用非句末分隔符，避免重复拼接 `？`/`！`；同步更新索引脚本的标点集合与卡片计数逻辑并重新生成索引与分册分片。
  - `src/data/learningContentLoader.ts`、`src/data/flashcardCache.ts`、`src/data/articleRepository.ts`：在 `part1~5` 分片异步加载完成后触发缓存失效回调，避免之前缓存的空释义/空注音闪卡长期滞留；修复 `getCardsForArticles` 仅按长度判断全库缓存命中的问题，改为校验完整 `ARTICLE_INDEX` ID 序列。
  - `src/data/articleTaxonomy.ts`：在 `filterArticlesMulti` 中补齐按掌握度（`masteryStatus` / `matureCardIds`）筛选逻辑，并索引金句正文以支持在未加载正文分片时按名句检索篇目。
- **持久化并发竞态、状态同步与部署配置修复**：
  - `src/storage/db.ts`：`getDB()` 在 `openDB` 拒绝、`blocking` 和 `terminated` 时清理 `dbPromise` 并关闭旧连接，允许失败后恢复重连；`recordReviewLog()` 将 `logs` 与 `daily_records` 读写合并进同一读写事务，消除并发评分时的计数竞态；`mirrorPreferencesToLocalStorage()` 在全量恢复时清理多余的旧 `snowball_stage_*` 键与失效的 `wenyan_last_session`。
  - `src/storage/studyStore.ts`：仅在加载迁移成功后标记 `hydrated = true`，失败时保留 `false` 以便后续重试；在异步加载/刷新完成后重放期间产生的乐观脏数据并累加 `dailyRecords` 增量，防止初始化覆盖用户刚完成的评分；在迁移完成后停止回退读取旧 `localStorage`。
  - `src/storage/sessionTracker.ts`、`src/state/StudyAppContext.tsx`、`src/hooks/useFlipCardSession.ts` & `src/App.tsx`：为 `SessionExtra` 增加 `deckId`、`autoStart`、`filterArticleOnly`；用 `lastSyncedHashRef` 替代 `rAF` 标志消除 URL Hash 双向同步竞态；订阅数据库变更同步更新 `selectedScope` 与 `soundEnabled`，移除 React state updater 内的副作用；集中提供 `useRegisterModalOpen` 追踪本地弹窗以统一屏蔽全局快捷键；修复 `useFlipCardSession` 重复应用 `resumeExtra`、冷启动覆写空队列、切卡竞态及未清空 `isFlipped` 的问题；在 `App.tsx` 增加 `ViewErrorBoundary` 兜底块加载异常。
  - `wrangler.jsonc`、`public/_redirects` & `public/_headers`：改用 `pages_build_output_dir: "./dist"` 对齐 `wrangler pages deploy`，移除会用 `200 text/html` 劫持缺失 JS 分片的 `/* /index.html 200` 重定向，并为 `/index.html` 与 `/sw.js` 增加 `no-cache, no-store, must-revalidate` 响应头。
- **背诵视图状态清理、移动端适配与交互弹窗细节修复**：
  - `src/views/FlipCardView.tsx`、`ScenarioView.tsx`、`CramModeView.tsx`、`SnowballView.tsx`、`ClozeView.tsx`、`CatalogView.tsx`、`DashboardView.tsx` & `SettingsView.tsx`：补齐闪卡结算按 `queueMode` 续学与键盘 `repeat`/`SELECT` 隔离；修复高考默写带篇目筛选时错题下标错位、过期闭包及取消筛选横幅缺失；修复抱佛脚「只看易错」标熟时跳过下一条和定时器未清理问题；修复滚雪球切换篇目继承旧 `stageIndex`、翻联未重置显隐及 `hydrated` 依赖缺失；修复刻漏字切篇未重置状态及输入框 `key` 缺失；打通典库/概览页名句检索与直达分册/单篇闪卡学习；修复设置页每日配额输入 `NaN`、异步卸载保护及所有本地弹窗的 `Esc`/遮罩关闭与模态注册。
  - `src/components/Navbar.tsx`、`AnkiDeckHub.tsx`、`FlipCardBody.tsx`、`CramCardPractice.tsx`、`CramHeaderFilters.tsx`、`CommandPalette.tsx`、`TypingRecallInput.tsx`、`UnderstandingCard.tsx`、`StudyToolbar.tsx`、`ShortcutHelp.tsx`、`ArticlePickerModal.tsx`、`PhoneticsPanel.tsx` & `src/index.css`：补齐移动端抽屉全部 8 个主视图与教材范围入口，修复范围搜索词未清空及外部点击/Esc 收起；修复 `AnkiDeckHub` 折叠激活分册后被重新强制展开；用 CSS Grid 重构闪卡与抱佛脚 3D 翻面容器并移除 `.gpu-accelerate` 的 `backface-visibility: hidden` 与 `.animate-fade-slide-up` 残留 `transform`，消除翻面镜像、边框消失与弹窗层级被截断问题；修复 `CommandPalette` 全局捕获快捷键与 `Tab` 焦点陷阱、`TypingRecallInput` IME 组合输入与命中后失焦提示、`ShortcutHelp` 按 `?` 关闭、`StudyToolbar` 窄屏换行与 `CramHeaderFilters` 徽章对比度及输入框右侧留白。

### 新增

- **标准化多视图实体索引仓库（Phase 3.2）**：新增 `src/data/articleRepository.ts` 及单元测试 `tests/articleRepository.test.ts`。以 `articleId`、段落与句读索引（`segmentId` / `unitIndex` / `paragraphIndex`）为主键，统一只读关联全库 100 篇古诗文正文、`flashcardCache` 闪卡、`CORE_GOLDEN_VERSES` 高频金句（兼容历史 `articleId` 偏移的篇名回退匹配）及 `GAOKAO_SCENARIO_QUESTIONS` 高考情境真题；提供 `getArticleBundle` 与 `getBottleneckFlashcards`，支持将滚雪球标记的卡壳下标直接映射为跨模式急救闪卡队列。
- **高考情境默写 LCS / 编辑距离精准对齐与考点提示**：新增 `src/domain/scenario/diffEngine.ts`。基于动态规划最小编辑距离（Levenshtein DP）实现逐字对齐，精准区分「字对」「错字」「漏字」「多字」四种状态，彻底解决以往学生在句首或句中漏写或多写一个字导致后续写对的字符全部错位标红的问题；在批改不通过时，自动比对并高亮原题关联的 `keyPoints`（通假字、偏旁易混字等），给出针对性采分提醒。
- **文言关键词与虚词过滤引擎**：新增 `src/domain/cloze/keywordExtractor.ts`。抽离文言虚词表（24 个纯虚词）与标点判定，自动从难词注音表与注释中提取考点词眼，进行正文存在性校验与长词优先密度控制，并将分词结果按自然段拆分与分状态判定。
- **轻量应用状态层与 URL Hash 同步**：新增 `src/state/StudyAppContext.tsx`。集中管理视图模式、选篇、教材范围、主题、音效与弹窗状态；支持浏览器前进后退与深度链接（如 `#/snowball/art_bx1_12`、`#/cloze/art_bx1_12`），刷新页面能直接留在当前背诵篇目与模式。
- **Notion 式全局命令面板（Cmd/Ctrl + K）**：新增 `src/components/CommandPalette.tsx`，并在顶栏增加搜索快捷入口。支持键盘快捷键秒搜全库 100 篇古诗文（按标题/作者/朝代/选册）、跨模式直达、切换教材范围与主题。
- **统一工作区外壳与快捷键调度**：新增 `src/components/StudyWorkspaceShell.tsx` 与 `src/hooks/useWorkspaceShortcuts.ts`。为各个背诵视图统一承载顶栏、侧边栏和注音/大意抽屉，并在全局集中处理输入框屏蔽、弹窗开启时冻结快捷键以及与 `Alt + 1~8` 的修饰键隔离。
- **通用选篇弹窗**：新增 `src/components/ArticlePickerModal.tsx`，统一朝代筛选与篇目快速定位，消除了滚雪球与刻漏字原先两处重复实现的选篇弹窗代码。
- **闪卡语序连背与前句引子提示**：在闪卡正面增加「按课文语序连背」开关，帮助学生按自然文脉建立节奏感；开放 `H` 快捷键展开「前句引子（`precedingClauseHint`）」，解决长文背诵起头断片的问题。
- **易错字手打盲默校验（Typing Recall）**：新增 `src/components/TypingRecallInput.tsx`。在刻漏字 L1 关键词挖空和闪卡学习中提供「手打盲默」开关，学生可直接键盘敲入挖空字词，正确时自动刮开并步进下一词，强化高考「嘴会背、手不写错」的字形准确度。
- **闪卡兄弟卡同日避让（Sibling Burying）**：在 `src/domain/fsrs/ankiScheduler.ts` 中基于 `segmentId` 识别同句正反挖空卡（出句背对句 / 对句背出句），每日新学与复习队列默认同一天只排一张，另一张自动顺延至次日，避免同一句在同一次学习中反复出现、挤占新学配额。
- **滚雪球写卡与闪卡配额隔离**：在 `src/domain/cloze/snowballEngine.ts` 与 `src/storage/db.ts`（写入标记 `source: "snowball"`）中，长文滚雪球通关批量沉淀卡片时按 `segmentId` 归并主卡，且在闪卡调度中予以避让，防止单篇 20+ 联长文瞬间撑爆当日闪卡新学和复习额度。
- **Vitest 单元测试套件**：接入 `vitest` 与 `npm test`（`vitest run`）。新增针对 FSRS 引擎、排程避让、LCS 文本对齐、关键词提取、日期跨零点以及全 100 篇注音/理解数据完整性的自动化测试。

### 变更

- **精简远期规划中的冗余条目**：从 `docs/ARCHITECTURE_ROADMAP.md` 中移除实用性较低的 `Track L4`（离线朗读跟背与高考备考诊断看板），学习引擎线收敛为聚焦提分与记忆闭环的 `Track L1–L3` 三条轨道。
- **移除 GitHub Actions 工作流**：删除 `.github/workflows/deploy.yml`，改由 Cloudflare Pages 原生 GitHub 自动集成在每次推送后直接完成构建与上线，避免因缺少 GitHub Secrets 导致的无效报错红叉。
- **超长学习视图拆解解耦**：
  - `src/views/FlipCardView.tsx`（原 869 行）解耦抽离为 `src/hooks/useFlipCardSession.ts`（会话状态机与 FSRS 评分）、`src/components/flipcard/FlipCardBody.tsx`（卡片主体与操作栏）与 `src/components/flipcard/FlipCardSettlement.tsx`（结算统计卡片），主视图收敛至 328 行。
  - `src/views/CramModeView.tsx`（原 863 行）拆分为 `src/components/cram/CramCardPractice.tsx`（单卡背诵）、`src/components/cram/CramReferenceList.tsx`（列表速查）与 `src/components/cram/CramHeaderFilters.tsx`（顶栏筛选），主视图收敛至 352 行。
- **学习视图接入统一工作区外壳**：`SnowballView`、`ClozeView`、`ScenarioView`、`FlipCardView` 统一迁移至 `<StudyWorkspaceShell>`，消除了各视图内重复维护的外框布局与 `keydown` 监听。
- **视图组件剥离纯算法与数据逻辑**：`ScenarioView.tsx` 移除内联标点正则与逐位比对循环，改调 `diffEngine.ts`；`ClozeView.tsx` 移除内联虚词集合与正文字符串匹配，改调 `keywordExtractor.ts`。
- **顶栏接入轻量状态与命令面板入口**：`Navbar.tsx` 与全站 8 个视图通过 `useOptionalStudyApp()` 接入集中状态，消除从 `App.tsx` 的逐层 Props 传递（Prop Drilling）。

### 修复

- **闪卡背面释义全篇失真问题**：修复 `src/data/flashcardGenerator.ts` 过去把整篇第一句大意直接赋给所有卡片背面作为 `backTranslation` 的缺陷；改用卡片所在段落真实大意（`ARTICLE_UNDERSTANDING`），并动态提取本句命中的难词注音与通假字标签，卡背释义与考点读音不再答非所问。

### 新增

- **架构演进路径图与远期规划 Checklist**：新增 `docs/ARCHITECTURE_ROADMAP.md`，梳理当前纯前端 SPA 架构基线、面向 Notion 式 Local-First 架构的技术演进四阶段（内存缓存引擎、标准化多视图仓库、统一工作区外壳与命令层、索引/正文按需拆包与 PWA）以及学习引擎与教研体验升级三轨道（LCS 精准批改、兄弟卡避让、段落串讲/前句提示、跨模式 FSRS 闭环与分段雪球），拆分为可追踪的验收 Checklist。
- **统一学习工作区工具栏**：新增 `src/components/StudyToolbar.tsx`，为滚雪球、渐进遮挡、高考默写等桌面端学习视图提供一致的模式标签、切篇入口、内联进度条与注音/大意快捷开关。

- **JSON 备份导入恢复**：设置页新增「导入恢复 JSON」功能，支持校验并事务性恢复 `cards` 与 `daily_records` 到本地 IndexedDB（`src/storage/db.ts`、`src/views/SettingsView.tsx`）。
- **高考默写轮次结算**：答完最后一题后展示本轮作答数与正确率结算卡片，支持「重新刷一遍」与「仅重做错题」（`src/views/ScenarioView.tsx`）。
- **本地日期工具**：新增 `src/utils/date.ts`（`getLocalDateString`），统一使用本地时区 `YYYY-MM-DD`。

- **难词注音面板**：背诵时可随时呼出当前篇目的难词表，含词语、拼音与释义，通假字与破读字带「通假」标记。刻漏字与滚雪球页头均加入口。新增 `src/components/PhoneticsPanel.tsx`、`src/data/articlePhonetics.ts`。
- **理解大意卡片**：每篇提供「全篇大意 + 逐段串讲」。滚雪球页打开时自动定位并高亮当前正在背诵的段落，卡壳时可一键查看这段在讲什么。刻漏字页、目录精读弹窗同样可呼出。新增 `src/components/UnderstandingCard.tsx`、`src/data/articleUnderstanding.ts`。
- **背诵模式推荐**：按正文净字数给出建议（≥250 字的长文推荐滚雪球，较短的诗词曲推荐刻漏字）。目录页推荐按钮显示「荐」角标，刻漏字页在长文上出现「更适合滚雪球」提示与跳转按钮。新增 `src/domain/recommend/modeRecommender.ts`。
- **学习内容数据**：100 篇古诗文的注音表与理解串讲，数据分片存放于 `src/data/learningContent/part1~5.ts`，由 `articlePhonetics.ts` / `articleUnderstanding.ts` 聚合导出。
- **项目协作文档**：新增 `AGENTS.md`，记录 Agent 工作约定（更新日志要求、文案风格、数据文件边界、架构分层）。
- **PC 右侧常驻信息栏**：新增 `src/components/StudySidebar.tsx`。在 xl 宽屏下，滚雪球、渐进遮挡、情境默写、闪卡页右侧固定展示当前篇目、进度、注音/理解/换篇入口与键盘说明，减少反复开关弹层。移动端与窄屏完全不显示。
- **全站快捷键帮助**：新增 `src/components/ShortcutHelp.tsx`，按 `?` 打开，集中列出全局导航与各模式快捷键，`Esc` 关闭。顶栏新增键盘图标入口。
- **全局导航快捷键**：`Alt + 1~8` 可直接切换概览、滚雪球、闪卡、遮挡、抱佛脚、默写、典库、设置，映射集中在 `NAV_SHORTCUT_ORDER`。

### 变更

- **全站桌面端 UI 与交互重构**：
  - **顶栏分组与沉浸模式**：`src/components/Navbar.tsx` 将桌面端导航收拢为「概览 / 背诵模式组 / 冲刺默写组 / 诗文典库」四大清晰支柱，进入背诵视图时自动切换为低干扰沉浸态；移除多余的移动端底部固定栏并精简 `src/App.tsx` 底部留白。
  - **极简启动器首页**：`src/views/DashboardView.tsx` 移除重复的接续按钮与冗长欢迎区，重构为「左接续启动 + 右 2x2 核心指标」与「五模式快捷启动条」的紧凑桌面布局，首屏直达核心学习任务。
  - **右侧滑出式辅助抽屉**：`src/components/PhoneticsPanel.tsx` 与 `src/components/UnderstandingCard.tsx` 改为桌面端右侧滑出抽屉（使用 `createPortal` 挂载至 `document.body`，避免父容器动画变换导致遮罩高度被裁切，支持 `Esc` 关闭），查阅难词注音与段落串讲时不再遮挡居中阅读视角。
  - **学习视图体验打磨**：`src/views/SnowballView.tsx`、`src/views/ClozeView.tsx`、`src/views/ScenarioView.tsx` 接入统一 `StudyToolbar`，其中滚雪球底部操作栏改为居中主栏内的 `sticky bottom-5` 悬浮条（解决短篇首联时遮挡正文的问题）；`src/views/FlipCardView.tsx` 优化 3D 翻卡悬停反馈与过渡曲线；`src/index.css` 采用 Notion 式温润纸白画布（`#FBFBFA`）与微动效关键帧。
- **路由视图懒加载拆包**：`src/App.tsx` 对 `SnowballView`、`FlipCardView`、`ClozeView`、`ScenarioView`、`CramModeView`、`CatalogView`、`SettingsView` 启用 `React.lazy` + `Suspense`，主包体积由 `812.18 kB` 降至 `422.97 kB`，消除构建体积告警。
- **真正纯离线与无障碍支持**：`index.html` 移除 `fonts.googleapis.com` 外链字体请求与 `maximum-scale=1.0, user-scalable=no` 缩放限制。
- **无偏随机洗牌**：`src/domain/fsrs/ankiScheduler.ts` 新增 Fisher-Yates 洗牌算法 `shuffleArray`，替换原有 `.sort(() => 0.5 - Math.random())`，同步用于 `FlipCardView` 随机抽背。
- **设置页算法参数打通**：`src/domain/fsrs/fsrsEngine.ts` 新增 `getFsrsSettings` / `saveFsrsSettings` / `createFsrsEngine`，设置页挂载时读取真实配置并在保存后驱动 `FlipCardView`、`SnowballView` 与 `AnkiScheduler`。

### 变更

- **PC 背诵页改宽屏双栏**：滚雪球、渐进遮挡、情境默写、闪卡四页在 xl 断点下放宽容器并改为「主内容 + 288px 右栏」，大屏不再两侧大片留白。lg（1024~1279px）仍保持原有单栏，移动端无改动。
- **顶栏信息降噪**：桌面导航按「背诵 / 冲刺资料」分成两组并加分隔线；设置从标签行移入右侧图标区；lg 宽度下只显示图标、xl 才显示文字；每个标签补充 `Alt + 数字` 悬浮提示。
- **渐进遮挡补键盘操作**：`← / →` 降低或提高遮挡等级，`R` 全览/恢复遮挡；被遮字块增加 hover 反馈，鼠标移上去能确认可点。
- **情境默写补键盘操作**：卡片区按 `Enter` 提交核对或进入下一题，输入框内用 `Ctrl / Cmd + Enter` 直接提交；输入为空时不会误判。
- **快捷键与全局导航隔离**：滚雪球、闪卡、抱佛脚原有快捷键在按下 Alt/Ctrl/Cmd 时不再触发，避免 `Alt + 数字` 切页时误翻卡或误评分。
- **概览卡片可键盘操作**：选册牌组卡片支持 Tab 聚焦、`Enter`/空格进入闪卡，并补 hover 底色与轻微按压反馈；推荐篇目卡片增加 hover 与 focus-within 边框。
- **范围选择弹层支持 Esc**：教材范围弹层按 `Esc` 关闭，与快捷键帮助面板行为一致。

- **背诵篇目按课标 72 篇重新校准**：原先 100 篇里有 90 篇被标成「高考必背 72 篇」，明显虚高。现在按教育部《普通高中语文课程标准（2017 年版 2020 年修订）》附录 1 的 72 篇（文言文 32 + 诗词曲 40）重新判定：本库已收录的 58 条标为必背（含重复收录的《登岳阳楼》），其余 42 条统一标为「非课标必背」（其中 32 条由原必背下调），选修拓展里的《长恨歌》《湘夫人》《国殇》《孔雀东南飞》《氓》等不再混入必背牌组。`recitationScope` 同步写明背诵范围：全文、去序背正文、或具体段落的起止句。金句库中《庖丁解牛》《氓》《长恨歌》的必背标记也一并下调。
- **背诵范围可在精读弹窗查看**：目录页点「精读」，标题下会显示该篇的课标属性和背诵范围，比如「课标必背 · 全文」「课标必背 · 第3段（屈平疾王听之不聪也……虽与日月争光可也）」，或「非课标必背篇目」。
- **背诵正文按段裁剪**：不再只写范围标签，直接把不需要背的段落从正文里删掉，滚雪球、闪卡、刻漏字都只练必背内容。
  - 《登泰山记》只留第 2、3 段（登山经过与日观峰观日出），删掉开头泰山地理和结尾的山石松雪、署名。
  - 《项脊轩志》只留第 1 段（项脊轩修葺与庭中夜景），删掉末段枇杷树。
  - 《子路、曾皙、冉有、公西华侍坐》只留曾皙言志及孔子赞叹段，删掉子路、冉有、公西华言志的前文。
  - 《大学之道》按课标选段从「古之欲明明德于天下者」起，删掉前面的「大学之道，在明明德」一段。
  - 同步删掉这些段落对应的注音词条，并改写了理解串讲的段落大意，保证 `paragraphGists` 与正文段数一致。
  - 《归去来兮辞并序》正文本来就没收序，把标注从「全文（含序）」改成「正文全文（序不要求）」，避免正文和标签对不上。
- **长文二轮裁剪到重点段**：按高考默写高频句和老师常划的重点，把 9 篇长文的非重点段落删掉，删掉后正文就是实际要背的内容。
  - 《六国论》留第 1、2、4、5 段，删掉齐燕赵论述段。
  - 《赤壁赋》留第 1—4 段，删掉结尾“不知东方之既白”。
  - 《阿房宫赋》留第 1、2、4、5 段，删掉燕赵珍宝搬运段。
  - 《石钟山记》留第 2、3 段，删掉开头《水经》旧说。
  - 《师说》留第 1—3 段，删掉“李氏子蟠”写作缘由段。
  - 《五代史伶官传序》留第 1、3、4 段，删掉晋王赐三矢的叙事段。
  - 《归去来兮辞》留第 1、2、4 段，删掉“息交绝游”段。
  - 《兰亭集序》留第 1、3、4 段，删掉“天朗气清”段。
  - 《答司马谏议书》留第 2、3 段，删掉开头客套段。
  - 每篇的段落大意、注音词条同步改成跟新正文一致，`paragraphGists` 与段数已校验全部对齐。
- **刻漏字挖空规则优化**：L1 关键词改为优先取注音表中的考点词与注释词，剔除「之乎者也」等纯虚词，长词优先且上限 20 个；删除原先「挖虚词」和「挖句尾 1-2 字」两级凑数回退，无有效关键词时退化为半句遮挡，避免碎片化、无意义的挖空。
- `ClozeView` 新增 `onOpenArticleInView` 属性，用于模式推荐跳转。

### 修复

- **Tailwind v4 手动暗黑模式失效**：`src/index.css` 补充 `@custom-variant dark (&:where(.dark, .dark *));`，修复顶栏与设置页切换浅色/暗夜模式无法作用于页面组件的问题。
- **跨零点 UTC 时区偏差**：`db.ts`、`DashboardView.tsx`、`FlipCardView.tsx`、`Heatmap.tsx`、`SettingsView.tsx` 统一改用 `getLocalDateString()`，避免凌晨 00:00–07:59 打卡与配额被记入前一天。
- **FSRS 按钮预览时长偏差**：`fsrsEngine.ts` 的 `previewIntervals` 在学习/重学状态改为基于 `updatedCard.dueTime - nowMillis` 计算，修复复习态评「重来」时预览显示 `1分` 而实际为 `10分` 的问题。
- **闪卡末张评「重来」提前结束会话**：`FlipCardView.tsx` 在判断是否完成前先计算 `willRequeue`，确保最后一张卡片评「重来」时能正常进入队列末尾重学。
- **闪卡 3D 类名与 `Enter` 快捷键**：修复 `FlipCardView.tsx` 中 `transform-style-preserve-3d` 拼写为 `transform-style-3d`，并补全 `!isFlipped` 时按 `Enter` 翻卡（与按钮提示一致）。
- **概览页图标同色、试听副作用与重置残留**：修复 `DashboardView.tsx` 红色按钮内红色火焰图标不可见的问题；修复 `SettingsView.tsx` 试听音效后静默修改全局静音状态的问题；`resetAllProgress()` 补齐清理 `wenyan_cram_ratings`、`wenyan_anki_expanded_decks` 与 `snowball_stage_*`；`SnowballView.tsx` 结算弹窗对学习步进中的 `0` 天间隔显示为 `< 1 天（学习步进中）`。

- 修正 `modeRecommender` 中 `curriculumData` 与 `clozeEngine` 的相对路径引用。
- **闪卡牌组展开状态记忆与上下文接续**：修复了在翻转闪卡类目中总是强制默认展开「必修一」的问题。改为从 `localStorage` 读取用户之前展开的分册集合；同时在背诵返回时自动接续并保持当前篇目所属分册展开，避免每次退出或切页都被迫重新找书。

---

## 历史记录

以下内容依据 Git 提交历史回溯整理，按时间倒序排列。

### 2026-11-24 · `a569bdf`

**Anki 风格牌组主控台**

- 按选册重组古诗文排架，新增 Anki 风格牌组主控台 `AnkiDeckHub`。
- 接入 FSRS 智能每日排程，按新学 / 学习中 / 到期分组排序，支持每日新学与复习上限。
- 支持会话内错词循环，答错的卡在同一轮内反复出现直至掌握。

### 2026-11-22 · `5fa4333`

**顶栏视觉精简**

- 精简导航栏的视觉噪点，统一间距与交互层次。

### 2026-11-21 · `6698932`

**断点恢复体验修复**

- 修复「上次学习」相对时间的显示格式。
- 增加自动恢复的防重复启动保护。
- 索引越界时安全夹紧，避免恢复后崩溃。
- 从典库（目录）弹窗可直接跳转到恢复位置。

### 2026-11-21 · `783bf22`

**续学现场恢复**

- 全模式支持「继续上次进度」，回到上次所在的篇目、模式与具体进度。
- 首页提供极简恢复卡片，可一键接续或从头开始。

### 2026-11-21 · `e57e7fe`

**考前突击模式**

- 新增「考前抱佛脚 · 核心金句」模式，按册自选篇目。
- 提供情境默写导引、易错字排雷与遮挡自测速查。

### 2026-11-21 · `4107564`

**分册分类修复**

- 将 `SELECTIVE_REQUIRED` 修正为数据源实际的 `SELECTIVE` 分类，解决选择性必修列表空白。
- 补充选修拓展分册（古代诗歌散文欣赏 29 篇）独立层级。
- 选择弹窗在无匹配项时给出缺省状态提示。

### 2026-11-21 · `d9c09fe`

**设计体系与性能升级**

- 建立工程级设计规范文档 `docs/DESIGN_SYSTEM.md`。
- 清除界面杂乱 Emoji，统一改用单色 Lucide 矢量图标。
- 引入 `FlashcardCache` 内存惰性缓存，消除切换范围时 350ms+ 的正则解析白屏。
- 建立课标备考、历史朝代、文体体裁、掌握状态四维分类体系。
- 导航栏上线两级教材选择弹窗；移动端适配 ≥48px 热区的吸底五键 Dock。
- 滚雪球模式升级为高斯模糊磨砂遮罩与常驻吸底操作岛，适配全键盘热键。
- 3D 翻转闪卡启用 GPU 加速，实现 O(1) 增量记忆状态调度。
- 渐进遮挡上线分段滑动控制条与字号微调器。
- 高考默写上线字符级 Diff 批改引擎与题卡索引抽屉。
- 诗文典库改为分批轻量化渲染（Chunk Rendering），DOM 压力降低约 80%。

### 2026-11-21 · `8a8b845`

**音频、调度与文本修整**

- 重写音效系统，修复异常播放。
- 修复 FSRS 队列调度问题。
- 补充滚雪球进度恢复。
- 清理教材文本中的错字与脏数据。

### 2026-11-21 · `622e143`

**背诵范围对齐课标**

- 按官方课标对齐《屈原列传》及各篇节选文本的背诵范围。

### 2026-11-19 · `7328f74`

**持续集成**

- 新增 GitHub Actions 工作流，自动部署到 Cloudflare Pages。

### 2026-11-19 · `a8bbd14`

**初始提交**

- 文言背诵 Web 版首个版本：100 篇古诗文、FSRS-5 间隔重复、滚雪球串联、翻转闪卡、渐进遮挡、情境默写等核心背诵模式。
