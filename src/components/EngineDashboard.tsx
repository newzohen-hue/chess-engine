import React, { useState } from 'react';
import { PositionBreakdown, SearchStats } from '../types/chess';
import { BenchmarkSuiteResult, runWasmEngineBenchmark } from '../engine/benchmark';
import {
  Cpu,
  Layers,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Zap,
  Gauge,
  Loader2,
  BookOpen,
  Lightbulb,
  Binary,
  TrendingUp,
} from 'lucide-react';

interface EngineDashboardProps {
  stats: SearchStats | null;
  breakdown: PositionBreakdown | null;
  isSearching: boolean;
  maxDepth: number;
  onMaxDepthChange: (depth: number) => void;
  fixedTimeMs: number;
  onFixedTimeMsChange: (ms: number) => void;
  useQuiescence: boolean;
  onToggleQuiescence: () => void;
  useOpeningBook: boolean;
  onToggleOpeningBook: () => void;
  currentOpening?: { eco: string; name: string; nameRu: string } | null;
  activeHint?: string | null;
  onClearHint?: () => void;
}

export const EngineDashboard: React.FC<EngineDashboardProps> = ({
  stats,
  breakdown,
  isSearching,
  maxDepth,
  onMaxDepthChange,
  fixedTimeMs,
  onFixedTimeMsChange,
  useQuiescence,
  onToggleQuiescence,
  useOpeningBook,
  onToggleOpeningBook,
  currentOpening,
  activeHint,
  onClearHint,
}) => {
  const [showBreakdown, setShowBreakdown] = useState<boolean>(true);
  const [isBenchmarking, setIsBenchmarking] = useState<boolean>(false);
  const [benchProgress, setBenchProgress] = useState<string>('');
  const [benchResults, setBenchResults] = useState<BenchmarkSuiteResult | null>(null);

  const formatScore = (score: number, isMate?: boolean, mateIn?: number) => {
    if (isMate && mateIn !== undefined) {
      return mateIn > 0 ? `+M${mateIn}` : `-M${Math.abs(mateIn)}`;
    }
    const cp = score / 100;
    return (score > 0 ? '+' : '') + cp.toFixed(2);
  };

  const scoreStr = stats
    ? formatScore(stats.score, stats.isMate, stats.mateIn)
    : breakdown
    ? formatScore(breakdown.total)
    : '0.00';

  const handleRunBenchmark = async () => {
    if (isSearching || isBenchmarking) return;
    setIsBenchmarking(true);
    setBenchProgress('Запуск C / WebAssembly бенчмарка...');
    try {
      const res = await runWasmEngineBenchmark((idx, total, name) => {
        setBenchProgress(`Тест [${idx}/${total}]: ${name}...`);
      });
      setBenchResults(res);
      setBenchProgress('');
    } catch (err) {
      console.error('Benchmark failed', err);
      setBenchProgress('Ошибка теста');
    } finally {
      setIsBenchmarking(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 w-full bg-slate-900 border border-slate-800 rounded-xl p-4 text-slate-200 shadow-xl">
      {/* Engine Status Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-lg">
            <Cpu className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold tracking-tight text-white flex items-center gap-2">
              Шахматный движок
              <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded border font-bold bg-emerald-500/20 text-emerald-300 border-emerald-500/40">
                🧠 Stockfish NNUE • 2800+ ELO
              </span>
            </h3>
            <p className="text-xs text-slate-400">
              {isSearching ? (
                <span className="text-emerald-400 flex items-center gap-1 font-medium">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping inline-block" />
                  Нейросетевой расчёт на полную силу...
                </span>
              ) : stats?.isBookMove ? (
                <span className="text-sky-300 font-medium flex items-center gap-1">
                  <BookOpen className="w-3 h-3" /> Ход по дебютной книге GM
                </span>
              ) : (
                'Полная сила игры (всегда максимальный расчёт)'
              )}
            </p>
          </div>
        </div>

        {/* Current Score Display */}
        <div className="flex flex-col items-end">
          <span className="text-[10px] uppercase text-slate-500 font-semibold tracking-wider flex items-center gap-1">
            <span>Оценка</span>
            <span className="text-emerald-400 font-mono">(NNUE)</span>
          </span>
          <span
            className={`text-lg font-mono font-bold ${
              stats?.isMate
                ? 'text-purple-400'
                : (stats?.score ?? 0) > 40
                ? 'text-emerald-400'
                : (stats?.score ?? 0) < -40
                ? 'text-rose-400'
                : 'text-slate-300'
            }`}
          >
            {scoreStr}
          </span>
        </div>
      </div>

      {/* Engine Full Strength Status Badge */}
      <div className="flex items-center justify-between bg-slate-950/70 p-2.5 rounded-lg border border-slate-800 text-xs">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-amber-400 shrink-0" />
          <div>
            <span className="font-semibold text-white">Режим игры: </span>
            <span className="text-slate-300">Всегда на полную силу (без ослабления)</span>
          </div>
        </div>
        <span className="text-[11px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 font-semibold">
          Stockfish 19 TM
        </span>
      </div>

      {/* Active Hint Banner if requested */}
      {activeHint && (
        <div className="flex items-start justify-between gap-2 p-2.5 rounded-lg bg-emerald-950/40 border border-emerald-500/30 text-xs">
          <div className="flex items-start gap-2">
            <Lightbulb className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-emerald-300">Подсказка от движка: </span>
              <span className="text-slate-200">{activeHint}</span>
            </div>
          </div>
          {onClearHint && (
            <button
              onClick={onClearHint}
              className="text-slate-500 hover:text-slate-300 text-xs cursor-pointer p-0.5"
            >
              ✕
            </button>
          )}
        </div>
      )}

      {/* Search Diagnostics Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
        <div className="bg-slate-950/60 border border-slate-800 p-2 rounded-lg">
          <span className="text-slate-500 text-[10px] block uppercase font-semibold">Глубина</span>
          <span className="font-mono font-bold text-sm text-slate-100">
            {stats ? `${stats.depth} / ${stats.selDepth}` : '—'}
          </span>
        </div>

        <div className="bg-slate-950/60 border border-slate-800 p-2 rounded-lg">
          <span className="text-slate-500 text-[10px] block uppercase font-semibold">Узлы</span>
          <span className="font-mono font-bold text-sm text-slate-100">
            {stats ? stats.nodes.toLocaleString() : '—'}
          </span>
        </div>

        <div className="bg-slate-950/60 border border-slate-800 p-2 rounded-lg">
          <span className="text-slate-500 text-[10px] block uppercase font-semibold">Скорость (NPS)</span>
          <span className="font-mono font-bold text-sm text-emerald-400">
            {stats ? stats.nps.toLocaleString() : '—'}
          </span>
        </div>

        <div className="bg-slate-950/60 border border-slate-800 p-2 rounded-lg">
          <span className="text-slate-500 text-[10px] block uppercase font-semibold">Время поиска</span>
          <span className="font-mono font-bold text-sm text-slate-100">
            {stats ? `${stats.timeMs} ms` : '—'}
          </span>
        </div>
      </div>

      {/* Principal Variation (PV Line) */}
      {stats && stats.pvSan && stats.pvSan.length > 0 && (
        <div className="bg-slate-950/70 border border-slate-800 p-2.5 rounded-lg text-xs font-mono">
          <span className="text-slate-500 uppercase text-[10px] font-sans font-bold block mb-1">
            Основной вариант (PV Line):
          </span>
          <div className="flex flex-wrap gap-1 text-emerald-300 font-medium">
            {stats.pvSan.map((m, idx) => (
              <span key={idx} className="hover:text-white transition-colors">
                {idx % 2 === 0 ? `${Math.floor(idx / 2) + 1}. ` : ''}
                {m}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Engine Search Settings Accordion */}
      <div className="border border-slate-800 bg-slate-950/40 rounded-lg p-2.5 flex flex-col gap-2">
        <div className="flex items-center justify-between text-xs font-semibold text-slate-400">
          <span className="flex items-center gap-1.5">
            <Gauge className="w-3.5 h-3.5 text-blue-400" />
            <span>Параметры расчёта:</span>
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
          <div>
            <label className="text-[11px] text-slate-400 block mb-1">
              Макс. глубина: <span className="text-white font-mono font-bold">{maxDepth}</span>
            </label>
            <input
              type="range"
              min="4"
              max="16"
              value={maxDepth}
              onChange={(e) => onMaxDepthChange(parseInt(e.target.value, 10))}
              className="w-full accent-emerald-500 cursor-pointer"
            />
          </div>

          <div>
            <label className="text-[11px] text-slate-400 block mb-1">
              Фикс. время (без часов):
            </label>
            <select
              value={fixedTimeMs}
              onChange={(e) => onFixedTimeMsChange(parseInt(e.target.value, 10))}
              className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200 text-xs focus:outline-none"
            >
              <option value={800}>0.8 сек</option>
              <option value={1500}>1.5 сек (стандарт)</option>
              <option value={2000}>2.0 сек</option>
              <option value={3000}>3.0 сек (глубокий)</option>
              <option value={5000}>5.0 сек (макс)</option>
            </select>
          </div>

          <div className="flex items-center justify-between gap-1 pt-3 sm:pt-0">
            <button
              onClick={onToggleOpeningBook}
              className={`flex-1 py-1.5 px-2 rounded border text-[11px] font-medium transition-colors cursor-pointer ${
                useOpeningBook
                  ? 'bg-sky-600/30 border-sky-500/50 text-sky-300 font-semibold'
                  : 'bg-slate-900 border-slate-800 text-slate-500'
              }`}
            >
              📖 Дебютная книга
            </button>
            <button
              onClick={onToggleQuiescence}
              className={`flex-1 py-1.5 px-2 rounded border text-[11px] font-medium transition-colors cursor-pointer ${
                useQuiescence
                  ? 'bg-emerald-600/30 border-emerald-500/50 text-emerald-300 font-semibold'
                  : 'bg-slate-900 border-slate-800 text-slate-500'
              }`}
            >
              Quiescence
            </button>
          </div>
        </div>
      </div>

      {/* Detailed Position & Neural Network Evaluation Breakdown (Pure NNUE) */}
      {breakdown && (
        <div className="border border-slate-800 bg-slate-950/50 rounded-lg overflow-hidden">
          <button
            onClick={() => setShowBreakdown((prev) => !prev)}
            className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800/40 transition-colors cursor-pointer select-none"
          >
            <span className="flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-emerald-400" />
              <span>Детальный анализ позиции (NNUE)</span>
            </span>
            <span className="flex items-center gap-2 text-slate-500">
              <span className="text-[10px] font-mono">
                Фаза: {breakdown.gamePhase > 0.5 ? 'Миттельшпиль' : 'Эндшпиль'} ({breakdown.gamePhase})
              </span>
              {showBreakdown ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </span>
          </button>

          {showBreakdown && (
            <div className="p-3 pt-1 border-t border-slate-800/60 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              {/* NNUE Evaluation */}
              <div className="flex items-center justify-between p-2 rounded bg-emerald-950/40 border border-emerald-500/30">
                <span className="text-emerald-300 font-medium flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-400" /> Оценка нейросети (NNUE):
                </span>
                <span className="font-mono font-bold text-emerald-200">
                  {breakdown.nnueScore > 0 ? '+' : ''}{(breakdown.nnueScore / 100).toFixed(2)} ({breakdown.nnueScore} cp)
                </span>
              </div>

              {/* Win Probability (Stockfish WDL Model) */}
              <div className="flex items-center justify-between p-2 rounded bg-slate-900/80 border border-slate-800">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-sky-400" /> Вероятность победы белых:
                </span>
                <span className="font-mono font-bold text-sky-300">
                  {breakdown.winProbabilityWhite}%
                </span>
              </div>

              {/* Piece Inventory on Board */}
              <div className="p-2 rounded bg-slate-900/80 border border-slate-800 sm:col-span-2">
                <div className="flex items-center justify-between mb-1.5 text-slate-400">
                  <span>Фактический баланс фигур на доске:</span>
                  <span className="font-mono font-bold text-white">
                    {breakdown.materialBalance > 0 ? `+${breakdown.materialBalance} пешки белым` : breakdown.materialBalance < 0 ? `${breakdown.materialBalance} пешки чёрным` : 'Равновесие (0)'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 font-mono text-[11px]">
                  <div className="bg-slate-950/60 p-1.5 rounded text-slate-300 flex items-center justify-between">
                    <span>Белые:</span>
                    <span>
                      ♙{breakdown.whitePieces.p} ♘{breakdown.whitePieces.n} ♗{breakdown.whitePieces.b} ♖{breakdown.whitePieces.r} ♕{breakdown.whitePieces.q}
                    </span>
                  </div>
                  <div className="bg-slate-950/60 p-1.5 rounded text-slate-300 flex items-center justify-between">
                    <span>Чёрные:</span>
                    <span>
                      ♟{breakdown.blackPieces.p} ♞{breakdown.blackPieces.n} ♝{breakdown.blackPieces.b} ♜{breakdown.blackPieces.r} ♛{breakdown.blackPieces.q}
                    </span>
                  </div>
                </div>
              </div>

              {/* Network Architecture Details */}
              <div className="p-2 rounded bg-slate-900/80 border border-slate-800 sm:col-span-2 flex items-center justify-between text-[11px] text-slate-400">
                <span className="flex items-center gap-1.5">
                  <Binary className="w-3.5 h-3.5 text-emerald-400" /> Архитектура:
                </span>
                <span className="font-mono text-slate-300">
                  Stockfish HalfKAv2_hm (2x1024 → 16 → 32 → 1) • Квантование INT8
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* C / WebAssembly Benchmark Button & Results */}
      <div className="pt-1">
        <button
          onClick={handleRunBenchmark}
          disabled={isSearching || isBenchmarking}
          className="w-full flex items-center justify-center gap-2 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 font-medium rounded-lg text-xs transition-colors cursor-pointer border border-slate-700 shadow-sm"
        >
          {isBenchmarking ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
              <span>{benchProgress || 'Тестирование...'}</span>
            </>
          ) : (
            <>
              <Zap className="w-3.5 h-3.5 text-emerald-400" />
              <span>Запустить C / WASM тест скорости (NPS Benchmark)</span>
            </>
          )}
        </button>

        {benchResults && (
          <div className="mt-2 p-2.5 rounded-lg bg-emerald-950/30 border border-emerald-500/30 text-xs">
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-semibold text-emerald-300">Результаты бенчмарка:</span>
              <span className="font-mono font-bold text-emerald-400">
                {benchResults.averageNps.toLocaleString()} NPS (avg)
              </span>
            </div>
            <div className="space-y-1 font-mono text-[11px] text-slate-300">
              {benchResults.results.map((r, i) => (
                <div key={i} className="flex justify-between border-b border-slate-800/40 pb-0.5">
                  <span className="truncate max-w-[200px] text-slate-400">{r.name}</span>
                  <span className="font-bold">{r.nps.toLocaleString()} NPS</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
