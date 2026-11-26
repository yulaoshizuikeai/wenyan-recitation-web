import React from "react";
import { Target, ArrowRight } from "lucide-react";
import { getScenarioQuestionsByArticle } from "../data/articleRepository";
import { useOptionalStudyApp } from "../state/StudyAppContext";

interface ArticleScenarioLinkProps {
  articleId?: string | null;
  className?: string;
}

export const ArticleScenarioLink: React.FC<ArticleScenarioLinkProps> = ({
  articleId,
  className = "",
}) => {
  const appCtx = useOptionalStudyApp();

  if (!articleId) return null;

  const questions = getScenarioQuestionsByArticle(articleId);
  if (questions.length === 0) return null;

  const handleClick = () => {
    appCtx?.navigateToArticle(articleId, "scenario");
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`group w-full max-w-sm mx-auto flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-900/60 hover:bg-zinc-100 dark:hover:bg-zinc-800/80 text-left transition-colors ${className}`}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="w-7 h-7 rounded-lg bg-amber-50 dark:bg-amber-950/50 border border-amber-200/70 dark:border-amber-800/60 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
          <Target className="w-3.5 h-3.5" />
        </div>
        <div className="min-w-0">
          <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate">
            顺手做 {questions.length} 道本篇高考真题
          </div>
          <div className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
            趁热打铁，检验理解性默写得分率
          </div>
        </div>
      </div>
      <ArrowRight className="w-4 h-4 text-zinc-400 group-hover:text-zinc-700 dark:group-hover:text-zinc-200 group-hover:translate-x-0.5 transition-all shrink-0" />
    </button>
  );
};
