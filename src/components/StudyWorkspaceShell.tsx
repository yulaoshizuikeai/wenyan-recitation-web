/**
 * StudyWorkspaceShell — Phase 2.2 统一 Notion 式工作区外壳
 *
 * 为所有学习视图提供统一的桌面端布局骨架：
 *   - 顶部工具栏插槽（`toolbar` / 自动渲染 `StudyToolbar`）
 *   - 可选的 `PickUpCard` / 恢复进度横幅插槽
 *   - 主画布区域（`children`）
 *   - xl 右栏 `StudySidebar`（288px 宽）
 *   - 右侧滑出抽屉（`PhoneticsPanel` / `UnderstandingCard`）
 */

import React from "react";
import { StudyToolbar } from "./StudyToolbar";
import { StudySidebar, type SidebarShortcut } from "./StudySidebar";
import { PhoneticsPanel } from "./PhoneticsPanel";
import { UnderstandingCard } from "./UnderstandingCard";
import type { Article } from "../data/curriculumData";

// ─── Props ──────────────────────────────────────────────────────────────────────

export interface StudyWorkspaceSidebarArticle {
  title: string;
  author: string;
  dynasty?: string;
  genre?: string;
  isGaoKao72?: boolean;
}

export interface StudyWorkspaceShellProps {
  children: React.ReactNode;

  /** 外层容器自定义样式类（默认 `max-w-3xl xl:max-w-6xl mx-auto px-6 py-5 pb-16 animate-fade-slide-up`） */
  containerClassName?: string;

  /** 主画布列自定义样式类（默认 `min-w-0 space-y-4`） */
  mainClassName?: string;

  /** 是否隐藏右侧边栏（例如 FlipCardView 在牌组选册页时） */
  hideSidebar?: boolean;

  // ── Toolbar ──

  /** 完全自定义的顶部工具栏（替换默认 StudyToolbar）。 */
  toolbar?: React.ReactNode;

  /** 若未传 `toolbar`，以下字段将自动渲染 `StudyToolbar`。 */
  toolbarConfig?: {
    modeLabel: string;
    modeIcon?: React.ReactNode;
    title: string;
    subtitle?: string;
    onSelectTitle?: () => void;
    progressText?: string;
    progressPercent?: number;
    actions?: React.ReactNode;
  };

  // ── Sidebar (xl) ──

  /** 当前篇目完整对象（用于注音/大意抽屉及默认侧栏信息） */
  article?: Article;
  /** 可选覆盖侧栏展示的篇目摘要（如 ScenarioView 仅有 title/author） */
  sidebarArticle?: StudyWorkspaceSidebarArticle;
  /** 右侧边栏进度标签 */
  sidebarProgressLabel?: string;
  /** 右侧边栏进度百分比 */
  sidebarProgressPercent?: number;
  /** 右侧边栏键盘操作列表 */
  sidebarShortcuts?: SidebarShortcut[];
  /** 右侧边栏底部提示文案 */
  sidebarHint?: string;
  /** 切换篇目回调（侧边栏"换一篇"按钮） */
  onChangeArticle?: () => void;

  // ── 右侧滑出抽屉 ──

  /** 是否显示注音面板 */
  showPhonetics?: boolean;
  /** 关闭注音面板 */
  onClosePhonetics?: () => void;
  /** 是否显示理解大意面板 */
  showUnderstanding?: boolean;
  /** 关闭理解大意面板 */
  onCloseUnderstanding?: () => void;
  /** 理解大意面板当前高亮的文本（用于定位段落） */
  understandingHighlightText?: string;
  /** 打开注音面板 */
  onShowPhonetics?: () => void;
  /** 打开理解大意面板 */
  onShowUnderstanding?: () => void;

  // ── 恢复进度 / 顶部横幅 ──

  /** 顶部横幅插槽（如 PickUpCard 的 banner/compact 变体或恢复进度提示） */
  topBanner?: React.ReactNode;
}

// ─── Component ──────────────────────────────────────────────────────────────────

export const StudyWorkspaceShell: React.FC<StudyWorkspaceShellProps> = ({
  children,
  containerClassName = "max-w-3xl xl:max-w-6xl mx-auto px-6 py-5 pb-16 animate-fade-slide-up",
  mainClassName = "min-w-0 space-y-4",
  hideSidebar = false,
  toolbar,
  toolbarConfig,
  article,
  sidebarArticle,
  sidebarProgressLabel,
  sidebarProgressPercent,
  sidebarShortcuts,
  sidebarHint,
  onChangeArticle,
  showPhonetics = false,
  onClosePhonetics,
  showUnderstanding = false,
  onCloseUnderstanding,
  understandingHighlightText,
  onShowPhonetics,
  onShowUnderstanding,
  topBanner,
}) => {
  const effectiveSidebarArticle: StudyWorkspaceSidebarArticle | undefined =
    sidebarArticle ??
    (article
      ? {
          title: article.title,
          author: article.author,
          dynasty: article.dynasty,
          genre: article.genre,
          isGaoKao72: article.isGaoKao72,
        }
      : undefined);

  const hasSidebar =
    !hideSidebar &&
    Boolean(effectiveSidebarArticle || sidebarShortcuts?.length || sidebarHint);

  // 自动渲染 StudyToolbar（若未传自定义 toolbar）
  const resolvedToolbar =
    toolbar ??
    (toolbarConfig ? (
      <StudyToolbar
        modeLabel={toolbarConfig.modeLabel}
        modeIcon={toolbarConfig.modeIcon}
        title={toolbarConfig.title}
        subtitle={toolbarConfig.subtitle}
        onSelectTitle={toolbarConfig.onSelectTitle}
        progressText={toolbarConfig.progressText}
        progressPercent={toolbarConfig.progressPercent}
        onShowPhonetics={onShowPhonetics}
        onShowUnderstanding={onShowUnderstanding}
        actions={toolbarConfig.actions}
      />
    ) : null);

  return (
    <>
      <div className={containerClassName}>
        <div
          className={
            hasSidebar
              ? "xl:grid xl:grid-cols-[minmax(0,1fr)_288px] xl:gap-6 xl:items-start"
              : undefined
          }
        >
          {/* 主画布区域（含顶部工具栏与恢复横幅） */}
          <div className={mainClassName}>
            {resolvedToolbar}
            {topBanner}
            {children}
          </div>

          {/* xl 右栏 */}
          {hasSidebar && (
            <StudySidebar
              article={effectiveSidebarArticle}
              progressLabel={sidebarProgressLabel}
              progressPercent={sidebarProgressPercent}
              shortcuts={sidebarShortcuts}
              onShowPhonetics={onShowPhonetics}
              onShowUnderstanding={onShowUnderstanding}
              onChangeArticle={onChangeArticle}
              hint={sidebarHint}
            />
          )}
        </div>
      </div>

      {/* 右侧滑出抽屉 — 注音面板 */}
      {showPhonetics && article && onClosePhonetics && (
        <PhoneticsPanel article={article} onClose={onClosePhonetics} />
      )}

      {/* 右侧滑出抽屉 — 理解大意面板 */}
      {showUnderstanding && article && onCloseUnderstanding && (
        <UnderstandingCard
          article={article}
          highlightText={understandingHighlightText}
          onClose={onCloseUnderstanding}
        />
      )}
    </>
  );
};
