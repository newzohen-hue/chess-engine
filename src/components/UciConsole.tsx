import React, { useState, useEffect, useRef } from 'react';
import { UciEngine } from '../engine/uci';
import { BoardState, Move } from '../types/chess';
import { toFEN } from '../engine/chessRules';
import {
  Terminal,
  Send,
  Trash2,
  Copy,
  Check,
  Play,
  Square,
  RefreshCw,
  Sliders,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface UciConsoleProps {
  uciEngine: UciEngine;
  boardState: BoardState;
  onApplyMove?: (move: Move) => void;
  isOpen: boolean;
  onToggle: () => void;
}

export const UciConsole: React.FC<UciConsoleProps> = ({
  uciEngine,
  boardState,
  onApplyMove,
  isOpen,
  onToggle,
}) => {
  const [logs, setLogs] = useState<string[]>([
    'HCE Chess Engine UCI Protocol ready.',
    "Type 'uci', 'isready', 'position startpos', 'go depth 6', or 'eval'.",
  ]);
  const [inputCmd, setInputCmd] = useState<string>('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState<number>(-1);
  const [copied, setCopied] = useState<boolean>(false);
  const [lastBestMove, setLastBestMove] = useState<{ uci: string; move: Move | null } | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Subscribe to UCI output
  useEffect(() => {
    const unsubscribe = uciEngine.subscribe({
      onOutput: (line) => {
        setLogs((prev) => [...prev.slice(-300), line]);
      },
      onBestMove: (moveUci, move) => {
        setLastBestMove({ uci: moveUci, move });
      },
    });

    return () => {
      unsubscribe();
    };
  }, [uciEngine]);

  // Auto-scroll when logs update
  useEffect(() => {
    if (scrollRef.current && isOpen) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, isOpen]);

  const handleSendCommand = (cmdToSend?: string) => {
    const cmd = cmdToSend ?? inputCmd;
    if (!cmd.trim()) return;

    uciEngine.processCommand(cmd);
    setHistory((prev) => [...prev, cmd]);
    setHistoryIdx(-1);
    setInputCmd('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSendCommand();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (history.length === 0) return;
      const nextIdx = historyIdx === -1 ? history.length - 1 : Math.max(0, historyIdx - 1);
      setHistoryIdx(nextIdx);
      setInputCmd(history[nextIdx]);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIdx === -1) return;
      const nextIdx = historyIdx + 1;
      if (nextIdx >= history.length) {
        setHistoryIdx(-1);
        setInputCmd('');
      } else {
        setHistoryIdx(nextIdx);
        setInputCmd(history[nextIdx]);
      }
    }
  };

  const handleCopyLogs = () => {
    navigator.clipboard.writeText(logs.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClearLogs = () => {
    setLogs(['Terminal cleared. UCI ready.']);
    setLastBestMove(null);
  };

  const handleSyncPosition = () => {
    const fen = toFEN(boardState);
    handleSendCommand(`position fen ${fen}`);
  };

  return (
    <div className="w-full bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl flex flex-col">
      {/* Header with expand/collapse */}
      <div
        onClick={onToggle}
        className="flex items-center justify-between px-4 py-3 bg-slate-800/80 hover:bg-slate-800 cursor-pointer select-none transition-colors border-b border-slate-700/50"
      >
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-emerald-400" />
          <span className="text-xs font-bold uppercase tracking-wider text-slate-200">
            UCI Консоль & Протокол
          </span>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            UCI 2.0
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="text-slate-400 hover:text-white p-1 rounded transition-colors"
          >
            {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Expanded Console Body */}
      {isOpen && (
        <div className="flex flex-col p-3 gap-2.5">
          {/* Quick Command Chips */}
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-mono pb-2 border-b border-slate-800">
            <span className="text-slate-500 mr-1 text-[10px] uppercase font-sans">Команды:</span>
            <button
              onClick={() => handleSendCommand('uci')}
              className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 hover:border-emerald-500/50 transition-colors cursor-pointer"
            >
              uci
            </button>
            <button
              onClick={() => handleSendCommand('isready')}
              className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 hover:border-emerald-500/50 transition-colors cursor-pointer"
            >
              isready
            </button>
            <button
              onClick={() => handleSendCommand('ucinewgame')}
              className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 hover:border-emerald-500/50 transition-colors cursor-pointer"
            >
              ucinewgame
            </button>
            <button
              onClick={handleSyncPosition}
              className="px-2 py-0.5 rounded bg-emerald-950/60 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-700/50 transition-colors cursor-pointer flex items-center gap-1"
              title="Загрузить текущую позицию с доски в движок"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Синхр. позицию</span>
            </button>
            <button
              onClick={() => handleSendCommand('go depth 6')}
              className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 hover:border-emerald-500/50 transition-colors cursor-pointer"
            >
              go depth 6
            </button>
            <button
              onClick={() => handleSendCommand('eval')}
              className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 hover:border-emerald-500/50 transition-colors cursor-pointer"
            >
              eval
            </button>
            <button
              onClick={() => handleSendCommand('d')}
              className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 hover:border-emerald-500/50 transition-colors cursor-pointer"
            >
              d (доска)
            </button>
            <button
              onClick={() => handleSendCommand('stop')}
              className="px-2 py-0.5 rounded bg-rose-950/60 hover:bg-rose-900/60 text-rose-300 border border-rose-700/50 transition-colors cursor-pointer"
            >
              stop
            </button>

            <div className="ml-auto flex items-center gap-1">
              <button
                onClick={handleCopyLogs}
                className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition-colors cursor-pointer"
                title="Скопировать лог"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
              <button
                onClick={handleClearLogs}
                className="p-1 text-slate-400 hover:text-rose-400 rounded hover:bg-slate-800 transition-colors cursor-pointer"
                title="Очистить терминал"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Terminal log output */}
          <div
            ref={scrollRef}
            className="h-44 sm:h-52 bg-slate-950/90 rounded-lg p-2.5 font-mono text-xs overflow-y-auto space-y-0.5 border border-slate-800/80 select-text"
          >
            {logs.map((log, index) => {
              const isCommand = log.startsWith('>');
              const isInfo = log.startsWith('info');
              const isBestMove = log.startsWith('bestmove');
              const isReadyOk = log === 'readyok' || log === 'uciok';
              const isEvalHeader = log.startsWith('===');

              let color = 'text-slate-300';
              if (isCommand) color = 'text-amber-400 font-semibold';
              else if (isBestMove) color = 'text-emerald-400 font-bold';
              else if (isReadyOk) color = 'text-purple-400 font-semibold';
              else if (isInfo) color = 'text-sky-300/80';
              else if (isEvalHeader) color = 'text-emerald-300 font-bold';

              return (
                <div key={index} className={`whitespace-pre-wrap leading-tight ${color}`}>
                  {log}
                </div>
              );
            })}
          </div>

          {/* Apply best move banner if available */}
          {lastBestMove && lastBestMove.move && onApplyMove && (
            <div className="flex items-center justify-between bg-emerald-950/40 border border-emerald-500/30 px-3 py-1.5 rounded-lg text-xs">
              <span className="text-emerald-300 font-medium">
                Лучший ход найден: <span className="font-mono font-bold">{lastBestMove.uci}</span>
              </span>
              <button
                onClick={() => onApplyMove(lastBestMove.move!)}
                className="flex items-center gap-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[11px] font-semibold transition-colors cursor-pointer"
              >
                <Play className="w-3 h-3 fill-current" />
                <span>Сделать ход на доске</span>
              </button>
            </div>
          )}

          {/* Input field */}
          <div className="flex items-center gap-2 bg-slate-950 border border-slate-700/80 rounded-lg px-2.5 py-1.5 focus-within:border-emerald-500/70 transition-colors">
            <span className="text-emerald-400 font-mono text-xs select-none">uci&gt;</span>
            <input
              ref={inputRef}
              type="text"
              value={inputCmd}
              onChange={(e) => setInputCmd(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Введите команду (например: go depth 6, eval, uci)..."
              className="flex-1 bg-transparent text-xs font-mono text-white placeholder-slate-500 focus:outline-none"
            />
            <button
              onClick={() => handleSendCommand()}
              disabled={!inputCmd.trim()}
              className="p-1 rounded text-slate-400 hover:text-emerald-400 disabled:opacity-40 transition-colors cursor-pointer"
              title="Отправить команду"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
