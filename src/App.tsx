import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  BoardState,
  Color,
  GameMode,
  GameStatus,
  Move,
  PieceType,
  PositionBreakdown,
  PreMove,
  SearchStats,
} from './types/chess';
import {
  generateLegalMoves,
  getPositionKey,
  hasInsufficientMaterial,
  isKingInCheck,
  makeMove,
  moveToSAN,
  parseFEN,
  squareToAlgebraic,
  START_FEN,
  toFEN,
} from './engine/chessRules';
import { getPositionBreakdown } from './engine/evaluation';
import { loadNnueModel } from './engine/nnue';
import { WasmChessSearchEngine } from './engine/wasmEngine';
import { UciEngine } from './engine/uci';
import { playMoveSound, setSoundEnabled } from './engine/audio';
import { getBookMove, identifyOpening } from './engine/openingBook';
import { explainMove } from './engine/threats';
import { isTheoreticalDraw } from './engine/endgame';
import {
  TimeControlConfig,
  TIME_PRESETS,
  calculateEngineMoveTime,
  formatClockTime,
} from './engine/timeManagement';
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
  Clock,
  Zap,
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

  // Time Management (Stockfish 19 Clocks & Time Controls)
  const [timeControl, setTimeControl] = useState<TimeControlConfig>(() => TIME_PRESETS[3]); // 3+2 Blitz default
  const [whiteTimeMs, setWhiteTimeMs] = useState<number>(() => TIME_PRESETS[3].initialSeconds * 1000);
  const [blackTimeMs, setBlackTimeMs] = useState<number>(() => TIME_PRESETS[3].initialSeconds * 1000);
  const whiteTimeMsRef = useRef<number>(whiteTimeMs);
  whiteTimeMsRef.current = whiteTimeMs;
  const blackTimeMsRef = useRef<number>(blackTimeMs);
  blackTimeMsRef.current = blackTimeMs;
  const [timeoutStatus, setTimeoutStatus] = useState<'timeout-white' | 'timeout-black' | null>(null);

  // Pre-moves (Предходы)
  const [preMove, setPreMove] = useState<PreMove | null>(null);
  const preMoveRef = useRef<PreMove | null>(null);
  preMoveRef.current = preMove;

  // Engine Configuration (Always Full Strength NNUE)
  const [maxDepth, setMaxDepth] = useState<number>(12);
  const [fixedTimeMs, setFixedTimeMs] = useState<number>(1500); // Fixed search time when untimed
  const [useQuiescence, setUseQuiescence] = useState<boolean>(true);
  const [useOpeningBook, setUseOpeningBook] = useState<boolean>(true);

  // Engine State
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const isSearchingRef = useRef<boolean>(isSearching);
  isSearchingRef.current = isSearching;
  const [searchStats, setSearchStats] = useState<SearchStats | null>(null);
  const [breakdown, setBreakdown] = useState<PositionBreakdown | null>(null);

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

  // Player color based on game mode
  const playerColor: Color | null =
    gameMode === 'player-vs-engine-white'
      ? 'w'
      : gameMode === 'player-vs-engine-black'
      ? 'b'
      : null;

  // Can player set a premove?
  const canPreMove =
    (gameMode === 'player-vs-engine-white' && (boardState.turn === 'b' || isSearching)) ||
    (gameMode === 'player-vs-engine-black' && (boardState.turn === 'w' || isSearching));

  // Determine Game Status with Threefold Repetition & Theoretical Endgame Draws
  const getGameStatus = useCallback(
    (state: BoardState, snapshots: BoardState[] = stateSnapshots): GameStatus => {
      if (timeoutStatus) {
        return timeoutStatus;
      }

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

      // Threefold repetition detection
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
    [stateSnapshots, timeoutStatus]
  );

  // Active game status for the displayed board
  const activeSnapshots = isBrowsingHistory
    ? stateSnapshots.slice(0, historyIndex + 2)
    : stateSnapshots;
  const gameStatus = getGameStatus(displayedState, activeSnapshots);

  // Clock Countdown Timer Effect (SF 19 Clocks)
  useEffect(() => {
    if (timeControl.initialSeconds <= 0) return;
    if (gameStatus !== 'ongoing' && gameStatus !== 'check') return;
    if (history.length === 0) return; // Clocks start when first move is made

    const interval = setInterval(() => {
      const turn = boardStateRef.current.turn;
      if (turn === 'w') {
        setWhiteTimeMs((prev) => {
          if (prev <= 100) {
            // White flagged
            wasmEngineRef.current.stop();
            setIsSearching(false);
            playMoveSound('gameover');
            setTimeoutStatus('timeout-white');
            return 0;
          }
          return prev - 100;
        });
      } else {
        setBlackTimeMs((prev) => {
          if (prev <= 100) {
            // Black flagged
            wasmEngineRef.current.stop();
            setIsSearching(false);
            playMoveSound('gameover');
            setTimeoutStatus('timeout-black');
            return 0;
          }
          return prev - 100;
        });
      }
    }, 100);

    return () => clearInterval(interval);
  }, [timeControl, gameStatus, history.length]);

  // Preload Stockfish NNUE model in background on startup
  useEffect(() => {
    loadNnueModel().then((model) => {
      if (model) {
        try {
          const bd = getPositionBreakdown(boardStateRef.current);
          setBreakdown(bd);
        } catch {
          // ignore
        }
      }
    });
  }, []);

  // Update position breakdown whenever displayed board changes
  useEffect(() => {
    try {
      const bd = getPositionBreakdown(displayedState);
      setBreakdown(bd);
    } catch (e) {
      console.error('Failed to compute position breakdown', e);
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

    // Add clock increment to side that just moved
    if (timeControl.initialSeconds > 0 && timeControl.incrementSeconds > 0) {
      if (current.turn === 'w') {
        setWhiteTimeMs((prev) => prev + timeControl.incrementSeconds * 1000);
      } else {
        setBlackTimeMs((prev) => prev + timeControl.incrementSeconds * 1000);
      }
    }

    // Evaluate position after move resolving tactical recaptures (Quiescence)
    const quiescentScore = wasmEngineRef.current.evaluateQuiescent(next);
    moveWithSan.evalAfter = quiescentScore;

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

    // Keep last search metrics visible while smoothly updating score with quiescent position score
    setSearchStats((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        score: quiescentScore,
        isBookMove: false,
      };
    });

    setHistory((prevHist) => {
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

    // CHECK FOR PRE-MOVE EXECUTION
    const pm = preMoveRef.current;
    if (pm) {
      const pCol = gameMode === 'player-vs-engine-white' ? 'w' : gameMode === 'player-vs-engine-black' ? 'b' : null;
      // If next turn is the player's turn, check if the premove is legal
      if (pCol === null || next.turn === pCol) {
        const nextLegals = generateLegalMoves(next);
        const matchPreMove = nextLegals.find(
          (m) =>
            m.from === pm.from &&
            m.to === pm.to &&
            (!pm.promotion || m.promotion === pm.promotion)
        );
        setPreMove(null);
        preMoveRef.current = null;
        if (matchPreMove) {
          // Pre-move is legal! Execute immediately with minimal tick
          setTimeout(() => {
            executeMove(matchPreMove);
          }, 30);
        }
      }
    }
  }, [timeControl, gameMode]);

  // Engine Search Trigger with Stockfish 19 Time Management
  const triggerEngineMove = useCallback(
    async (overrideState?: BoardState) => {
      const stateToSearch = overrideState || boardStateRef.current;
      const status = getGameStatus(stateToSearch);

      if (
        status === 'checkmate' ||
        status === 'stalemate' ||
        status.startsWith('draw') ||
        status.startsWith('timeout') ||
        isSearchingRef.current
      ) {
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

          setTimeout(() => {
            executeMove(bookMove.move);
          }, 150);
          return;
        }
      }

      isSearchingRef.current = true;
      setIsSearching(true);

      // Stockfish 19 Dynamic Time Allocation (read from stable refs)
      let allocatedTimeMs = fixedTimeMs;
      if (timeControl.initialSeconds > 0) {
        const engineTimeRemaining =
          stateToSearch.turn === 'w' ? whiteTimeMsRef.current : blackTimeMsRef.current;
        allocatedTimeMs = calculateEngineMoveTime(
          engineTimeRemaining,
          timeControl.incrementSeconds * 1000,
          stateToSearch.fullmoveNumber * 2
        );
      }

      try {
        const result = await wasmEngineRef.current.search(
          stateToSearch,
          {
            maxDepth, // Full strength deep search (e.g. 12-14)
            timeLimitMs: allocatedTimeMs,
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
        isSearchingRef.current = false;
        setIsSearching(false);
      }
    },
    [maxDepth, fixedTimeMs, timeControl, useQuiescence, useOpeningBook, executeMove, getGameStatus]
  );

  const triggerEngineMoveRef = useRef(triggerEngineMove);
  triggerEngineMoveRef.current = triggerEngineMove;

  // Background analysis when in Analysis mode or waiting for player
  const triggerAnalysisOnly = useCallback(
    async (stateToAnalyze: BoardState) => {
      if (isSearchingRef.current) return;
      isSearchingRef.current = true;
      setIsSearching(true);
      try {
        const result = await wasmEngineRef.current.search(
          stateToAnalyze,
          {
            maxDepth: Math.min(8, maxDepth),
            timeLimitMs: Math.min(1200, fixedTimeMs),
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
        isSearchingRef.current = false;
        setIsSearching(false);
      }
    },
    [maxDepth, fixedTimeMs, useQuiescence]
  );

  const triggerAnalysisOnlyRef = useRef(triggerAnalysisOnly);
  triggerAnalysisOnlyRef.current = triggerAnalysisOnly;

  // Request Tactical Hint for Player
  const requestHint = useCallback(async () => {
    if (isCalculatingHint || isSearchingRef.current) return;
    setIsCalculatingHint(true);

    try {
      if (useOpeningBook) {
        const bookMove = getBookMove(displayedState, historyRef.current);
        if (bookMove) {
          setHintMove(bookMove.move);
          setActiveHintExplanation(`Теория дебюта (${bookMove.eco} ${bookMove.nameRu}): ${bookMove.move.san}`);
          setIsCalculatingHint(false);
          return;
        }
      }

      const result = await wasmEngineRef.current.search(displayedState, {
        maxDepth: Math.min(8, maxDepth),
        timeLimitMs: 1000,
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
  }, [displayedState, history, isCalculatingHint, maxDepth, useOpeningBook]);

  // Auto-play trigger for AI turns
  useEffect(() => {
    if (isBrowsingHistory) return;

    const status = getGameStatus(boardState);
    if (status === 'checkmate' || status === 'stalemate' || status.startsWith('draw') || status.startsWith('timeout')) {
      return;
    }

    if (gameMode === 'player-vs-engine-white' && boardState.turn === 'b') {
      const timer = setTimeout(() => triggerEngineMoveRef.current(boardState), 150);
      return () => clearTimeout(timer);
    } else if (gameMode === 'player-vs-engine-black' && boardState.turn === 'w') {
      const timer = setTimeout(() => triggerEngineMoveRef.current(boardState), 150);
      return () => clearTimeout(timer);
    } else if (gameMode === 'engine-vs-engine') {
      const timer = setTimeout(() => triggerEngineMoveRef.current(boardState), 300);
      return () => clearTimeout(timer);
    } else if (gameMode === 'two-player-analysis') {
      const timer = setTimeout(() => triggerAnalysisOnlyRef.current(boardState), 200);
      return () => clearTimeout(timer);
    }
  }, [
    boardState,
    gameMode,
    isBrowsingHistory,
    getGameStatus,
  ]);

  // Handle New Game
  const resetGame = () => {
    wasmEngineRef.current.stop();
    setIsSearching(false);
    setHintMove(null);
    setActiveHintExplanation(null);
    setPreMove(null);
    setTimeoutStatus(null);

    const start = parseFEN(START_FEN);
    setBoardState(start);
    boardStateRef.current = start;
    uciEngineRef.current.setBoard(start);
    setHistory([]);
    setStateSnapshots([start]);
    setHistoryIndex(-1);
    setSearchStats(null);

    // Reset clocks
    const initMs = timeControl.initialSeconds * 1000;
    setWhiteTimeMs(initMs);
    whiteTimeMsRef.current = initMs;
    setBlackTimeMs(initMs);
    blackTimeMsRef.current = initMs;
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
    setPreMove(null);

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
    setPreMove(null);
    setTimeoutStatus(null);
    try {
      const parsed = parseFEN(fen);
      setBoardState(parsed);
      boardStateRef.current = parsed;
      uciEngineRef.current.setBoard(parsed);
      setHistory([]);
      setStateSnapshots([parsed]);
      setHistoryIndex(-1);
      setSearchStats(null);
      const initMs = timeControl.initialSeconds * 1000;
      setWhiteTimeMs(initMs);
      whiteTimeMsRef.current = initMs;
      setBlackTimeMs(initMs);
      blackTimeMsRef.current = initMs;
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
    setPreMove(null);
    if (mode === 'player-vs-engine-white') {
      setOrientation('w');
    } else if (mode === 'player-vs-engine-black') {
      setOrientation('b');
    }
  };

  // Change time control
  const handleTimeControlChange = (tcId: string) => {
    const found = TIME_PRESETS.find((p) => p.id === tcId) || TIME_PRESETS[0];
    setTimeControl(found);
    const ms = found.initialSeconds * 1000;
    setWhiteTimeMs(ms);
    whiteTimeMsRef.current = ms;
    setBlackTimeMs(ms);
    blackTimeMsRef.current = ms;
    setTimeoutStatus(null);
  };

  // Captured pieces and material counts
  const capturedPieces = useMemo(() => {
    const whiteCaptured: Record<PieceType, number> = { p: 8, n: 2, b: 2, r: 2, q: 1, k: 0 };
    const blackCaptured: Record<PieceType, number> = { p: 8, n: 2, b: 2, r: 2, q: 1, k: 0 };

    for (const piece of displayedState.board) {
      if (!piece) continue;
      if (piece.color === 'w') {
        whiteCaptured[piece.type] = Math.max(0, whiteCaptured[piece.type] - 1);
      } else {
        blackCaptured[piece.type] = Math.max(0, blackCaptured[piece.type] - 1);
      }
    }

    return {
      capturedFromWhite: whiteCaptured, // Captured from White (held by Black)
      capturedFromBlack: blackCaptured, // Captured from Black (held by White)
    };
  }, [displayedState.board]);

  // Determine top and bottom player identities
  const topColor: Color = orientation === 'w' ? 'b' : 'w';
  const bottomColor: Color = orientation === 'w' ? 'w' : 'b';

  const topIsEngine =
    (gameMode === 'player-vs-engine-white' && topColor === 'b') ||
    (gameMode === 'player-vs-engine-black' && topColor === 'w') ||
    gameMode === 'engine-vs-engine';

  const bottomIsEngine =
    (gameMode === 'player-vs-engine-white' && bottomColor === 'b') ||
    (gameMode === 'player-vs-engine-black' && bottomColor === 'w') ||
    gameMode === 'engine-vs-engine';

  const topName = topIsEngine
    ? 'Stockfish NNUE (2800+ ELO)'
    : topColor === 'w'
    ? 'Белые (Игрок)'
    : 'Чёрные (Игрок)';

  const bottomName = bottomIsEngine
    ? 'Stockfish NNUE (2800+ ELO)'
    : bottomColor === 'w'
    ? 'Вы (Белые)'
    : 'Вы (Чёрные)';

  const topTime = topColor === 'w' ? whiteTimeMs : blackTimeMs;
  const bottomTime = bottomColor === 'w' ? whiteTimeMs : blackTimeMs;
  const isTopTurn = displayedState.turn === topColor;
  const isBottomTurn = displayedState.turn === bottomColor;

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
                Шахматный движок Stockfish NNUE
                <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  HalfKAv2_hm^ • 1.3 млрд позиций
                </span>
              </h1>
              <p className="text-xs text-slate-400 hidden sm:block">
                Нейросеть 1024-15-32 (13 эпох на T80.oct2022.bestmove), тайм-менеджмент SF 19, предходы и GM-книга
              </p>
            </div>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex items-center gap-2">
            {/* Time Control Selector */}
            <div className="flex items-center gap-1.5 bg-slate-800 border border-slate-700 px-2.5 py-1 rounded-lg">
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              <select
                value={timeControl.id}
                onChange={(e) => handleTimeControlChange(e.target.value)}
                className="bg-transparent text-xs text-slate-200 font-medium focus:outline-none cursor-pointer"
                title="Выбор контроля времени"
              >
                {TIME_PRESETS.map((tc) => (
                  <option key={tc.id} value={tc.id} className="bg-slate-900 text-slate-200">
                    {tc.nameRu}
                  </option>
                ))}
              </select>
            </div>

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
              title="Переключить положение шкалы оценки"
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
              <span>FEN</span>
            </button>

            <button
              onClick={resetGame}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-600/20 hover:bg-rose-600/30 border border-rose-500/30 rounded-lg text-xs font-semibold text-rose-300 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Новая игра</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Board & Engine Work Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Chessboard + Eval Bar + Clocks */}
        <div className="lg:col-span-7 flex flex-col items-center gap-2.5">
          {/* Status Alert Banner (Shown for terminal game over states) */}
          {gameStatus !== 'ongoing' && gameStatus !== 'check' && (
            <div
              className={`w-full max-w-[620px] py-2.5 px-4 rounded-xl border text-sm font-semibold flex items-center justify-between shadow-lg animate-fade-in ${
                gameStatus === 'checkmate' || gameStatus.startsWith('timeout')
                  ? 'bg-rose-500/20 border-rose-500/40 text-rose-300'
                  : 'bg-blue-500/20 border-blue-500/40 text-blue-300'
              }`}
            >
              <span>
                {gameStatus === 'checkmate' &&
                  `МАТ! Победили ${displayedState.turn === 'w' ? 'Чёрные' : 'Белые'}.`}
                {gameStatus === 'timeout-white' && 'Время вышло! Чёрные победили по времени.'}
                {gameStatus === 'timeout-black' && 'Время вышло! Белые победили по времени.'}
                {gameStatus === 'stalemate' && 'ПАТ! Ничья (нет доступных ходов).'}
                {gameStatus === 'draw-threefold' && 'Ничья! Троекратное повторение позиции.'}
                {gameStatus === 'draw-fifty-move' && 'Ничья по правилу 50 ходов.'}
                {gameStatus === 'draw-insufficient-material' &&
                  'Ничья из-за недостатка материала для мата.'}
              </span>
              <span className="text-xs font-mono uppercase opacity-80">
                Ход #{displayedState.fullmoveNumber}
              </span>
            </div>
          )}

          {/* Top Player Banner & Chess Clock */}
          <div className="w-full max-w-[620px] flex items-center justify-between px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl shadow-md">
            <div className="flex items-center gap-2">
              <div className={`p-1.5 rounded-lg ${topIsEngine ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-300'}`}>
                {topIsEngine ? <Bot className="w-4 h-4" /> : <User className="w-4 h-4" />}
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                  {topName}
                  {topIsEngine && (
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400 font-mono">
                      SF NNUE
                    </span>
                  )}
                </span>
                {/* Captured pieces */}
                <div className="flex items-center gap-0.5 text-[11px] text-slate-400 font-mono">
                  {topColor === 'b' ? (
                    <>
                      {capturedPieces.capturedFromWhite.p > 0 && <span>♙{capturedPieces.capturedFromWhite.p}</span>}
                      {capturedPieces.capturedFromWhite.n > 0 && <span>♘{capturedPieces.capturedFromWhite.n}</span>}
                      {capturedPieces.capturedFromWhite.b > 0 && <span>♗{capturedPieces.capturedFromWhite.b}</span>}
                      {capturedPieces.capturedFromWhite.r > 0 && <span>♖{capturedPieces.capturedFromWhite.r}</span>}
                      {capturedPieces.capturedFromWhite.q > 0 && <span>♕{capturedPieces.capturedFromWhite.q}</span>}
                    </>
                  ) : (
                    <>
                      {capturedPieces.capturedFromBlack.p > 0 && <span>♟{capturedPieces.capturedFromBlack.p}</span>}
                      {capturedPieces.capturedFromBlack.n > 0 && <span>♞{capturedPieces.capturedFromBlack.n}</span>}
                      {capturedPieces.capturedFromBlack.b > 0 && <span>♝{capturedPieces.capturedFromBlack.b}</span>}
                      {capturedPieces.capturedFromBlack.r > 0 && <span>♜{capturedPieces.capturedFromBlack.r}</span>}
                      {capturedPieces.capturedFromBlack.q > 0 && <span>♛{capturedPieces.capturedFromBlack.q}</span>}
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Top Clock Display */}
            <div
              className={`font-mono text-sm sm:text-base font-bold px-3 py-1 rounded-lg border transition-all ${
                timeControl.initialSeconds === 0
                  ? 'bg-slate-950 text-slate-400 border-slate-800'
                  : isTopTurn
                  ? topTime < 10000
                    ? 'bg-rose-950/80 text-rose-300 border-rose-500 animate-pulse ring-2 ring-rose-500/40'
                    : topTime < 30000
                    ? 'bg-amber-950/80 text-amber-300 border-amber-500/80 ring-2 ring-amber-500/30'
                    : 'bg-emerald-950/80 text-emerald-300 border-emerald-500/80 ring-2 ring-emerald-500/30'
                  : 'bg-slate-950 text-slate-300 border-slate-800'
              }`}
            >
              {timeControl.initialSeconds === 0 ? '∞' : formatClockTime(topTime)}
            </div>
          </div>

          {/* Board + Eval Bar Container */}
          <div className="flex items-stretch gap-2.5 sm:gap-3 w-full max-w-[620px] justify-center mx-auto">
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
                isEngineThinking={isSearching}
                onMove={executeMove}
                disabled={isBrowsingHistory}
                preMove={preMove}
                onSetPreMove={setPreMove}
                onClearPreMove={() => setPreMove(null)}
                canPreMove={canPreMove}
                playerColor={playerColor}
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

          {/* Bottom Player Banner & Chess Clock */}
          <div className="w-full max-w-[620px] flex items-center justify-between px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl shadow-md">
            <div className="flex items-center gap-2">
              <div className={`p-1.5 rounded-lg ${bottomIsEngine ? 'bg-emerald-500/20 text-emerald-400' : 'bg-sky-500/20 text-sky-400'}`}>
                {bottomIsEngine ? <Bot className="w-4 h-4" /> : <User className="w-4 h-4" />}
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                  {bottomName}
                  {bottomIsEngine && (
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400 font-mono">
                      SF NNUE
                    </span>
                  )}
                </span>
                {/* Captured pieces */}
                <div className="flex items-center gap-0.5 text-[11px] text-slate-400 font-mono">
                  {bottomColor === 'b' ? (
                    <>
                      {capturedPieces.capturedFromWhite.p > 0 && <span>♙{capturedPieces.capturedFromWhite.p}</span>}
                      {capturedPieces.capturedFromWhite.n > 0 && <span>♘{capturedPieces.capturedFromWhite.n}</span>}
                      {capturedPieces.capturedFromWhite.b > 0 && <span>♗{capturedPieces.capturedFromWhite.b}</span>}
                      {capturedPieces.capturedFromWhite.r > 0 && <span>♖{capturedPieces.capturedFromWhite.r}</span>}
                      {capturedPieces.capturedFromWhite.q > 0 && <span>♕{capturedPieces.capturedFromWhite.q}</span>}
                    </>
                  ) : (
                    <>
                      {capturedPieces.capturedFromBlack.p > 0 && <span>♟{capturedPieces.capturedFromBlack.p}</span>}
                      {capturedPieces.capturedFromBlack.n > 0 && <span>♞{capturedPieces.capturedFromBlack.n}</span>}
                      {capturedPieces.capturedFromBlack.b > 0 && <span>♝{capturedPieces.capturedFromBlack.b}</span>}
                      {capturedPieces.capturedFromBlack.r > 0 && <span>♜{capturedPieces.capturedFromBlack.r}</span>}
                      {capturedPieces.capturedFromBlack.q > 0 && <span>♛{capturedPieces.capturedFromBlack.q}</span>}
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Bottom Clock Display */}
            <div
              className={`font-mono text-sm sm:text-base font-bold px-3 py-1 rounded-lg border transition-all ${
                timeControl.initialSeconds === 0
                  ? 'bg-slate-950 text-slate-400 border-slate-800'
                  : isBottomTurn
                  ? bottomTime < 10000
                    ? 'bg-rose-950/80 text-rose-300 border-rose-500 animate-pulse ring-2 ring-rose-500/40'
                    : bottomTime < 30000
                    ? 'bg-amber-950/80 text-amber-300 border-amber-500/80 ring-2 ring-amber-500/30'
                    : 'bg-emerald-950/80 text-emerald-300 border-emerald-500/80 ring-2 ring-emerald-500/30'
                  : 'bg-slate-950 text-slate-300 border-slate-800'
              }`}
            >
              {timeControl.initialSeconds === 0 ? '∞' : formatClockTime(bottomTime)}
            </div>
          </div>

          {/* Pre-move Active Notice Banner */}
          {preMove && (
            <div className="w-full max-w-[620px] py-1.5 px-3 bg-sky-950/80 border border-sky-500/40 rounded-lg text-xs text-sky-200 flex items-center justify-between shadow-sm animate-fade-in">
              <span className="flex items-center gap-2 font-medium">
                <span className="w-2 h-2 rounded-full bg-sky-400 animate-ping inline-block" />
                <span>
                  Предход активен: <strong className="text-white font-mono">{squareToAlgebraic(preMove.from)} → {squareToAlgebraic(preMove.to)}{preMove.promotion ? `=${preMove.promotion.toUpperCase()}` : ''}</strong>
                </span>
              </span>
              <button
                onClick={() => setPreMove(null)}
                className="text-[11px] text-sky-300 hover:text-white underline cursor-pointer"
              >
                Отменить (ПКМ)
              </button>
            </div>
          )}

          {/* Under-board Controls Bar */}
          <div className="w-full max-w-[620px] flex flex-wrap items-center justify-between gap-2 p-2 bg-slate-900 border border-slate-800 rounded-xl text-xs">
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
          <div className="w-full max-w-[620px]">
            <UciConsole
              uciEngine={uciEngineRef.current}
              boardState={boardState}
              onApplyMove={executeMove}
              isOpen={isUciOpen}
              onToggle={() => setIsUciOpen((prev) => !prev)}
            />
          </div>
        </div>

        {/* Right Column: Move History + Engine Dashboard & NNUE Breakdown */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          {/* Move History Component with Momentum Graph and Opening Name */}
          <MoveHistory
            history={history}
            currentMoveIndex={historyIndex}
            onNavigate={(idx) => setHistoryIndex(idx)}
            opening={currentOpening}
          />

          {/* Real-time Search Diagnostics & NNUE Detailed Breakdown */}
          <EngineDashboard
            stats={searchStats}
            breakdown={breakdown}
            isSearching={isSearching}
            maxDepth={maxDepth}
            onMaxDepthChange={setMaxDepth}
            fixedTimeMs={fixedTimeMs}
            onFixedTimeMsChange={setFixedTimeMs}
            useQuiescence={useQuiescence}
            onToggleQuiescence={() => setUseQuiescence((prev) => !prev)}
            useOpeningBook={useOpeningBook}
            onToggleOpeningBook={() => setUseOpeningBook((prev) => !prev)}
            currentOpening={currentOpening}
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
