import React, { useState } from 'react';
import { NNUE_MODEL_INFO } from '../engine/nnueModelInfo';
import {
  X,
  Copy,
  Check,
  Brain,
  Layers,
  Database,
  Cpu,
  Terminal,
  Activity,
  Award,
} from 'lucide-react';

interface NnueModelModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NnueModelModal: React.FC<NnueModelModalProps> = ({ isOpen, onClose }) => {
  const [copiedTrain, setCopiedTrain] = useState(false);
  const [copiedSerialize, setCopiedSerialize] = useState(false);

  if (!isOpen) return null;

  const handleCopy = (text: string, isTrain: boolean) => {
    navigator.clipboard.writeText(text);
    if (isTrain) {
      setCopiedTrain(true);
      setTimeout(() => setCopiedTrain(false), 2000);
    } else {
      setCopiedSerialize(true);
      setTimeout(() => setCopiedSerialize(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-950/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl">
              <Brain className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                Спецификация и обучение нейросети NNUE
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  {NNUE_MODEL_INFO.features}
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Точные параметры Kaggle обучения, сериализации и топологии слоёв
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 overflow-y-auto text-xs text-slate-300">
          {/* Key Training Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="bg-slate-950/70 border border-slate-800 p-2.5 rounded-xl">
              <span className="text-slate-500 text-[10px] uppercase font-bold block mb-0.5">Объём обучения</span>
              <span className="text-sm font-mono font-bold text-emerald-400 block">1.3 млрд</span>
              <span className="text-[10px] text-slate-400">1,300,000,000 позиций</span>
            </div>

            <div className="bg-slate-950/70 border border-slate-800 p-2.5 rounded-xl">
              <span className="text-slate-500 text-[10px] uppercase font-bold block mb-0.5">Эпохи обучения</span>
              <span className="text-sm font-mono font-bold text-white block">13 эпох</span>
              <span className="text-[10px] text-slate-400">по 100 млн поз/эпоха</span>
            </div>

            <div className="bg-slate-950/70 border border-slate-800 p-2.5 rounded-xl">
              <span className="text-slate-500 text-[10px] uppercase font-bold block mb-0.5">Размер батча</span>
              <span className="text-sm font-mono font-bold text-sky-400 block">16,384</span>
              <span className="text-[10px] text-slate-400">мини-батч SGD</span>
            </div>

            <div className="bg-slate-950/70 border border-slate-800 p-2.5 rounded-xl">
              <span className="text-slate-500 text-[10px] uppercase font-bold block mb-0.5">Топология сети</span>
              <span className="text-sm font-mono font-bold text-amber-400 block">1024-15-32</span>
              <span className="text-[10px] text-slate-400">L1=1024, L2=15, L3=32</span>
            </div>
          </div>

          {/* Architecture Details Box */}
          <div className="bg-slate-950/50 border border-slate-800 rounded-xl p-3 space-y-2">
            <h4 className="font-semibold text-white flex items-center gap-1.5 text-xs">
              <Layers className="w-4 h-4 text-emerald-400" />
              <span>Архитектура нейросети Stockfish NNUE</span>
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] font-mono">
              <div className="p-2 bg-slate-900/80 rounded border border-slate-800/80">
                <span className="text-slate-400 block text-[10px]">Признаки (Features):</span>
                <span className="text-white font-bold">{NNUE_MODEL_INFO.features}</span> (22,528 входов на цвет)
              </div>
              <div className="p-2 bg-slate-900/80 rounded border border-slate-800/80">
                <span className="text-slate-400 block text-[10px]">Трансформер признаков (L1):</span>
                <span className="text-white font-bold">{NNUE_MODEL_INFO.l1}</span> измерений (аккумулятор 2×1024)
              </div>
              <div className="p-2 bg-slate-900/80 rounded border border-slate-800/80">
                <span className="text-slate-400 block text-[10px]">Первый скрытый слой (L2):</span>
                <span className="text-white font-bold">{NNUE_MODEL_INFO.l2}</span> нейронов (Clipped ReLU)
              </div>
              <div className="p-2 bg-slate-900/80 rounded border border-slate-800/80">
                <span className="text-slate-400 block text-[10px]">Второй скрытый слой (L3):</span>
                <span className="text-white font-bold">{NNUE_MODEL_INFO.l3}</span> нейрона (8 бакетов короля)
              </div>
            </div>
          </div>

          {/* Dataset Details */}
          <div className="bg-slate-950/50 border border-slate-800 rounded-xl p-3 space-y-1.5">
            <h4 className="font-semibold text-white flex items-center gap-1.5 text-xs">
              <Database className="w-4 h-4 text-sky-400" />
              <span>Обучающий датасет</span>
            </h4>
            <p className="text-[11px] text-slate-300 font-mono bg-slate-900/90 p-2 rounded border border-slate-800 break-all select-all">
              {NNUE_MODEL_INFO.dataset}
            </p>
            <p className="text-[11px] text-slate-400">
              Высококачественные гроссмейстерские позиции DFRC/T80 с проверенным лучшим ходом (bestmove).
            </p>
          </div>

          {/* Python Training Command */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-white flex items-center gap-1.5 text-xs">
                <Terminal className="w-4 h-4 text-emerald-400" />
                <span>Команда обучения в Kaggle (nnue-pytorch):</span>
              </span>
              <button
                onClick={() => handleCopy(NNUE_MODEL_INFO.trainCommand, true)}
                className="flex items-center gap-1 text-[11px] px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
              >
                {copiedTrain ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedTrain ? 'Скопировано!' : 'Копировать'}</span>
              </button>
            </div>
            <pre className="p-3 bg-slate-950 border border-slate-800 rounded-xl font-mono text-[11px] text-emerald-300 overflow-x-auto select-all leading-relaxed">
              {NNUE_MODEL_INFO.trainCommand}
            </pre>
          </div>

          {/* Python Serialization Command */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-white flex items-center gap-1.5 text-xs">
                <Terminal className="w-4 h-4 text-sky-400" />
                <span>Команда квантования и сериализации (serialize.py):</span>
              </span>
              <button
                onClick={() => handleCopy(NNUE_MODEL_INFO.serializeCommand, false)}
                className="flex items-center gap-1 text-[11px] px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
              >
                {copiedSerialize ? <Check className="w-3.5 h-3.5 text-sky-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedSerialize ? 'Скопировано!' : 'Копировать'}</span>
              </button>
            </div>
            <pre className="p-3 bg-slate-950 border border-slate-800 rounded-xl font-mono text-[11px] text-sky-300 overflow-x-auto select-all leading-relaxed">
              {NNUE_MODEL_INFO.serializeCommand}
            </pre>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-800 bg-slate-950/50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
};
