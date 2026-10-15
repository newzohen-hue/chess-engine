import React, { useState, useEffect, useRef } from 'react';
import {
  Activity,
  Bot,
  Check,
  ChevronRight,
  Clock,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  Flame,
  Globe,
  HelpCircle,
  Key,
  Layers,
  Play,
  RotateCcw,
  Shield,
  Square,
  Terminal,
  Trophy,
  Zap,
} from 'lucide-react';
import {
  ActiveBotGame,
  BotLogEntry,
  LichessBotClient,
  LichessBotMetrics,
} from '../engine/lichessBot';
import { NNUE_MODEL_INFO } from '../engine/nnueModelInfo';

interface LichessBotViewProps {
  botClient: LichessBotClient;
  onReturnToBoard: () => void;
}

const STORAGE_KEY_TOKEN = 'stockfish_nnue_lichess_token';

export const LichessBotView: React.FC<LichessBotViewProps> = ({
  botClient,
  onReturnToBoard,
}) => {
  const [token, setToken] = useState<string>(() => {
    return localStorage.getItem(STORAGE_KEY_TOKEN) || '';
  });
  const [showToken, setShowToken] = useState<boolean>(false);
  const [saveInStorage, setSaveInStorage] = useState<boolean>(true);
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [verificationResult, setVerificationResult] = useState<{
    ok: boolean;
    username?: string;
    title?: string;
    isBot?: boolean;
    ratings?: Record<string, number>;
    error?: string;
  } | null>(null);

  const [metrics, setMetrics] = useState<LichessBotMetrics>(() => botClient.getMetrics());
  const [logs, setLogs] = useState<BotLogEntry[]>([]);
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const [selectedTag, setSelectedTag] = useState<string>('all');
  const [copiedLogs, setCopiedLogs] = useState<boolean>(false);

  // Settings
  const [autoAcceptRated, setAutoAcceptRated] = useState<boolean>(true);
  const [autoAcceptCasual, setAutoAcceptCasual] = useState<boolean>(true);
  const [allowedSpeeds, setAllowedSpeeds] = useState<{
    bullet: boolean;
    blitz: boolean;
    rapid: boolean;
    classical: boolean;
  }>({
    bullet: true,
    blitz: true,
    rapid: true,
    classical: true,
  });
  const [sendGreeting, setSendGreeting] = useState<boolean>(true);

  const logContainerRef = useRef<HTMLDivElement>(null);

  // Subscribe to bot metrics and logs
  useEffect(() => {
    const unsubscribe = botClient.subscribe((newMetrics, newLogs) => {
      setMetrics({ ...newMetrics });
      setLogs([...newLogs]);
    });
    return () => unsubscribe();
  }, [botClient]);

  // Auto-scroll log console
  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  // Handle Token verification
  const handleVerify = async (tokenToVerify = token) => {
    if (!tokenToVerify.trim()) return;
    setIsVerifying(true);
    setVerificationResult(null);
    try {
      const res = await botClient.verifyToken(tokenToVerify);
      setVerificationResult(res);
      if (res.ok && saveInStorage) {
        localStorage.setItem(STORAGE_KEY_TOKEN, tokenToVerify.trim());
      }
    } finally {
      setIsVerifying(false);
    }
  };

  // Paste from clipboard
  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setToken(text.trim());
        handleVerify(text.trim());
      }
    } catch {
      // ignore clipboard permission error
    }
  };

  // Toggle speed filter
  const toggleSpeed = (speed: 'bullet' | 'blitz' | 'rapid' | 'classical') => {
    const updated = { ...allowedSpeeds, [speed]: !allowedSpeeds[speed] };
    setAllowedSpeeds(updated);
    const activeSpeeds = (Object.keys(updated) as ('bullet' | 'blitz' | 'rapid' | 'classical')[]).filter(
      (k) => updated[k]
    );
    botClient.setOptions({ allowedSpeeds: activeSpeeds });
  };

  // Start or Stop Bot
  const handleToggleBot = async () => {
    if (metrics.isRunning) {
      botClient.stop();
    } else {
      if (!token.trim()) {
        botClient.log('error', 'Введите токен бота Lichess перед запуском!');
        return;
      }
      if (saveInStorage) {
        localStorage.setItem(STORAGE_KEY_TOKEN, token.trim());
      }
      const activeSpeeds = (Object.keys(allowedSpeeds) as ('bullet' | 'blitz' | 'rapid' | 'classical')[]).filter(
        (k) => allowedSpeeds[k]
      );
      await botClient.start(token, {
        autoAcceptRated,
        autoAcceptCasual,
        allowedSpeeds: activeSpeeds,
        sendGreeting,
        maxConcurrentGames: 1,
      });
    }
  };

  // Upgrade account to BOT status
  const handleUpgradeToBot = async () => {
    if (!token.trim()) return;
    const res = await botClient.upgradeAccountToBot(token);
    if (res.ok) {
      botClient.log('bot', '✓ Аккаунт успешно переведён в статус BOT на Lichess!');
      handleVerify();
    } else {
      botClient.log('error', `Не удалось обновить статус: ${res.error}`);
    }
  };

  // Copy logs
  const handleCopyLogs = () => {
    const text = logs.map((l) => `[${l.time}] [${l.tag.toUpperCase()}] ${l.message}`).join('\n');
    navigator.clipboard.writeText(text);
    setCopiedLogs(true);
    setTimeout(() => setCopiedLogs(false), 2000);
  };

  // Filtered logs
  const filteredLogs = logs.filter((l) => (selectedTag === 'all' ? true : l.tag === selectedTag));

  return (
    <div className="w-full max-w-7xl mx-auto flex flex-col gap-6 py-4 px-2 sm:px-4">
      {/* Top Banner & Mode Switch */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-slate-900 border border-emerald-500/30 rounded-2xl p-5 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="flex items-center gap-4 z-10">
          <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 shadow-inner">
            <Bot className="w-8 h-8 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                Lichess Bot Engine Runner
              </h2>
              <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                100% Ресурсный режим
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              Шахматная доска отключена для максимальной производительности NPS и нейросети Stockfish NNUE.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 z-10 w-full sm:w-auto justify-end">
          <button
            onClick={onReturnToBoard}
            className="px-4 py-2 text-xs sm:text-sm font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl transition flex items-center gap-1.5"
          >
            ← Вернуться к доске
          </button>

          <button
            onClick={handleToggleBot}
            className={`px-6 py-2.5 text-sm font-bold rounded-xl flex items-center gap-2 shadow-lg transition active:scale-95 ${
              metrics.isRunning
                ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-900/30'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/30'
            }`}
          >
            {metrics.isRunning ? (
              <>
                <Square className="w-4 h-4 fill-current" /> Остановить бота
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-current" /> Запустить бота
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main Grid: Technical Metrics + Token & Settings */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Technical Metrics (7 Cols) */}
        <div className="lg:col-span-7 flex flex-col gap-6">
          {/* Real-Time Engine Speed & Search Performance */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col gap-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-amber-400" />
                <h3 className="text-base font-bold text-white">Технические метрики движка (Live NPS)</h3>
              </div>
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                HalfKAv2_hm^ • 1.3B
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {/* NPS */}
              <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 flex flex-col">
                <span className="text-xs text-slate-400 font-medium flex items-center gap-1">
                  <Activity className="w-3.5 h-3.5 text-emerald-400" /> Текущий NPS
                </span>
                <span className="text-xl font-mono font-black text-emerald-400 mt-1">
                  {metrics.currentNps.toLocaleString()}
                </span>
                <span className="text-[10px] text-slate-500 mt-0.5">узлов / секунду</span>
              </div>

              {/* Peak NPS */}
              <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 flex flex-col">
                <span className="text-xs text-slate-400 font-medium flex items-center gap-1">
                  <Flame className="w-3.5 h-3.5 text-rose-400" /> Пиковый NPS
                </span>
                <span className="text-xl font-mono font-black text-rose-400 mt-1">
                  {metrics.peakNps.toLocaleString()}
                </span>
                <span className="text-[10px] text-slate-500 mt-0.5">максимум сессии</span>
              </div>

              {/* Search Depth */}
              <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 flex flex-col">
                <span className="text-xs text-slate-400 font-medium flex items-center gap-1">
                  <Layers className="w-3.5 h-3.5 text-blue-400" /> Глубина поиска
                </span>
                <span className="text-xl font-mono font-black text-blue-400 mt-1">
                  {metrics.currentDepth > 0 ? `${metrics.currentDepth}` : '—'}
                </span>
                <span className="text-[10px] text-slate-500 mt-0.5">
                  {metrics.currentDepth > 0 ? `sel: ${metrics.currentDepth + 2}` : 'ожидание'}
                </span>
              </div>

              {/* Evaluation */}
              <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 flex flex-col">
                <span className="text-xs text-slate-400 font-medium flex items-center gap-1">
                  <Activity className="w-3.5 h-3.5 text-purple-400" /> Оценка NNUE
                </span>
                <span className="text-xl font-mono font-black text-purple-400 mt-1">
                  {metrics.isMate
                    ? `M${metrics.mateIn || 0}`
                    : metrics.currentEval !== null
                    ? `${metrics.currentEval > 0 ? '+' : ''}${(metrics.currentEval / 100).toFixed(2)}`
                    : '0.00'}
                </span>
                <span className="text-[10px] text-slate-500 mt-0.5">пешечный эквивалент</span>
              </div>
            </div>

            {/* Total nodes & latency bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 text-xs text-slate-400">
              <div className="flex items-center gap-4">
                <span>
                  Всего просчитано узлов:{' '}
                  <strong className="text-slate-200 font-mono">
                    {metrics.totalNodes.toLocaleString()}
                  </strong>
                </span>
                <span>
                  Пинг API:{' '}
                  <strong className="text-emerald-400 font-mono">
                    {metrics.latencyMs > 0 ? `${metrics.latencyMs} ms` : '—'}
                  </strong>
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`inline-block w-2.5 h-2.5 rounded-full ${
                    metrics.isRunning ? 'bg-emerald-500 animate-ping' : 'bg-slate-600'
                  }`}
                />
                <span className="font-semibold text-slate-300">
                  {metrics.isRunning ? 'Бот активен и слушает Lichess' : 'Бот выключен'}
                </span>
              </div>
            </div>
          </div>

          {/* Active Live Game Card (or Standby Notice) */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-emerald-400" />
                <h3 className="text-base font-bold text-white">Текущая партия на Lichess</h3>
              </div>
              {metrics.activeGame && (
                <a
                  href={`https://lichess.org/${metrics.activeGame.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 transition"
                >
                  Открыть на Lichess <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>

            {metrics.activeGame ? (
              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-950/60 border border-slate-800 rounded-xl p-4">
                  {/* Opponent Info */}
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-slate-500">Соперник:</span>
                    <div className="flex items-center gap-2">
                      <span className="text-base font-black text-white">
                        {metrics.activeGame.opponentTitle && (
                          <span className="text-xs bg-amber-500/20 text-amber-300 px-1 py-0.5 rounded mr-1">
                            {metrics.activeGame.opponentTitle}
                          </span>
                        )}
                        @{metrics.activeGame.opponent}
                      </span>
                      <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                        {metrics.activeGame.opponentRating}
                      </span>
                    </div>
                    <span className="text-xs text-slate-400 mt-1">
                      Формат: <strong className="text-slate-200 capitalize">{metrics.activeGame.speed}</strong> (
                      {metrics.activeGame.rated ? 'Рейтинговая' : 'Товарищеская'})
                    </span>
                  </div>

                  {/* Bot Info */}
                  <div className="flex flex-col gap-1 sm:border-l sm:border-slate-800 sm:pl-4">
                    <span className="text-xs text-slate-500">Бот играет:</span>
                    <div className="flex items-center gap-2">
                      <span className="text-base font-black text-emerald-400">
                        {metrics.activeGame.myColor === 'w' ? '⚪ Белыми (White)' : '⚫ Чёрными (Black)'}
                      </span>
                    </div>
                    <span className="text-xs text-slate-400 mt-1">
                      Очередь хода:{' '}
                      <strong className="text-amber-400">
                        {metrics.activeGame.turn === metrics.activeGame.myColor ? 'Ход бота' : 'Ход соперника'}
                      </strong>
                    </span>
                  </div>
                </div>

                {/* Game Clock & Last Move */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                  <div className="bg-slate-950/40 p-2.5 rounded-lg border border-slate-800">
                    <span className="text-slate-500">Время бота:</span>
                    <div className="text-sm font-mono font-bold text-slate-200 mt-0.5">
                      {Math.floor(metrics.activeGame.myTimeMs / 60000)}:
                      {Math.floor((metrics.activeGame.myTimeMs % 60000) / 1000)
                        .toString()
                        .padStart(2, '0')}
                    </div>
                  </div>
                  <div className="bg-slate-950/40 p-2.5 rounded-lg border border-slate-800">
                    <span className="text-slate-500">Время соперника:</span>
                    <div className="text-sm font-mono font-bold text-slate-200 mt-0.5">
                      {Math.floor(metrics.activeGame.oppTimeMs / 60000)}:
                      {Math.floor((metrics.activeGame.oppTimeMs % 60000) / 1000)
                        .toString()
                        .padStart(2, '0')}
                    </div>
                  </div>
                  <div className="bg-slate-950/40 p-2.5 rounded-lg border border-slate-800 col-span-2 sm:col-span-1">
                    <span className="text-slate-500">Последний ход:</span>
                    <div className="text-sm font-mono font-bold text-emerald-400 mt-0.5">
                      {metrics.activeGame.lastMove || '—'}{' '}
                      {metrics.activeGame.lastMoveTimeMs ? `(${metrics.activeGame.lastMoveTimeMs}ms)` : ''}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center bg-slate-950/40 rounded-xl border border-dashed border-slate-800">
                <Globe className="w-10 h-10 text-slate-600 mb-2 animate-bounce" />
                <p className="text-sm font-semibold text-slate-300">
                  {metrics.isRunning
                    ? 'Ожидание вызова или старта партии на Lichess...'
                    : 'Бот не запущен. Укажите токен и нажмите «Запустить бота».'}
                </p>
                <p className="text-xs text-slate-500 mt-1 max-w-md">
                  Когда любой игрок на Lichess бросит вызов боту или начнётся турнирная партия, она будет принята
                  автоматически.
                </p>
              </div>
            )}
          </div>

          {/* Bot Match Record & Performance */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-800 mb-4">
              <Trophy className="w-5 h-5 text-amber-400" />
              <h3 className="text-base font-bold text-white">Статистика сессии Lichess Bot</h3>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center">
              <div className="bg-slate-950/50 p-3 rounded-xl border border-slate-800">
                <span className="text-xs text-slate-400">Партий</span>
                <p className="text-xl font-black text-white mt-1">{metrics.gamesPlayed}</p>
              </div>
              <div className="bg-slate-950/50 p-3 rounded-xl border border-slate-800">
                <span className="text-xs text-emerald-400">Победы</span>
                <p className="text-xl font-black text-emerald-400 mt-1">{metrics.wins}</p>
              </div>
              <div className="bg-slate-950/50 p-3 rounded-xl border border-slate-800">
                <span className="text-xs text-rose-400">Поражения</span>
                <p className="text-xl font-black text-rose-400 mt-1">{metrics.losses}</p>
              </div>
              <div className="bg-slate-950/50 p-3 rounded-xl border border-slate-800">
                <span className="text-xs text-slate-400">Ничьи</span>
                <p className="text-xl font-black text-slate-300 mt-1">{metrics.draws}</p>
              </div>
              <div className="bg-slate-950/50 p-3 rounded-xl border border-slate-800 col-span-2 sm:col-span-1">
                <span className="text-xs text-amber-400">Винрейт</span>
                <p className="text-xl font-black text-amber-400 mt-1">{metrics.winrate}%</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Bot Token Management & Settings & Logs (5 Cols) */}
        <div className="lg:col-span-5 flex flex-col gap-6">
          {/* Bot Token Configuration Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col gap-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Key className="w-5 h-5 text-emerald-400" />
                <h3 className="text-base font-bold text-white">Токен бота Lichess (OAuth API)</h3>
              </div>
              <a
                href="https://lichess.org/account/oauth/token/create?scopes[]=bot:play&scopes[]=challenge:read&scopes[]=challenge:write&description=Stockfish+NNUE+Bot"
                target="_blank"
                rel="noreferrer"
                className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1 transition"
                title="Создать персональный токен бота с правами bot:play"
              >
                Создать токен <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            {/* Input with Masking */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-slate-400">
                Personal API Access Token (с правами <code className="text-emerald-300">bot:play</code>):
              </label>
              <div className="relative flex items-center">
                <input
                  type={showToken ? 'text' : 'password'}
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="lip_xxxxxxxxxxxxxxxxxxxxxxxx"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl py-2.5 pl-3.5 pr-20 text-xs sm:text-sm font-mono text-slate-200 placeholder-slate-600 focus:outline-none focus:border-emerald-500 transition"
                />
                <div className="absolute right-2 flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setShowToken(!showToken)}
                    className="p-1.5 text-slate-400 hover:text-slate-200 transition rounded-lg hover:bg-slate-800"
                    title={showToken ? 'Скрыть токен' : 'Показать токен'}
                  >
                    {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                  <button
                    type="button"
                    onClick={handlePaste}
                    className="p-1.5 text-slate-400 hover:text-emerald-400 transition rounded-lg hover:bg-slate-800 text-xs"
                    title="Вставить из буфера"
                  >
                    Вставить
                  </button>
                </div>
              </div>
            </div>

            {/* Verification and Save */}
            <div className="flex items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={saveInStorage}
                  onChange={(e) => setSaveInStorage(e.target.checked)}
                  className="rounded border-slate-700 text-emerald-500 focus:ring-0 bg-slate-950"
                />
                Запомнить токен в браузере
              </label>

              <button
                onClick={() => handleVerify()}
                disabled={isVerifying || !token.trim()}
                className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-slate-700 disabled:opacity-50 transition flex items-center gap-1.5"
              >
                {isVerifying ? (
                  <>Проверка...</>
                ) : (
                  <>
                    <Shield className="w-3.5 h-3.5" /> Проверить
                  </>
                )}
              </button>
            </div>

            {/* Verification status output */}
            {verificationResult && (
              <div
                className={`p-3 rounded-xl border text-xs flex flex-col gap-1.5 ${
                  verificationResult.ok
                    ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300'
                    : 'bg-rose-950/40 border-rose-500/30 text-rose-300'
                }`}
              >
                {verificationResult.ok ? (
                  <>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 font-bold text-white">
                        <Check className="w-4 h-4 text-emerald-400" />
                        <span>@{verificationResult.username}</span>
                        {verificationResult.isBot && (
                          <span className="px-1.5 py-0.2 bg-emerald-500/30 text-emerald-200 rounded text-[10px]">
                            BOT
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-slate-400">Аккаунт подключен</span>
                    </div>

                    {!verificationResult.isBot && (
                      <div className="mt-1 pt-1.5 border-t border-emerald-500/20 text-amber-300 flex flex-col gap-1">
                        <span>
                          ⚠️ Этот аккаунт ещё не переведён в статус <strong>BOT</strong> на Lichess.
                        </span>
                        <button
                          onClick={handleUpgradeToBot}
                          className="self-start px-2.5 py-1 mt-1 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-200 rounded text-[11px] font-bold transition"
                        >
                          Перевести в статус BOT в 1 клик
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <div>{verificationResult.error}</div>
                )}
              </div>
            )}
          </div>

          {/* Bot Filters & Behavior Settings */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col gap-3.5">
            <h3 className="text-sm font-bold text-white pb-2 border-b border-slate-800">
              Фильтры вызовов (lichess-bot settings)
            </h3>

            {/* Speeds */}
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-slate-400 font-semibold">Принимать контроли времени:</span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {(['bullet', 'blitz', 'rapid', 'classical'] as const).map((speed) => (
                  <button
                    key={speed}
                    onClick={() => toggleSpeed(speed)}
                    className={`py-1.5 px-2 text-xs font-semibold rounded-lg border capitalize transition ${
                      allowedSpeeds[speed]
                        ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                        : 'bg-slate-950 border-slate-800 text-slate-500'
                    }`}
                  >
                    {speed}
                  </button>
                ))}
              </div>
            </div>

            {/* Rated / Casual */}
            <div className="flex items-center justify-between text-xs text-slate-300 pt-1">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={autoAcceptRated}
                  onChange={(e) => {
                    setAutoAcceptRated(e.target.checked);
                    botClient.setOptions({ autoAcceptRated: e.target.checked });
                  }}
                  className="rounded border-slate-700 text-emerald-500 bg-slate-950"
                />
                Рейтинговые партии
              </label>

              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={autoAcceptCasual}
                  onChange={(e) => {
                    setAutoAcceptCasual(e.target.checked);
                    botClient.setOptions({ autoAcceptCasual: e.target.checked });
                  }}
                  className="rounded border-slate-700 text-emerald-500 bg-slate-950"
                />
                Товарищеские партии
              </label>
            </div>

            {/* Greeting */}
            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none pt-1">
              <input
                type="checkbox"
                checked={sendGreeting}
                onChange={(e) => {
                  setSendGreeting(e.target.checked);
                  botClient.setOptions({ sendGreeting: e.target.checked });
                }}
                className="rounded border-slate-700 text-emerald-500 bg-slate-950"
              />
              Приветствие в чате партии (Stockfish NNUE greeting)
            </label>
          </div>

          {/* Lichess Bot Live Output Terminal / Console */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col gap-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-bold text-white">Вывод lichess-bot (Terminal Logs)</h3>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={handleCopyLogs}
                  className="p-1.5 text-slate-400 hover:text-slate-200 transition rounded hover:bg-slate-800 text-xs"
                  title="Скопировать логи"
                >
                  {copiedLogs ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
                <button
                  onClick={() => botClient.clearLogs()}
                  className="p-1.5 text-slate-400 hover:text-rose-400 transition rounded hover:bg-slate-800 text-xs"
                  title="Очистить консоль"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Filter tags */}
            <div className="flex items-center gap-1.5 text-[11px] overflow-x-auto pb-1">
              {['all', 'bot', 'game', 'challenge', 'uci', 'error'].map((tag) => (
                <button
                  key={tag}
                  onClick={() => setSelectedTag(tag)}
                  className={`px-2 py-0.5 rounded font-mono uppercase transition ${
                    selectedTag === tag
                      ? 'bg-slate-700 text-white font-bold'
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>

            {/* Console Log Area */}
            <div
              ref={logContainerRef}
              className="w-full h-64 bg-slate-950 border border-slate-800/80 rounded-xl p-3 font-mono text-xs overflow-y-auto flex flex-col gap-1 text-slate-300 shadow-inner scrollbar-thin"
            >
              {filteredLogs.length === 0 ? (
                <span className="text-slate-600 italic">Логи lichess-bot пусты...</span>
              ) : (
                filteredLogs.map((log) => {
                  let tagColor = 'text-slate-400';
                  if (log.tag === 'bot') tagColor = 'text-emerald-400 font-semibold';
                  else if (log.tag === 'game') tagColor = 'text-purple-400 font-semibold';
                  else if (log.tag === 'challenge') tagColor = 'text-amber-400 font-semibold';
                  else if (log.tag === 'uci') tagColor = 'text-cyan-400';
                  else if (log.tag === 'error') tagColor = 'text-rose-400 font-bold';

                  return (
                    <div key={log.id} className="leading-relaxed break-words">
                      <span className="text-slate-600 mr-1.5">[{log.time}]</span>
                      <span className={`${tagColor} mr-1.5 uppercase`}>[{log.tag}]</span>
                      <span className="text-slate-300">{log.message}</span>
                    </div>
                  );
                })
              )}
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
              <span>Записей: {filteredLogs.length}</span>
              <label className="flex items-center gap-1 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={autoScroll}
                  onChange={(e) => setAutoScroll(e.target.checked)}
                  className="rounded border-slate-700 text-emerald-500 bg-slate-950 text-[10px]"
                />
                Автопрокрутка
              </label>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
