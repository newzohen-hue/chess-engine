import React, { useEffect, useRef } from 'react';
import { Move } from '../types/chess';
import { squareToAlgebraic } from '../engine/chessRules';
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Copy,
  Check,
  TrendingUp,
  BookOpen,
} from 'lucide-react';

interface MoveHistoryProps {
  history: Move[];
  currentMoveIndex: number;
  onNavigate: (index: number) => void;
  opening?: { eco: string; name: string; nameRu: string } | null;
}

interface MovePair {
  num: number;
  white?: Move;
  whiteIdx?: number;
  black?: Move;
  blackIdx?: number;
}

export const MoveHistory: React.FC<MoveHistoryProps> = ({
  history,
  currentMoveIndex,
  onNavigate,
  opening,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = React.useState(false);

  // Auto scroll to bottom when new move added
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [history.length]);

  // Clean and group moves strictly by game turns
  const movePairs: MovePair[] = React.useMemo(() => {
    const pairs: MovePair[] = [];
    let currentMoveNum = 1;

    for (let i = 0; i < history.length; i++) {
      const move = history[i];

      if (move.color === 'w') {
        pairs.push({
          num: currentMoveNum,
          white: move,
          whiteIdx: i,
        });
      } else {
        // Black move
        const lastPair = pairs[pairs.length - 1];
        if (lastPair && lastPair.white && !lastPair.black) {
          lastPair.black = move;
          lastPair.blackIdx = i;
          currentMoveNum++;
        } else {
          // Black moved first (e.g. from custom FEN)
          pairs.push({
            num: currentMoveNum,
            black: move,
            blackIdx: i,
          });
          currentMoveNum++;
        }
      }
    }

    return pairs;
  }, [history]);

  const formatMoveDisplay = (move?: Move): string => {
    if (!move) return '';
    if (move.san) return move.san;
    const fromStr = squareToAlgebraic(move.from);
    const toStr = squareToAlgebraic(move.to);
    const promoStr = move.promotion ? `=${move.promotion.toUpperCase()}` : '';
    return `${fromStr}-${toStr}${promoStr}`;
  };

  const getClassificationBadge = (cls?: string) => {
    switch (cls) {
      case 'brilliant':
        return <span className="ml-1 text-[9px] px-1 py-0.2 rounded bg-cyan-500/20 text-cyan-300 font-bold">!!</span>;
      case 'best':
        return <span className="ml-1 text-[9px] px-1 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-bold">!</span>;
      case 'inaccuracy':
        return <span className="ml-1 text-[9px] px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 font-bold">?!</span>;
      case 'mistake':
        return <span className="ml-1 text-[9px] px-1 py-0.2 rounded bg-orange-500/20 text-orange-300 font-bold">?</span>;
      case 'blunder':
        return <span className="ml-1 text-[9px] px-1 py-0.2 rounded bg-rose-500/20 text-rose-300 font-bold">??</span>;
      default:
        return null;
    }
  };

  const exportPGN = () => {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '.');
    let pgn = `[Event "Шахматная партия"]\n[Site "Шахматный движок HCE"]\n[Date "${dateStr}"]\n[Round "1"]\n[White "Белые"]\n[Black "Чёрные"]\n[Result "*"]\n`;
    if (opening) {
      pgn += `[ECO "${opening.eco}"]\n[Opening "${opening.name}"]\n`;
    }
    pgn += '\n';

    const moveChunks: string[] = [];
    movePairs.forEach((pair) => {
      const wStr = formatMoveDisplay(pair.white);
      const bStr = formatMoveDisplay(pair.black);
      if (pair.white && pair.black) {
        moveChunks.push(`${pair.num}. ${wStr} ${bStr}`);
      } else if (pair.white) {
        moveChunks.push(`${pair.num}. ${wStr}`);
      } else if (pair.black) {
        moveChunks.push(`${pair.num}... ${bStr}`);
      }
    });

    pgn += moveChunks.join(' ') + ' *';
    navigator.clipboard.writeText(pgn);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Sparkline calculation for evaluation momentum
  const evalPoints = history.filter((m) => m.evalAfter !== undefined);

  return (
    <div className="flex flex-col w-full bg-slate-900 border border-slate-800 rounded-xl p-3 shadow-xl gap-2">
      <div className="flex items-center justify-between pb-2 border-b border-slate-800">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
          <span>История ходов</span>
          <span className="text-[10px] font-mono font-medium px-1.5 py-0.2 rounded bg-slate-800 text-slate-300">
            {history.length}
          </span>
        </h4>
        <button
          onClick={exportPGN}
          disabled={history.length === 0}
          className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200 bg-slate-800 hover:bg-slate-700 px-2 py-0.5 rounded transition-colors disabled:opacity-40 cursor-pointer"
          title="Скопировать стандартную PGN запись партии"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          <span>{copied ? 'Скопировано!' : 'PGN'}</span>
        </button>
      </div>

      {/* Opening Identifier Banner */}
      {opening && (
        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-950/40 border border-emerald-500/20 rounded-lg text-xs text-emerald-300 select-none">
          <BookOpen className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
          <span className="font-mono font-bold">{opening.eco}:</span>
          <span className="truncate">{opening.nameRu || opening.name}</span>
        </div>
      )}

      {/* Evaluation Momentum Strip */}
      {evalPoints.length > 2 && (
        <div className="flex items-center gap-2 px-1 text-[10px] text-slate-500">
          <TrendingUp className="w-3 h-3 text-slate-400 shrink-0" />
          <div className="flex-1 h-2 bg-slate-950 rounded overflow-hidden flex items-center">
            {evalPoints.map((m, idx) => {
              const score = m.evalAfter ?? 0;
              const isWhiteAdv = score >= 0;
              const opacity = Math.min(1, Math.max(0.2, Math.abs(score) / 400));
              return (
                <div
                  key={idx}
                  style={{
                    width: `${100 / evalPoints.length}%`,
                    height: '100%',
                    backgroundColor: isWhiteAdv ? '#F8FAFC' : '#1E293B',
                    opacity,
                  }}
                  title={`Ход ${idx + 1}: ${score > 0 ? '+' : ''}${(score / 100).toFixed(1)} cp`}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Move list scrollable area */}
      <div
        ref={scrollRef}
        className="h-36 sm:h-44 overflow-y-auto space-y-0.5 text-xs font-mono pr-1 select-none"
      >
        {movePairs.length === 0 ? (
          <div className="text-slate-500 italic text-center py-8">Ходов пока нет</div>
        ) : (
          movePairs.map((pair) => (
            <div
              key={pair.num}
              className="grid grid-cols-12 items-center hover:bg-slate-800/40 rounded px-1.5 py-0.5"
            >
              <span className="col-span-2 text-slate-500 font-semibold">{pair.num}.</span>

              {/* White move */}
              {pair.white && pair.whiteIdx !== undefined ? (
                <button
                  onClick={() => onNavigate(pair.whiteIdx!)}
                  className={`col-span-5 text-left px-2 py-0.5 rounded cursor-pointer transition-colors flex items-center justify-between ${
                    currentMoveIndex === pair.whiteIdx
                      ? 'bg-emerald-600/30 text-emerald-300 font-bold border border-emerald-500/40'
                      : 'text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  <span className="truncate">{formatMoveDisplay(pair.white)}</span>
                  {getClassificationBadge(pair.white.classification)}
                </button>
              ) : (
                <span className="col-span-5 text-slate-600 italic px-2">...</span>
              )}

              {/* Black move */}
              {pair.black && pair.blackIdx !== undefined ? (
                <button
                  onClick={() => onNavigate(pair.blackIdx!)}
                  className={`col-span-5 text-left px-2 py-0.5 rounded cursor-pointer transition-colors flex items-center justify-between ${
                    currentMoveIndex === pair.blackIdx
                      ? 'bg-emerald-600/30 text-emerald-300 font-bold border border-emerald-500/40'
                      : 'text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <span className="truncate">{formatMoveDisplay(pair.black)}</span>
                  {getClassificationBadge(pair.black.classification)}
                </button>
              ) : (
                <span className="col-span-5" />
              )}
            </div>
          ))
        )}
      </div>

      {/* Navigation button controls */}
      <div className="flex items-center justify-between pt-2 border-t border-slate-800">
        <button
          onClick={() => onNavigate(-1)}
          disabled={history.length === 0 || currentMoveIndex === -1}
          className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer"
          title="В начало партии"
        >
          <ChevronsLeft className="w-4 h-4" />
        </button>

        <button
          onClick={() => onNavigate(Math.max(-1, currentMoveIndex - 1))}
          disabled={history.length === 0 || currentMoveIndex === -1}
          className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer"
          title="Предыдущий ход"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        <span className="text-[11px] text-slate-500 font-sans">
          {currentMoveIndex === -1
            ? 'Старт'
            : `Ход ${currentMoveIndex + 1} / ${history.length}`}
        </span>

        <button
          onClick={() => onNavigate(Math.min(history.length - 1, currentMoveIndex + 1))}
          disabled={history.length === 0 || currentMoveIndex >= history.length - 1}
          className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer"
          title="Следующий ход"
        >
          <ChevronRight className="w-4 h-4" />
        </button>

        <button
          onClick={() => onNavigate(history.length - 1)}
          disabled={history.length === 0 || currentMoveIndex >= history.length - 1}
          className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer"
          title="В конец партии"
        >
          <ChevronsRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
