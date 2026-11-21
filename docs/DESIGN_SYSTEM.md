# 文言背诵 Web 版 · 现代极简设计规范 (Modern Minimalist Design System)

> **版本**：v2.1 (Performance & Classification Overhaul Edition)  
> **设计哲学**：克制、纯粹、高信噪比。去除多余文人仿古装饰与杂乱色彩，以**几何纯粹度、清晰分类拓扑、微秒级响应性能、严谨排印**为核心，服务于学生高效专注的背诵心流。

---

## 1. 分类拓扑规范 (Information Architecture & Classification)

为彻底解决篇目分散、11 册教材标签横向堆叠、缺乏系统维度的混乱痛点，建立四维立体分类规范：

### 1.1 核心四维分类矩阵

* **维度 A：课标与备考层级 (Curricular Priority)**
  * ★ 高考必背 72 篇（全国高考命题核心篇目）
  * 必修全套（36 篇，基础课标必修上/下册）
  * 选择性必修全套（35 篇，高分进阶选必上/中/下册）
  * 拓展选读（29 篇，名篇选读与古诗词诵读）
* **维度 B：历史朝代脉络 (Chronological Dynasty)**
  * 先秦百家（18 篇：论语、孟子、庄子、荀子、屈原等）
  * 两汉魏晋（14 篇：史记、汉乐府、曹操、陶渊明等）
  * 唐代华章（38 篇：李白、杜甫、白居易、韩愈、柳宗元等）
  * 宋代风华（22 篇：苏轼、辛弃疾、欧阳修、王安石、李清照等）
  * 元明清（8 篇：关汉卿、张养浩、归有光、龚自珍等）
* **维度 C：文体体裁分类 (Literary Genre)**
  * 古体诗歌（乐府、歌行体、四言诗、骚体）
  * 近体律绝（五言律绝、七言律绝）
  * 经典宋词（婉约、豪放、小令、长调）
  * 宏篇文赋（骈赋、文赋、骚赋）
  * 论说与散文（议论说理、叙事记游、书序杂说）
* **维度 D：背诵掌握状态 (Mastery Status)**
  * 全部篇目
  * 未学习（初始）
  * 攻坚中（正在进行滚雪球或闪卡温习）
  * 熟读成诵（FSRS 稳定性 $\ge 21$ 天，达到长期记忆）

### 1.2 界面分类组件标准
* **导航栏教材范围选择**：
  * 采用**两级层级弹窗（Hierarchical Modal）**：左侧为备考大类（高考72篇 / 必修 / 选必 / 全部），右侧为册次明细，附带实时篇目统计徽标与即刻筛选。
* **诗文典库过滤器**：
  * 废除横向溢出的 11 个小册子胶囊按钮。
  * 采用顶部分栏 Segmented Bar：一级选择【课标 / 朝代 / 体裁 / 掌握度】，二级展示极简单色 Filter Chips，支持即时复合多重筛选。
* **换篇背诵选择弹窗 (Article Switcher Modal)**：
  * 统一使用分组聚合面板，支持汉字/拼音/作者一键即搜，杜绝 100 篇平铺翻找。

---

## 2. 交互零卡顿性能规范 (Zero-Lag Performance Standard)

为了确保在千篇诗词、万级闪卡与超长文赋（如《离骚》《长恨歌》）下依然实现 **60fps 丝滑不卡顿**，严格遵循以下前端性能硬指标：

| 交互场景 | 过去痛点 | 极简性能标准 | 优化实现方案 |
|:---|:---|:---|:---|
| **切换教材范围 / 闪卡模式** | 同步正则解析 100 篇诗文，卡顿 350ms+ | **$\le 16\text{ms}$ (无感切换)** | 引入单例 `FlashcardCache` 内存惰性缓存，按需分篇解析 |
| **闪卡 1-4 档评分点击** | 全表扫描 IndexedDB 并重排 2500 张卡片 | **$\le 8\text{ms}$ (即点即切)** | 基于 `Map` 局部 O(1) 增量更新，异步批量沉淀 IndexedDB |
| **3D 卡片翻转** | 布局回流、重排抖动 | **满帧 60fps (无重绘抖动)** | 启用 GPU `will-change: transform; transform: translateZ(0)`，锁定固定比例 |
| **典库 100 篇列表初次渲染** | 一次性挂载 1000+ DOM 节点，首屏卡顿 | **首屏 $\le 50\text{ms}$** | 首屏分批轻量化渲染（先渲染 18 篇，滚动无缝补齐） |
| **长文渐进遮挡与滚雪球刮开** | 全篇 2000+ 字全部重跑正则，点击延迟 | **$\le 5\text{ms}$ 极速响应** | 词块 Token 状态扁平化索引，段落级 React.memo 隔离重渲染 |

