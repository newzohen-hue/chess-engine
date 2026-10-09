import React from 'react';
import { motion } from 'motion/react';

interface EvalBarProps {
  score: number; // centipawns from White's perspective (+ = White, - = Black)
  isMate?: boolean;
  mateIn?: number;
  orientation?: 'w' | 'b';
}

export const EvalBar: React.FC<EvalBarProps> = ({
  score,
  isMate = false,
  mateIn,
  orientation = 'w',
}) => {
  // Convert centipawns to winning probability percentage (0 to 100% for White)
  let whitePercent = 50;

  if (isMate && mateIn !== undefined) {
    whitePercent = mateIn > 0 ? 100 : 0;
  } else {
    // Sigmoid mapping:
    // +100 cp = ~62%
    // +300 cp = ~82%
    // +600 cp = ~95%
    const clampedScore = Math.max(-1500, Math.min(1500, score));
    whitePercent = 50 + 50 * (2 / (1 + Math.exp(-0.0035 * clampedScore)) - 1);
    whitePercent = Math.max(3, Math.min(97, whitePercent));
  }

  // Format label
  let displayLabel = '0.0';
  if (isMate && mateIn !== undefined) {
    displayLabel = mateIn > 0 ? `+M${mateIn}` : `-M${Math.abs(mateIn)}`;
  } else {
    const cp = score / 100;
    const sign = score > 0 ? '+' : '';
    displayLabel = `${sign}${cp.toFixed(1)}`;
  }

  // Bar fill height depending on orientation
  // When orientation is White ('w'): White is at the bottom, Black is at the top.
  // When orientation is Black ('b'): Black is at the bottom, White is at the top.
  const bottomPercent = orientation === 'w' ? whitePercent : 100 - whitePercent;
  const isWhiteFavorable = isMate ? (mateIn ?? 0) > 0 : score >= 0;

  // In white orientation, if white has advantage, label at bottom; if black has advantage, label at top.
  const showLabelAtBottom = orientation === 'w' ? isWhiteFavorable : !isWhiteFavorable;

  return (
    <div
      id="evaluation-bar"
      className="relative flex flex-col justify-end w-7 sm:w-8 self-stretch rounded-xl overflow-hidden shadow-2xl border-2 border-slate-800 bg-slate-900 select-none transition-all"
      title={`Оценка позиции: ${displayLabel} (${Math.round(whitePercent)}% шанс победы Белых)`}
      style={{ minHeight: '280px' }}
    >
      {/* Top section (Background) */}
      <div
        className={`absolute inset-0 transition-colors ${
          orientation === 'w' ? 'bg-slate-900' : 'bg-slate-100'
        }`}
      />

      {/* Bottom section rising */}
      <motion.div
        className={`w-full relative transition-colors ${
          orientation === 'w' ? 'bg-slate-100' : 'bg-slate-900'
        }`}
        initial={false}
        animate={{ height: `${bottomPercent}%` }}
        transition={{ type: 'spring', damping: 26, stiffness: 190 }}
      />

      {/* Equality centerline (50%) */}
      <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-slate-500/40 z-10 pointer-events-none" />

      {/* Quarter tick marks (+3 / -3 cp) */}
      <div className="absolute top-1/4 left-1 right-1 h-px bg-slate-500/25 z-10 pointer-events-none" />
      <div className="absolute top-3/4 left-1 right-1 h-px bg-slate-500/25 z-10 pointer-events-none" />

      {/* Numerical score badge */}
      <div
        className={`absolute inset-x-0 ${
          showLabelAtBottom ? 'bottom-2' : 'top-2'
        } flex justify-center items-center pointer-events-none z-20`}
      >
        <span
          className={`px-1 py-0.5 text-[10px] sm:text-[11px] font-mono font-bold tracking-tight rounded shadow-md border ${
            showLabelAtBottom
              ? orientation === 'w'
                ? 'bg-slate-900/95 text-white border-slate-700/80'
                : 'bg-white/95 text-slate-950 border-slate-300'
              : orientation === 'w'
              ? 'bg-white/95 text-slate-950 border-slate-300'
              : 'bg-slate-900/95 text-white border-slate-700/80'
          }`}
        >
          {displayLabel}
        </span>
      </div>
    </div>
  );
};
