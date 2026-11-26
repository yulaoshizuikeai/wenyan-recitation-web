# 更新日志

本项目的所有重要更改都记录在此文件中。

远端仓库：[yulaoshizuikeai/wenyan-recitation-web](https://github.com/yulaoshizuikeai/wenyan-recitation-web)

> **约定**：每次改动代码后，都要在顶部 `## [未发布]` 段落中追加一条记录，写清改了什么、为什么改。发版时再把「未发布」的内容归入新的版本段落并标注日期与提交号。

## [未发布]

### 新增

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

- **架构演进路径图与远期规划 Checklist**：新增 `docs/ARCHITECTURE_ROADMAP.md`，梳理当前纯前端 SPA 架构基线、面向 Notion 式 Local-First 架构的技术演进四阶段（内存缓存引擎、标准化多视图仓库、统一工作区外壳与命令层、索引/正文按需拆包与 PWA）以及学习引擎与教研体验升级四轨道（LCS 精准批改、兄弟卡避让、段落串讲/前句提示、跨模式 FSRS 闭环、分段雪球与离线朗读），拆分为可追踪的验收 Checklist。
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