---

## 3. 颜色体系 (Color Tokens)

采用**极简中性灰色系（Zinc-based Neutrals）为主体，单一点缀色（Refined Crimson Red）为交互核心**的双主题色谱。

### 3.1 浅色模式 (Light Mode - Minimal Zinc)

| Token 名称 | 变量值 | 用途说明 |
|:---|:---|:---|
| `--bg-canvas` | `#FAFAFA` (Zinc-50) | 全局页面背景底色，温润不刺眼 |
| `--bg-surface` | `#FFFFFF` | 卡片、面板、弹窗主背景 |
| `--bg-surface-subtle` | `#F4F4F5` (Zinc-100) | 次级卡片底色、输入框底色、代码/引用块 |
| `--border-subtle` | `#E4E4E7` (Zinc-200) | 默认 1px 细线边框、分割线 |
| `--border-strong` | `#D4D4D8` (Zinc-300) | 悬停态边框、强调线 |
| `--text-primary` | `#18181B` (Zinc-900) | 核心文字、主标题、诗词正文（对比度 14:1） |
| `--text-secondary` | `#52525B` (Zinc-600) | 辅助信息、作者朝代、白话释义 |
| `--text-tertiary` | `#71717A` (Zinc-500) | 提示文字、快捷键角标、页脚说明（对比度 4.6:1） |
| `--accent` | `#DC2626` (Red-600) | 核心主操作点缀色（如主按钮、激活状态、关键错误） |
| `--accent-hover` | `#B91C1C` (Red-700) | 核心点缀色悬停态 |
| `--accent-subtle` | `#FEF2F2` (Red-50) | 点缀色微底色（选中态、浅色徽标） |

### 3.2 深色模式 (Dark Mode - Midnight Zinc)

| Token 名称 | 变量值 | 用途说明 |
|:---|:---|:---|
| `--bg-canvas` | `#09090B` (Zinc-950) | 深邃暗黑底色，杜绝屏幕眩光 |
| `--bg-surface` | `#18181B` (Zinc-900) | 卡片面板底色 |
| `--bg-surface-subtle` | `#27272A` (Zinc-800) | 次级面板底色、微交互浮层 |
| `--border-subtle` | `#27272A` (Zinc-800) | 1px 极简微边框 |
| `--border-strong` | `#3F3F46` (Zinc-700) | 交互态强调边框 |
| `--text-primary` | `#F4F4F5` (Zinc-100) | 高对比度主文本（对比度 15:1） |
| `--text-secondary` | `#A1A1AA` (Zinc-400) | 次级正文、辅助说明 |
| `--text-tertiary` | `#71717A` (Zinc-500) | 弱化次级说明 |
| `--accent` | `#EF4444` (Red-500) | 深色模式下高辨识度点缀色 |
| `--accent-hover` | `#DC2626` (Red-600) | 悬停态 |
| `--accent-subtle` | `rgba(239, 68, 68, 0.1)` | 浅层半透明点缀底色 |

---

## 4. 现代排印规范 (Typography)

* **UI 界面系统字体**（按钮、导航、指标、提示）：
  ```css
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
  ```
* **古诗文正文与默写呈现字体**（诗词、文赋、挖空）：
  ```css
  font-family: "Noto Serif SC", "Source Han Serif SC", "Songti SC", SimSun, serif;
  ```
  *(注：正文字体保持 1.8~2.0 舒适行高，禁止任何艺术倾斜与字形模糊)*

---

## 5. 组件与交互规范

* **纯矢量图标 (100% Vector Icons)**：全面剥离所有 Emoji，全量替换为 1.5px/2px 单色 Lucide 矢量图标。
* **卡片与边框**：统一采用 1px 细微灰边框 (`border border-zinc-200 dark:border-zinc-800`)，杜绝多层繁杂投影。
* **微交互动效**：界面切换统一采用 150ms 纯净淡入（Fade-in），按钮按压采用 `active:scale-[0.98]` 瞬时回馈。
* **移动端人体工学**：底部固定 48px 最低热区吸底 5 键 Dock，重要背诵视图配备吸底悬浮操作岛，杜绝反复滚动。
