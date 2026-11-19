# 文言背诵 Web 版 (WenYan Recitation Web)

基于 **FSRS-5 (Free Spaced Repetition Scheduler)** 间隔重复记忆算法的高中语文古诗文现代纯前端 Web 背诵系统。

完整继承原生安卓版全部核心算法与数据资产，收录教育部普通高中语文课标全部 **11 册教材 · 100 篇经典名篇**（含教育部高考必背 72 篇专项），提供包含**长篇滚雪球串联背诵**在内的多维背诵模式。

---

## 🌟 核心特性与背诵模式

### 1. ❄️ 长卷滚雪球串联背诵 (Snowball Chaining Recitation)
* **长篇文言递推攻坚**：针对《劝学》《赤壁赋》《离骚》《师说》《阿房宫赋》《琵琶行》等长篇大作，按诗文文脉将全文拆解为递推串联阶段：第 1 联 $\to$ 第 1+2 联 $\to$ 第 1+2+3 联 $\to \dots \to$ 全篇通背。
* **转折卡壳标记 (Bottleneck Pinning)**：支持随时在易卡壳处一键标记，专治古文起承转合遗忘痛点。
* **盲背模式与全篇对照**：已背前文自动以墨块（`■■■■`）遮挡，聚焦最新句联，点击任意句联即可刮开对照。
* **通篇结业与 FSRS 信用分配**：背完全篇后自动为各句分配 FSRS 记忆信誉（顺畅句联判定为 Good，卡壳句联判定为 Hard），批量沉淀至本地记忆库。

### 2. 🎴 单句/名句 3D 翻转闪卡 (Flip Flashcard)
* 正面呈现出句挖空 `⟦ ________ ⟧`、朝代与体裁提示；
* 丝滑 3D 翻转交互，背面展示对句正解、重点字词注解与白话译文；
* 底部 **FSRS-5 四档评分入口**（`Again`、`Hard`、`Good`、`Easy`），附带即时预估下次复习间隔徽标；
* 支持**键盘快捷键**：`Space`/`Enter` 翻卡，`1`/`2`/`3`/`4` 快捷评分。

### 3. 👁️ 5 级渐进遮挡背诵 (5-Level Progressive Cloze)
* `L0 原文`：全篇无遮挡通读；
* `L1 关键词`：高频考点与重点词眼挖空（`⟦ __ ⟧`）；
* `L2 半句`：出句提示、对句遮挡；
* `L3 首字`：保留每句首字骨架与标点，辅助思维回想；
* `L4 全盲`：全篇下划线盲测通篇默写。
* 支持鼠标/触摸点击单个词块独立刮开查看，支持一键全览对照。

### 4. 📝 历年高考情境化理解性默写真题库 (GaoKao Scenario)
* 收录历年全国卷与名校模拟真题；
* 模拟真实高考题干语境，支持打字默写与一键自动批改；
* 精准标注易错字、通假字与定语后置采分点。

### 5. 🗓️ 研墨足迹 · 14 周背诵打卡热力图 (Heatmap)
* 直观展示近 98 天（14 周）每日背诵强度的方格足迹；
* 融合古典竹青绿阶与宣纸底色，记录连续打卡天数（Streak）、熟读成诵率与累计复习总量。

### 6. 🎵 纯原生 Web Audio API 典雅音效
* 100% 离线使用浏览器 Web Audio API 动态合成双音和弦编钟铃声、翻卡纸声与完卷大捷号角；
* 0 外部音频文件依赖，杜绝静态资源加载失败。

---

## 🛠 本地开发与构建

### 安装依赖
```bash
npm install
```

### 启动本地开发服务器
```bash
npm run dev
```
本地服务将运行在 `http://localhost:5173`。

### 生产环境打包
```bash
npm run build
```
产物将生成在 `dist/` 目录中（包含 `index.html`、`_headers` 与 `_redirects`）。

---

## ☁️ 部署到 Cloudflare

本项目为纯前端单页应用（SPA），专为 Cloudflare 边缘网络设计，零服务端成本，全球毫秒级访问。

### 方式一：使用 Wrangler CLI 命令行部署（推荐）

1. 登录 Cloudflare 账号：
   ```bash
   npx wrangler login
   ```
2. 执行部署：
   ```bash
   npm run deploy
   # 或者执行：
   npx wrangler pages deploy dist --project-name wenyan-recitation
   ```
   部署完成后将直接输出可访问的 `*.pages.dev` 域名。

### 方式二：通过 Cloudflare 控制台与 GitHub 持续集成

1. 将本项目推送到您的 GitHub 仓库；
2. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)，进入 **Workers & Pages** -> **Create application** -> **Pages** -> **Connect to Git**；
3. 选择对应的仓库，配置构建参数：
   * **Framework preset**: `Vite`
   * **Build command**: `npm run build`
   * **Build output directory**: `dist`
4. 点击 **Save and Deploy** 即可，后续每次 `git push` 均会自动构建上线。
