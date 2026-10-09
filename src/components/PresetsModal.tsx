import React, { useState } from 'react';
import { Copy, Check, Upload, BookOpen, X } from 'lucide-react';
import { START_FEN } from '../engine/chessRules';

interface PresetsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentFEN: string;
  onLoadFEN: (fen: string) => void;
}

interface PresetItem {
  title: string;
  category: string;
  fen: string;
  desc: string;
}

const PRESETS: PresetItem[] = [
  {
    title: 'Начальная позиция',
    category: 'Стандарт',
    fen: START_FEN,
    desc: 'Классическая стартовая расстановка фигур для новой партии.',
  },
  {
    title: 'Мат в 1 ход (Оперная партия)',
    category: 'Тактика',
    fen: '1n2kb1r/p4ppp/4q3/4p1B1/4P3/8/PPP2PPP/2KR4 w k - 0 1',
    desc: 'Белые объявляют форсированный мат ладьёй: 1. Rd8#',
  },
  {
    title: 'Позиция Лусены (Ладейный эндшпиль)',
    category: 'Эндшпиль',
    fen: '1K1k4/1P6/8/8/8/8/r7/2R5 w - - 0 1',
    desc: 'Классический метод «постройки моста» для победы в ладейном эндшпиле.',
  },
  {
    title: 'Мат Легаля (Ловушка в дебюте)',
    category: 'Тактика',
    fen: 'r1bqkb1r/pppp1ppp/2n5/4p3/2B1n3/3P1N2/PPP2PPP/RNBQK2R w KQkq - 0 5',
    desc: 'Классическая позиция с жертвой ферзя и матом тремя лёгкими фигурами.',
  },
  {
    title: 'Проходная пешка в эндшпиле',
    category: 'Эндшпиль',
    fen: '8/5k2/8/3P4/8/8/4K3/8 w - - 0 1',
    desc: 'Тестирование расчета правила квадрата и продвижения проходной пешки.',
  },
  {
    title: 'Жертва коня на f7',
    category: 'Миттельшпиль',
    fen: 'r1bqk2r/pppp1Npp/2n5/4p3/2B1n3/8/PPPP1PPP/RNBQK2R b KQkq - 0 6',
    desc: 'Острая атакующая позиция с вилкой на ферзя и ладью.',
  },
];

export const PresetsModal: React.FC<PresetsModalProps> = ({
  isOpen,
  onClose,
  currentFEN,
  onLoadFEN,
}) => {
  const [customFEN, setCustomFEN] = useState<string>(currentFEN);
  const [copied, setCopied] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCopyFEN = () => {
    navigator.clipboard.writeText(currentFEN);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleApply = (fen: string) => {
    try {
      // Basic validation
      const parts = fen.trim().split(/\s+/);
      if (parts.length < 2 || !parts[0].includes('/')) {
        setError('Некорректная нотация FEN!');
        return;
      }
      setError(null);
      onLoadFEN(fen.trim());
      onClose();
    } catch {
      setError('Ошибка при разборе FEN позиции.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs">
      <div className="relative w-full max-w-xl bg-slate-900 border border-slate-700 rounded-2xl p-6 shadow-2xl flex flex-col gap-5 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-emerald-400" />
            <h3 className="text-base font-bold text-white">Позиции и FEN нотация</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Current FEN */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Текущая FEN позиция:
          </label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={currentFEN}
              className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-slate-300 outline-none select-all"
            />
            <button
              onClick={handleCopyFEN}
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg transition-colors cursor-pointer"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              <span>{copied ? 'Скопировано' : 'Копировать'}</span>
            </button>
          </div>
        </div>

        {/* Load Custom FEN */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Загрузить свою FEN позицию:
          </label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
              value={customFEN}
              onChange={(e) => {
                setCustomFEN(e.target.value);
                setError(null);
              }}
              className="flex-1 bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-lg px-3 py-2 text-xs font-mono text-slate-200 outline-none"
            />
            <button
              onClick={() => handleApply(customFEN)}
              className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer shadow-md"
            >
              <Upload className="w-4 h-4" />
              <span>Загрузить</span>
            </button>
          </div>
          {error && <span className="text-xs text-rose-400 font-medium">{error}</span>}
        </div>

        {/* Preset list */}
        <div className="flex flex-col gap-2 pt-2 border-t border-slate-800">
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Готовые позиции и тактические тесты:
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {PRESETS.map((item, idx) => (
              <div
                key={idx}
                onClick={() => handleApply(item.fen)}
                className="group flex flex-col p-3 rounded-xl bg-slate-950/60 border border-slate-800 hover:border-emerald-500/50 hover:bg-slate-800/40 transition-all cursor-pointer"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-white group-hover:text-emerald-300 transition-colors">
                    {item.title}
                  </span>
                  <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                    {item.category}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed mb-2">{item.desc}</p>
                <span className="text-[10px] font-mono text-slate-500 truncate group-hover:text-slate-400">
                  {item.fen}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
