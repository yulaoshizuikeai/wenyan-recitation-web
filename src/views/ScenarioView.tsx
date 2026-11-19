import React, { useState, useMemo } from "react";
import { GAOKAO_SCENARIO_QUESTIONS, GaoKaoScenarioQuestion } from "../data/scenarioData";
import { sound } from "../sound/audioSynthesizer";
import { fireConfetti } from "../components/Confetti";
import { HelpCircle, Check, X, Eye, ArrowRight, RotateCcw, AlertCircle, BookOpen } from "lucide-react";

export const ScenarioView: React.FC = () => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userInput, setUserInput] = useState("");
  const [isAnswerRevealed, setIsAnswerRevealed] = useState(false);
  const [isEvaluated, setIsEvaluated] = useState(false);
  const [score, setScore] = useState(0);
  const [testedCount, setTestedCount] = useState(0);

  const currentQ: GaoKaoScenarioQuestion = GAOKAO_SCENARIO_QUESTIONS[currentIndex] || GAOKAO_SCENARIO_QUESTIONS[0];

  const handleVerify = () => {
    sound.playClick();
    setIsEvaluated(true);
    setIsAnswerRevealed(true);

    // Normalize comparison: remove all punctuations and spaces
    const normUser = userInput.replace(/[，。？！；：、“”‘’\s]/g, "");
    const normAns = currentQ.answer.replace(/[，。？！；：、“”‘’\s]/g, "");

    const isMatch = normUser === normAns;
    if (isMatch) {
      sound.playCorrect();
      setScore(prev => prev + 1);
    } else {
      sound.playWrong();
    }
    setTestedCount(prev => prev + 1);
  };

  const handleNext = () => {
    sound.playClick();
    if (currentIndex + 1 < GAOKAO_SCENARIO_QUESTIONS.length) {
      setCurrentIndex(prev => prev + 1);
    } else {
      sound.playCelebration();
      fireConfetti();
      setCurrentIndex(0);
    }
    setUserInput("");
    setIsAnswerRevealed(false);
    setIsEvaluated(false);
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 text-xs">
        <span className="font-bold text-[#2C4F3D] flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200">
          <HelpCircle className="w-4 h-4" />
          高考情境化理解性默写真题库 · 第 {currentIndex + 1} / {GAOKAO_SCENARIO_QUESTIONS.length} 题
        </span>
        <div className="text-[#5C5855]">
          已作答 {testedCount} 题 ｜ 正确率：
          <span className="font-bold text-[#9E2A2B]">
            {testedCount > 0 ? Math.round((score / testedCount) * 100) : 0}%
          </span>
        </div>
      </div>

      {/* Main Question Card */}
      <div className="bg-white/90 backdrop-blur border border-[#E3DEC3] rounded-3xl p-6 sm:p-8 shadow-sm space-y-6">
        <div>
          <div className="flex items-center gap-2 text-xs text-[#8C8884] mb-2">
            <span className="font-bold text-[#9E2A2B] px-2 py-0.5 rounded bg-red-50 border border-red-200">
              《{currentQ.articleTitle}》
            </span>
            <span>{currentQ.author}</span>
          </div>

          <h3 className="text-base sm:text-lg font-bold font-serif text-[#232120] leading-relaxed">
            {currentQ.prompt}
          </h3>
        </div>

        {/* Input Box */}
        <div className="space-y-3">
          <textarea
            rows={2}
            value={userInput}
            onChange={e => setUserInput(e.target.value)}
            disabled={isAnswerRevealed}
            placeholder="在此默写名句（如：君子生非异也，善假于物也）..."
            className="w-full px-4 py-3 rounded-2xl border border-[#D5CFBD] bg-[#FAF7F0] focus:bg-white text-base font-serif text-[#232120] focus:outline-none focus:border-[#9E2A2B] leading-relaxed transition-all resize-none"
          />

          {!isAnswerRevealed && (
            <div className="flex gap-2">
              <button
                onClick={handleVerify}
                className="flex-1 py-3 rounded-xl bg-[#9E2A2B] hover:bg-[#7A1E1F] text-white font-bold text-sm shadow-sm flex items-center justify-center gap-1.5 transition-all"
              >
                <Check className="w-4 h-4" />
                提交默写并核验
              </button>
              <button
                onClick={() => {
                  sound.playReveal();
                  setIsAnswerRevealed(true);
                  setIsEvaluated(false);
                }}
                className="py-3 px-4 rounded-xl border border-[#D5CFBD] bg-white hover:bg-[#FAF7F0] text-xs font-bold text-[#5C5855] transition-all"
              >
                直接查看正解
              </button>
            </div>
          )}
        </div>

        {/* Revealed Answer & Exam Notes */}
        {isAnswerRevealed && (
          <div className="space-y-4 pt-4 border-t border-[#F0EDE1] animate-in fade-in duration-200">
            <div className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200">
              <div className="text-xs font-bold text-[#2C4F3D] mb-1">【标答正解】</div>
              <p className="text-xl font-serif font-bold text-[#232120] leading-relaxed">
                {currentQ.answer}
              </p>
            </div>

            {currentQ.keyPoints.length > 0 && (
              <div>
                <div className="text-xs font-bold text-[#5C5855] mb-2 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                  易错字与通假字采分警示：
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {currentQ.keyPoints.map((pt, idx) => (
                    <span
                      key={idx}
                      className="text-xs px-2.5 py-1 rounded-lg bg-amber-50 text-amber-900 border border-amber-200 font-medium"
                    >
                      {pt}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {currentQ.explanation && (
              <div className="text-xs text-[#5C5855] leading-relaxed bg-[#FAF7F0] p-3 rounded-xl border border-[#E3DEC3]">
                <strong className="text-[#232120]">真题考点导析：</strong>
                {currentQ.explanation}
              </div>
            )}

            <button
              onClick={handleNext}
              className="w-full py-3.5 rounded-xl bg-[#2C4F3D] hover:bg-[#1E432F] text-white font-bold text-sm shadow-md flex items-center justify-center gap-1.5 transition-all"
            >
              下一题
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
