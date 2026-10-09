/**
 * Main Chess Application with HCE Engine, GM Opening Book, Eval Bar, UCI Support & Tactical Analysis.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  BoardState,
  Color,
  EngineSkillLevel,
  GameMode,
  GameStatus,
  HceBreakdown,
  Move,
  MoveClassification,
  SKILL_CONFIGS,
  SearchStats,
} from './types/chess';
import {
  cloneBoard,
  generateLegalMoves,
  getPositionKey,
  hasInsufficientMaterial,
  isKingInCheck,
  makeMove,
  moveToSAN,
  parseFEN,
  START_FEN,
  toFEN,
} from './engine/chessRules';
import { getHceBreakdown } from './engine/evaluation';
import { WasmChessSearchEngine } from './engine/wasmEngine';
import { UciEngine } from './engine/uci';
import { isSoundEnabled, playMoveSound, setSoundEnabled } from './engine/audio';
import { getBookMove, identifyOpening } from './engine/openingBook';
import { detectThreats, explainMove, TacticalThreat } from './engine/threats';
import { isTheoreticalDraw } from './engine/endgame';
import { Chessboard } from './components/Chessboard';
import { EvalBar } from './components/EvalBar';
import { EngineDashboard } from './components/EngineDashboard';
import { MoveHistory } from './components/MoveHistory';
import { PresetsModal } from './components/PresetsModal';
import { UciConsole } from './components/UciConsole';
import {
  RotateCcw,
  Volume2,
  VolumeX,
  Play,
  RotateCw,
  FolderOpen,
  User,
  Bot,
  Swords,
  Gauge,
  Terminal,
  Columns,
  Undo2,
  Lightbulb,
  AlertTriangle,
} from 'lucide-react';

export default function App() {
  // Game Board States
  const [boardState, setBoardState] = useState<BoardState>(() => parseFEN(START_FEN));
  const boardStateRef = useRef<BoardState>(boardState);
  boardStateRef.current = boardState;

  const [history, setHistory] = useState<Move[]>([]);
  const historyRef = useRef<Move[]>(history);
  historyRef.current = history;
  const stateSnapshotsRef = useRef<BoardState[]>([parseFEN(START_FEN)]);
  const [stateSnapshots, setStateSnapshots] = useState<BoardState[]>([parseFEN(START_FEN)]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);

  // Settings & Modes
  const [gameMode, setGameMode] = useState<GameMode>('player-vs-engine-white');
  const [orientation, setOrientation] = useState<Color>('w');
  const [soundOn, setSoundOn] = useState<boolean>(true);
  const [evalBarPosition, setEvalBarPosition] = useState<'left' | 'right' | 'hidden'>('left');

  // Engine Skill & Configuration
  const [skillLevel, setSkillLevel] = useState<EngineSkillLevel>('master');
  const [maxDepth, setMaxDepth] = useState<number>(8);
  const [timeLimitMs, setTimeLimitMs] = useState<number>(1500);
  const [useQuiescence, setUseQuiescence] = useState<boolean>(true);
  const [useOpeningBook, setUseOpeningBook] = useState<boolean>(true);

  // Engine State
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [searchStats, setSearchStats] = useState<SearchStats | null>(null);
  const [breakdown, setBreakdown] = useState<HceBreakdown | null>(null);

  // Tactical Analysis & Hints
  const [hintMove, setHintMove] = useState<Move | null>(null);
  const [activeHintExplanation, setActiveHintExplanation] = useState<string | null>(null);
  const [isCalculatingHint, setIsCalculatingHint] = useState<boolean>(false);

  // Modals & Panels
  const [isPresetsOpen, setIsPresetsOpen] = useState<boolean>(false);
  const [isUciOpen, setIsUciOpen] = useState<boolean>(false);

  // C / WebAssembly Search Engine & UCI Protocol Engine
  const wasmEngineRef = useRef<WasmChessSearchEngine>(new WasmChessSearchEngine());
  const uciEngineRef = useRef<UciEngine>(new UciEngine(wasmEngineRef.current));

  // Determine current active display board (allows reviewing past moves)
  const isBrowsingHistory = historyIndex >= 0 && historyIndex < history.length - 1;
  const displayedState = isBrowsingHistory ? stateSnapshots[historyIndex + 1] : boardState;
  const lastMove = history.length > 0 ? (isBrowsingHistory ? history[historyIndex] : history[history.length - 1]) : null;

  // Identify current opening from history
  const currentOpening = identifyOpening(history);

  // Tactical threats on displayed position
  const threats: TacticalThreat[] = detectThreats(displayedState);
  const threatSquares = threats.map((t) => t.targetSquare);

  // Determine Game Status with Threefold Repetition & Theoretical Endgame Draws
  const getGameStatus = useCallback(
    (state: BoardState, snapshots: BoardState[] = stateSnapshots): GameStatus => {
      const legalMoves = generateLegalMoves(state);
      const inCheck = isKingInCheck(state.board, state.turn);

      if (legalMoves.length === 0) {
        return inCheck ? 'checkmate' : 'stalemate';
      }
      if (state.halfmoveClock >= 100) {
        return 'draw-fifty-move';
      }

      // Check insufficient material and dead theoretical endgame draws
      const thDraw = isTheoreticalDraw(state.board);
      if (thDraw.isDraw || hasInsufficientMaterial(state.board)) {
        return 'draw-insufficient-material';
      }

      // Threefold repetition detection: check canonical position keys in history
      const currentKey = getPositionKey(state);
      let repetitionCount = 0;
      for (const snap of snapshots) {
        if (getPositionKey(snap) === currentKey) {
          repetitionCount++;
          if (repetitionCount >= 3) {
            return 'draw-threefold';
          }
        }
      }

      return inCheck ? 'check' : 'ongoing';
    },
    [stateSnapshots]
  );

  // Active game status for the displayed board
  const activeSnapshots = isBrowsingHistory
    ? stateSnapshots.slice(0, historyIndex + 2)
    : stateSnapshots;
  const gameStatus = getGameStatus(displayedState, activeSnapshots);

  // Update HCE breakdown whenever displayed board changes
  useEffect(() => {
    try {
      const bd = getHceBreakdown(displayedState);
      setBreakdown(bd);
    } catch (e) {
      console.error('Failed to compute HCE breakdown', e);
    }
  }, [displayedState]);

  // Handle Move Execution (Clean, single-invocation without strict mode duplicate bugs)
  const executeMove = useCallback((move: Move) => {
    const current = boardStateRef.current;

    // Strict legality verification against authentic board state
    const legalMoves = generateLegalMoves(current);
    const verifiedMove = legalMoves.find(
      (m) =>
        m.from === move.from &&
        m.to === move.to &&
        (!move.promotion || m.promotion === move.promotion)
    );

    if (!verifiedMove) {
      console.warn('Blocked illegal move attempt:', move);
      return;
    }

    // Clear active hint when any move is made
    setHintMove(null);
    setActiveHintExplanation(null);

    // Calculate move with SAN using authentic verified legal move
    const moveWithSan: Move = {
      ...verifiedMove,
      san: move.san || moveToSAN(current, verifiedMove),
    };

    const next = makeMove(current, moveWithSan);

    // Evaluate position after move for move quality classification
    const evalBd = getHceBreakdown(next);
    moveWithSan.evalAfter = evalBd.total;

    // Sound effects
    if (isKingInCheck(next.board, next.turn)) {
      playMoveSound('check');
    } else if (moveWithSan.isCastling) {
      playMoveSound('castle');
    } else if (moveWithSan.captured || moveWithSan.isEnPassant) {
      playMoveSound('capture');
    } else {
      playMoveSound('move');
    }

    // Direct atomic updates to prevent double-execution in React StrictMode
    setBoardState(next);
    boardStateRef.current = next;
    uciEngineRef.current.setBoard(next);

    // Keep last search metrics visible while updating score to current position
    setSearchStats((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        score: evalBd.total,
        isBookMove: false,
      };
    });

    setHistory((prevHist) => {
      // Guard against duplicate push of the exact same move
      if (prevHist.length > 0) {
        const last = prevHist[prevHist.length - 1];
        if (
          last.from === moveWithSan.from &&
          last.to === moveWithSan.to &&
          last.color === moveWithSan.color &&
          last.promotion === moveWithSan.promotion
        ) {
          return prevHist;
        }
      }
      return [...prevHist, moveWithSan];
    });

    setStateSnapshots((prevSnaps) => {
      const last = prevSnaps[prevSnaps.length - 1];
      if (last && last.turn === next.turn && last.fullmoveNumber === next.fullmoveNumber) {
        return prevSnaps;
      }
      return [...prevSnaps, next];
    });

    setHistoryIndex((prevIdx) => (prevIdx === -1 ? 0 : prevIdx + 1));
  }, []);

  // Engine Search Trigger with Grandmaster Opening Book Check
  const triggerEngineMove = useCallback(
    async (overrideState?: BoardState) => {
      const stateToSearch = overrideState || boardStateRef.current;
      const status = getGameStatus(stateToSearch);

      if (status === 'checkmate' || status === 'stalemate' || status.startsWith('draw')) {
        return;
      }

      // 1. Check Grandmaster Opening Book first
      if (useOpeningBook) {
        const bookMove = getBookMove(stateToSearch, historyRef.current);
        if (bookMove) {
          setSearchStats({
            depth: 1,
            selDepth: 1,
            nodes: 1,
            timeMs: 5,
            nps: 1200000,
            score: 0,
            bestMove: bookMove.move,
            pv: [bookMove.move],
            pvSan: [bookMove.move.san || bookMove.uci],
            isBookMove: true,
            opening: { eco: bookMove.eco, name: bookMove.name, nameRu: bookMove.nameRu },
          });

          // Short delay for realistic feel
          setTimeout(() => {
            executeMove(bookMove.move);
          }, 150);
          return;
        }
      }

      setIsSearching(true);

      try {
        const result = await wasmEngineRef.current.search(
          stateToSearch,
          {
            maxDepth,
            timeLimitMs,
            useQuiescence,
          },
          (progress) => {
            setSearchStats(progress);
          }
        );

        setSearchStats(result);

        if (result.bestMove) {
          executeMove(result.bestMove);
        }
      } catch (err) {
        console.error('Engine search error:', err);
      } finally {
        setIsSearching(false);
      }
    },
    [maxDepth, timeLimitMs, useQuiescence, useOpeningBook, history, executeMove, getGameStatus]
  );

  // Background analysis when in Analysis mode or waiting for player
  const triggerAnalysisOnly = useCallback(
    async (stateToAnalyze: BoardState) => {
      setIsSearching(true);
      try {
        const result = await wasmEngineRef.current.search(
          stateToAnalyze,
          {
            maxDepth: Math.min(6, maxDepth),
            timeLimitMs: Math.min(1200, timeLimitMs === 0 ? 1000 : timeLimitMs),
            useQuiescence,
          },
          (progress) => {
            setSearchStats(progress);
          }
        );
        setSearchStats(result);
      } catch (err) {
        console.error('Analysis error:', err);
      } finally {
        setIsSearching(false);
      }
    },
    [maxDepth, timeLimitMs, useQuiescence]
  );

  // Request Tactical Hint for Player
  const requestHint = useCallback(async () => {
    if (isCalculatingHint || isSearching) return;
    setIsCalculatingHint(true);

    try {
      // 1. Check opening book first
      if (useOpeningBook) {
        const bookMove = getBookMove(displayedState, historyRef.current);
        if (bookMove) {
          setHintMove(bookMove.move);
          setActiveHintExplanation(`Теория дебюта (${bookMove.eco} ${bookMove.nameRu}): ${bookMove.move.san}`);
          setIsCalculatingHint(false);
          return;
        }
      }

      // 2. Search engine calculation for best move
      const result = await wasmEngineRef.current.search(displayedState, {
        maxDepth: Math.min(6, maxDepth),
        timeLimitMs: 800,
        useQuiescence: true,
      });

      if (result.bestMove) {
        setHintMove(result.bestMove);
        const expl = explainMove(displayedState, result.bestMove);
        setActiveHintExplanation(`${result.bestMove.san ? result.bestMove.san + ': ' : ''}${expl}`);
      }
    } catch (e) {
      console.error('Hint error:', e);
    } finally {
      setIsCalculatingHint(false);
    }
  }, [displayedState, history, isCalculatingHint, isSearching, maxDepth, useOpeningBook]);

  // Handle skill level change
  const handleSkillLevelChange = (lvl: EngineSkillLevel) => {
    setSkillLevel(lvl);
    const cfg = SKILL_CONFIGS[lvl];
    setMaxDepth(cfg.depth);
    setTimeLimitMs(cfg.timeMs);
    setUseQuiescence(cfg.useQuiescence);
    setUseOpeningBook(cfg.useBook);
  };

  // Auto-play trigger for AI turns
  useEffect(() => {
    if (isBrowsingHistory) return;

    const status = getGameStatus(boardState);
    if (status === 'checkmate' || status === 'stalemate' || status.startsWith('draw')) {
      return;
    }

    if (gameMode === 'player-vs-engine-white' && boardState.turn === 'b') {
      const timer = setTimeout(() => triggerEngineMove(boardState), 200);
      return () => clearTimeout(timer);
    } else if (gameMode === 'player-vs-engine-black' && boardState.turn === 'w') {
      const timer = setTimeout(() => triggerEngineMove(boardState), 200);
      return () => clearTimeout(timer);
    } else if (gameMode === 'engine-vs-engine') {
      const timer = setTimeout(() => triggerEngineMove(boardState), 400);
      return () => clearTimeout(timer);
    } else if (gameMode === 'two-player-analysis') {
      const timer = setTimeout(() => triggerAnalysisOnly(boardState), 300);
      return () => clearTimeout(timer);
    }
  }, [
    boardState,
    gameMode,
    isBrowsingHistory,
    triggerEngineMove,
    triggerAnalysisOnly,
    getGameStatus,
  ]);

  // Handle New Game
  const resetGame = () => {
    wasmEngineRef.current.stop();
    setIsSearching(false);
    setHintMove(null);
    setActiveHintExplanation(null);
    const start = parseFEN(START_FEN);
    setBoardState(start);
    boardStateRef.current = start;
    uciEngineRef.current.setBoard(start);
    setHistory([]);
    setStateSnapshots([start]);
    setHistoryIndex(-1);
    setSearchStats(null);
  };

  // Flip Board
  const flipBoard = () => {
    setOrientation((prev) => (prev === 'w' ? 'b' : 'w'));
  };

  // Undo Move
  const undoMove = () => {
    if (isSearching) return;
    if (history.length === 0) return;

    setHintMove(null);
    setActiveHintExplanation(null);

    const stepCount =
      gameMode === 'player-vs-engine-white' || gameMode === 'player-vs-engine-black'
        ? history.length >= 2
          ? 2
          : 1
        : 1;

    const newHistLength = Math.max(0, history.length - stepCount);
    const targetState = stateSnapshots[newHistLength];

    setBoardState(targetState);
    boardStateRef.current = targetState;
    uciEngineRef.current.setBoard(targetState);
    setHistory(history.slice(0, newHistLength));
    setStateSnapshots(stateSnapshots.slice(0, newHistLength + 1));
    setHistoryIndex(newHistLength - 1);
  };

  // Load Custom FEN
  const loadFEN = (fen: string) => {
    wasmEngineRef.current.stop();
    setIsSearching(false);
    setHintMove(null);
    setActiveHintExplanation(null);
    try {
      const parsed = parseFEN(fen);
      setBoardState(parsed);
      boardStateRef.current = parsed;
      uciEngineRef.current.setBoard(parsed);
      setHistory([]);
      setStateSnapshots([parsed]);
      setHistoryIndex(-1);
      setSearchStats(null);
    } catch (e) {
      console.error('Invalid FEN loaded', e);
    }
  };

  // Sound toggle
  const toggleSound = () => {
    const nextVal = !soundOn;
    setSoundOn(nextVal);
    setSoundEnabled(nextVal);
  };

  // Toggle eval bar position (Left -> Right -> Hidden -> Left)
  const cycleEvalBar = () => {
    setEvalBarPosition((prev) => {
      if (prev === 'left') return 'right';
      if (prev === 'right') return 'hidden';
      return 'left';
    });
  };

  // Game mode change
  const handleModeChange = (mode: GameMode) => {
    setGameMode(mode);
    if (mode === 'player-vs-engine-white') {
      setOrientation('w');
    } else if (mode === 'player-vs-engine-black') {
      setOrientation('b');
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Header */}
      <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur-md sticky top-0 z-30 px-4 py-3">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shadow-inner">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-bold tracking-tight text-white flex items-center gap-2">
                Шахматный движок HCE
                <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  GM Book & UCI 2.0
                </span>
              </h1>
              <p className="text-xs text-slate-400 hidden sm:block">
                Классическая функция оценки (HCE), гроссмейстерская книга дебютов и протокол UCI
              </p>
            </div>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex items-center gap-2">
            {/* UCI Console Toggle Button */}
            <button
              onClick={() => setIsUciOpen((prev) => !prev)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors cursor-pointer ${
                isUciOpen
                  ? 'bg-emerald-600/30 border-emerald-500/60 text-emerald-300'
                  : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
              }`}
              title="Открыть интерактивную UCI консоль"
            >
              <Terminal className="w-4 h-4 text-emerald-400" />
              <span>UCI</span>
            </button>

            {/* Eval Bar position button */}
            <button
              onClick={cycleEvalBar}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-xs font-medium text-slate-200 transition-colors cursor-pointer"
              title="Переключить положение шкалы оценки (Слева / Справа / Скрыть)"
            >
              <Columns className="w-4 h-4 text-emerald-400" />
              <span className="hidden sm:inline">Шкала:</span>
              <span className="capitalize text-emerald-300 font-semibold">
                {evalBarPosition === 'left' ? 'Слева' : evalBarPosition === 'right' ? 'Справа' : 'Скрыта'}
              </span>
            </button>

            <button
              onClick={toggleSound}
              className={`p-2 rounded-lg border transition-colors cursor-pointer ${
                soundOn
                  ? 'bg-slate-800 border-slate-700 text-emerald-400'
                  : 'bg-slate-900 border-slate-800 text-slate-500'
              }`}
              title={soundOn ? 'Выключить звук' : 'Включить звук'}
            >
              {soundOn ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>

            <button
              onClick={() => setIsPresetsOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-xs font-medium text-slate-200 transition-colors cursor-pointer"
            >
              <FolderOpen className="w-4 h-4 text-emerald-400" />
              <span>FEN / Позиции</span>
            </button>

            <button
              onClick={resetGame}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-600/20 hover:bg-rose-600/30 border border-rose-500/30 rounded-lg text-xs font-semibold text-rose-300 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Сброс</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Board & Engine Work Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Chessboard + Eval Bar */}
        <div className="lg:col-span-7 flex flex-col items-center gap-3">
          {/* Status Alert Banner (Shown for terminal game over states: Checkmate, Stalemate, Draws) */}
          {gameStatus !== 'ongoing' && gameStatus !== 'check' && (
            <div
              className={`w-full max-w-[680px] py-2 px-4 rounded-xl border text-sm font-semibold flex items-center justify-between animate-fade-in ${
                gameStatus === 'checkmate'
                  ? 'bg-rose-500/20 border-rose-500/40 text-rose-300'
                  : 'bg-blue-500/20 border-blue-500/40 text-blue-300'
              }`}
            >
              <span>
                {gameStatus === 'checkmate' &&
                  `МАТ! Победили ${displayedState.turn === 'w' ? 'Чёрные' : 'Белые'}.`}
                {gameStatus === 'stalemate' && 'ПАТ! Ничья (нет доступных ходов).'}
                {gameStatus === 'draw-threefold' && 'Ничья! Троекратное повторение позиции.'}
                {gameStatus === 'draw-fifty-move' && 'Ничья по правилу 50 ходов.'}
                {gameStatus === 'draw-insufficient-material' &&
                  'Ничья из-за недостатка материала для мата.'}
              </span>
              <span className="text-xs font-mono uppercase opacity-75">
                Ход #{displayedState.fullmoveNumber}
              </span>
            </div>
          )}

          {/* Board + Eval Bar Container (Height perfectly matched and responsive) */}
          <div className="flex items-stretch gap-2.5 sm:gap-3 w-full max-w-[680px] justify-center mx-auto">
            {/* Real-time Vertical Evaluation Bar on the LEFT */}
            {evalBarPosition === 'left' && (
              <EvalBar
                score={searchStats?.score ?? breakdown?.total ?? 0}
                isMate={searchStats?.isMate}
                mateIn={searchStats?.mateIn}
                orientation={orientation}
              />
            )}

            {/* Interactive Chessboard */}
            <div className="flex-1 max-w-[600px] aspect-square">
              <Chessboard
                state={displayedState}
                orientation={orientation}
                lastMove={lastMove}
                bestMove={searchStats?.bestMove || null}
                hintMove={hintMove}
                threatSquares={threatSquares}
                isEngineThinking={isSearching}
                onMove={executeMove}
                disabled={isBrowsingHistory}
              />
            </div>

            {/* Real-time Vertical Evaluation Bar on the RIGHT */}
            {evalBarPosition === 'right' && (
              <EvalBar
                score={searchStats?.score ?? breakdown?.total ?? 0}
                isMate={searchStats?.isMate}
                mateIn={searchStats?.mateIn}
                orientation={orientation}
              />
            )}
          </div>

          {/* Under-board Controls Bar */}
          <div className="w-full max-w-[680px] flex flex-wrap items-center justify-between gap-2 p-2 bg-slate-900 border border-slate-800 rounded-xl text-xs">
            {/* Mode selection tabs */}
            <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
              <button
                onClick={() => handleModeChange('player-vs-engine-white')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                  gameMode === 'player-vs-engine-white'
                    ? 'bg-emerald-600 text-white font-semibold'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Играть белыми против движка"
              >
                <User className="w-3.5 h-3.5" />
                <span>Белые</span>
              </button>

              <button
                onClick={() => handleModeChange('player-vs-engine-black')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                  gameMode === 'player-vs-engine-black'
                    ? 'bg-emerald-600 text-white font-semibold'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Играть чёрными против движка"
              >
                <User className="w-3.5 h-3.5" />
                <span>Чёрные</span>
              </button>

              <button
                onClick={() => handleModeChange('two-player-analysis')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                  gameMode === 'two-player-analysis'
                    ? 'bg-emerald-600 text-white font-semibold'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Режим анализа и свободного разбора"
              >
                <Gauge className="w-3.5 h-3.5" />
                <span>Анализ</span>
              </button>

              <button
                onClick={() => handleModeChange('engine-vs-engine')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                  gameMode === 'engine-vs-engine'
                    ? 'bg-emerald-600 text-white font-semibold'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Движок играет сам с собой"
              >
                <Swords className="w-3.5 h-3.5" />
                <span>Бот vs Бот</span>
              </button>
            </div>

            {/* Board Utility Buttons */}
            <div className="flex items-center gap-1.5">
              {/* Hint Button */}
              <button
                onClick={requestHint}
                disabled={isSearching || isCalculatingHint}
                className="flex items-center gap-1 px-2.5 py-1 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-300 font-medium rounded-lg transition-colors cursor-pointer"
                title="Получить тактическую подсказку от движка"
              >
                <Lightbulb className="w-3.5 h-3.5" />
                <span>{isCalculatingHint ? 'Расчёт...' : 'Подсказка'}</span>
              </button>

              {/* Force Engine Move */}
              <button
                onClick={() => triggerEngineMove()}
                disabled={isSearching}
                className="flex items-center gap-1 px-3 py-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-medium rounded-lg transition-colors cursor-pointer shadow-sm"
                title="Заставить движок сделать ход прямо сейчас"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Ход движка</span>
              </button>

              <button
                onClick={undoMove}
                disabled={history.length === 0 || isSearching}
                className="p-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 border border-slate-700 rounded-lg text-slate-300 hover:text-white transition-colors cursor-pointer"
                title="Отменить ход"
              >
                <Undo2 className="w-4 h-4" />
              </button>

              <button
                onClick={flipBoard}
                className="p-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-slate-300 hover:text-white transition-colors cursor-pointer"
                title="Перевернуть доску"
              >
                <RotateCw className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Interactive UCI Console in Left Column */}
          <div className="w-full max-w-[680px]">
            <UciConsole
              uciEngine={uciEngineRef.current}
              boardState={boardState}
              onApplyMove={executeMove}
              isOpen={isUciOpen}
              onToggle={() => setIsUciOpen((prev) => !prev)}
            />
          </div>
        </div>

        {/* Right Column: Move History + Engine Dashboard & HCE Breakdown */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          {/* Move History Component with Momentum Graph and Opening Name */}
          <MoveHistory
            history={history}
            currentMoveIndex={historyIndex}
            onNavigate={(idx) => setHistoryIndex(idx)}
            opening={currentOpening}
          />

          {/* Real-time Search Diagnostics & HCE Detailed Breakdown */}
          <EngineDashboard
            stats={searchStats}
            breakdown={breakdown}
            isSearching={isSearching}
            maxDepth={maxDepth}
            onMaxDepthChange={setMaxDepth}
            timeLimitMs={timeLimitMs}
            onTimeLimitChange={setTimeLimitMs}
            useQuiescence={useQuiescence}
            onToggleQuiescence={() => setUseQuiescence((prev) => !prev)}
            skillLevel={skillLevel}
            onSkillLevelChange={handleSkillLevelChange}
            useOpeningBook={useOpeningBook}
            onToggleOpeningBook={() => setUseOpeningBook((prev) => !prev)}
            currentOpening={currentOpening}
            threats={threats}
            activeHint={activeHintExplanation}
            onClearHint={() => {
              setHintMove(null);
              setActiveHintExplanation(null);
            }}
          />
        </div>
      </main>

      {/* FEN / Test Presets Modal */}
      <PresetsModal
        isOpen={isPresetsOpen}
        onClose={() => setIsPresetsOpen(false)}
        onLoadFEN={loadFEN}
        currentFEN={toFEN(boardState)}
      />
    </div>
  );
}
