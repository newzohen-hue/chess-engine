/**
 * Lichess Bot Client Framework for Stockfish NNUE Engine.
 * 
 * Implements official Lichess Bot NDJSON Streaming API:
 * - /api/stream/event (Incoming challenges and game lifecycle)
 * - /api/bot/game/stream/{gameId} (Live board moves and game state)
 * - /api/bot/game/{gameId}/move/{move} (Making moves)
 * - /api/challenge/{challengeId}/accept / decline
 * - Direct integration with UciEngine for 100% standard UCI protocol execution.
 */

import { Move, SearchStats } from '../types/chess';
import { UciEngine } from './uci';
import { WasmChessSearchEngine } from './wasmEngine';
import { NNUE_MODEL_INFO } from './nnueModelInfo';

export interface LichessBotOptions {
  autoAcceptRated: boolean;
  autoAcceptCasual: boolean;
  allowedSpeeds: ('bullet' | 'blitz' | 'rapid' | 'classical')[];
  sendGreeting: boolean;
  maxConcurrentGames: number;
}

export interface BotLogEntry {
  id: string;
  time: string;
  tag: 'bot' | 'uci' | 'game' | 'challenge' | 'net' | 'error';
  message: string;
}

export interface ActiveBotGame {
  id: string;
  speed: string;
  rated: boolean;
  opponent: string;
  opponentRating: number;
  opponentTitle?: string;
  myColor: 'w' | 'b';
  movesCount: number;
  myTimeMs: number;
  oppTimeMs: number;
  lastMove?: string;
  lastMoveTimeMs?: number;
  evalScore?: number;
  turn: 'w' | 'b';
}

export interface LichessBotMetrics {
  isRunning: boolean;
  botUsername: string | null;
  botTitle: string | null;
  activeGame: ActiveBotGame | null;
  currentNps: number;
  peakNps: number;
  totalNodes: number;
  currentDepth: number;
  selDepth: number;
  currentEval: number | null;
  isMate: boolean;
  mateIn?: number;
  gamesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
  winrate: number;
  latencyMs: number;
}

export class LichessBotClient {
  private token: string = '';
  private isRunning: boolean = false;
  private abortController: AbortController | null = null;
  private uciEngine: UciEngine;
  private wasmEngine: WasmChessSearchEngine;
  private botUsername: string | null = null;
  private botTitle: string | null = null;
  private activeGame: ActiveBotGame | null = null;
  private options: LichessBotOptions = {
    autoAcceptRated: true,
    autoAcceptCasual: true,
    allowedSpeeds: ['bullet', 'blitz', 'rapid', 'classical'],
    sendGreeting: true,
    maxConcurrentGames: 1,
  };

  private currentNps = 0;
  private peakNps = 0;
  private totalNodes = 0;
  private currentDepth = 0;
  private selDepth = 0;
  private currentEval: number | null = null;
  private isMate = false;
  private mateIn?: number;
  private gamesPlayed = 0;
  private wins = 0;
  private losses = 0;
  private draws = 0;
  private latencyMs = 0;

  private logs: BotLogEntry[] = [];
  private listeners: Set<(metrics: LichessBotMetrics, logs: BotLogEntry[]) => void> = new Set();

  constructor() {
    this.wasmEngine = new WasmChessSearchEngine();
    this.uciEngine = new UciEngine(this.wasmEngine);

    // Subscribe to UCI engine outputs for real-time console logs
    this.uciEngine.subscribe({
      onOutput: (line) => {
        if (line.startsWith('info depth')) {
          // Parse UCI info metrics
          const parts = line.split(/\s+/);
          const npsIdx = parts.indexOf('nps');
          const depthIdx = parts.indexOf('depth');
          const nodesIdx = parts.indexOf('nodes');
          const scoreIdx = parts.indexOf('score');

          if (npsIdx !== -1 && parts[npsIdx + 1]) {
            const nps = parseInt(parts[npsIdx + 1], 10) || 0;
            this.currentNps = nps;
            if (nps > this.peakNps) this.peakNps = nps;
          }
          if (depthIdx !== -1 && parts[depthIdx + 1]) {
            this.currentDepth = parseInt(parts[depthIdx + 1], 10) || 0;
          }
          if (nodesIdx !== -1 && parts[nodesIdx + 1]) {
            const nodes = parseInt(parts[nodesIdx + 1], 10) || 0;
            this.totalNodes += nodes;
          }
          if (scoreIdx !== -1) {
            const type = parts[scoreIdx + 1];
            const val = parseInt(parts[scoreIdx + 2], 10) || 0;
            if (type === 'cp') {
              this.currentEval = val;
              this.isMate = false;
              this.mateIn = undefined;
            } else if (type === 'mate') {
              this.isMate = true;
              this.mateIn = val;
            }
          }
          this.notify();
        } else if (line.startsWith('bestmove')) {
          this.log('uci', `[UCI Engine] => ${line}`);
        }
      },
    });
  }

  public subscribe(cb: (metrics: LichessBotMetrics, logs: BotLogEntry[]) => void): () => void {
    this.listeners.add(cb);
    cb(this.getMetrics(), this.logs);
    return () => this.listeners.delete(cb);
  }

  private notify() {
    const metrics = this.getMetrics();
    for (const cb of this.listeners) {
      try {
        cb(metrics, this.logs);
      } catch {
        // ignore
      }
    }
  }

  public getMetrics(): LichessBotMetrics {
    const totalFinished = this.wins + this.losses + this.draws;
    const winrate = totalFinished > 0 ? Math.round((this.wins / totalFinished) * 100) : 0;
    return {
      isRunning: this.isRunning,
      botUsername: this.botUsername,
      botTitle: this.botTitle,
      activeGame: this.activeGame,
      currentNps: this.currentNps,
      peakNps: this.peakNps,
      totalNodes: this.totalNodes,
      currentDepth: this.currentDepth,
      selDepth: this.selDepth,
      currentEval: this.currentEval,
      isMate: this.isMate,
      mateIn: this.mateIn,
      gamesPlayed: this.gamesPlayed,
      wins: this.wins,
      losses: this.losses,
      draws: this.draws,
      winrate,
      latencyMs: this.latencyMs,
    };
  }

  public log(tag: BotLogEntry['tag'], message: string) {
    const now = new Date();
    const time = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
    const entry: BotLogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      time,
      tag,
      message,
    };
    this.logs.push(entry);
    if (this.logs.length > 500) {
      this.logs.shift();
    }
    this.notify();
  }

  public clearLogs() {
    this.logs = [];
    this.notify();
  }

  public setOptions(opts: Partial<LichessBotOptions>) {
    this.options = { ...this.options, ...opts };
    this.log('bot', `Bot configuration updated: ${JSON.stringify(this.options)}`);
  }

  /**
   * Determine the API base URL (uses Vite proxy /lichess-api or direct lichess.org)
   */
  private getApiUrl(path: string): string {
    const cleanPath = path.startsWith('/') ? path : '/' + path;
    // In browser with Vite proxy
    if (typeof window !== 'undefined') {
      return `/lichess-api${cleanPath}`;
    }
    return `https://lichess.org${cleanPath}`;
  }

  /**
   * Verify an API Token against Lichess
   */
  public async verifyToken(token: string): Promise<{
    ok: boolean;
    username?: string;
    title?: string;
    isBot?: boolean;
    error?: string;
    ratings?: Record<string, number>;
  }> {
    const cleanToken = token.trim();
    if (!cleanToken) {
      return { ok: false, error: 'Токен не может быть пустым' };
    }

    try {
      const t0 = performance.now();
      const resp = await fetch(this.getApiUrl('/api/account'), {
        headers: {
          Authorization: `Bearer ${cleanToken}`,
        },
      });
      this.latencyMs = Math.round(performance.now() - t0);

      if (!resp.ok) {
        if (resp.status === 401) {
          return { ok: false, error: 'Неверный токен Lichess (Ошибка 401 Unauthorized)' };
        }
        return { ok: false, error: `Ошибка API Lichess: HTTP ${resp.status} ${resp.statusText}` };
      }

      const data = await resp.json();
      const isBot = data.title === 'BOT' || (Array.isArray(data.roles) && data.roles.includes('ROLE_BOT'));
      const ratings: Record<string, number> = {};
      if (data.perfs) {
        if (data.perfs.bullet) ratings.bullet = data.perfs.bullet.rating;
        if (data.perfs.blitz) ratings.blitz = data.perfs.blitz.rating;
        if (data.perfs.rapid) ratings.rapid = data.perfs.rapid.rating;
        if (data.perfs.classical) ratings.classical = data.perfs.classical.rating;
      }

      return {
        ok: true,
        username: data.username,
        title: data.title,
        isBot,
        ratings,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, error: `Ошибка сети при подключении к Lichess: ${msg}` };
    }
  }

  /**
   * Upgrade account to BOT status on Lichess
   */
  public async upgradeAccountToBot(token: string): Promise<{ ok: boolean; error?: string }> {
    try {
      const resp = await fetch(this.getApiUrl('/api/bot/account/upgrade'), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token.trim()}`,
        },
      });
      if (!resp.ok) {
        const text = await resp.text();
        return { ok: false, error: `Ошибка апгрейда: ${text || resp.statusText}` };
      }
      return { ok: true };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, error: msg };
    }
  }

  /**
   * Start Lichess Bot Event Loop
   */
  public async start(token: string, options?: Partial<LichessBotOptions>): Promise<void> {
    if (this.isRunning) {
      this.log('bot', 'Бот уже запущен.');
      return;
    }

    if (options) {
      this.options = { ...this.options, ...options };
    }

    this.token = token.trim();
    if (!this.token) {
      this.log('error', 'Не указан персональный токен бота!');
      return;
    }

    this.log('bot', 'Проверка токена и инициализация Stockfish NNUE UCI...');
    const verification = await this.verifyToken(this.token);
    if (!verification.ok) {
      this.log('error', `Проверка токена не пройдена: ${verification.error}`);
      return;
    }

    this.botUsername = verification.username || 'Bot';
    this.botTitle = verification.title || null;

    if (!verification.isBot) {
      this.log(
        'error',
        `Внимание! Аккаунт @${this.botUsername} не имеет статуса BOT на Lichess. Согласно правилам Lichess, бот может играть только под аккаунтом со статусом BOT.`
      );
    }

    // Initialize UCI engine
    await this.uciEngine.processCommand('uci');
    await this.uciEngine.processCommand('isready');

    this.isRunning = true;
    this.abortController = new AbortController();
    this.notify();

    this.log(
      'bot',
      `✓ Бот @${this.botUsername} успешно авторизован! Архитектура: HalfKAv2_hm^ (1.3 млрд позиций). Ожидание вызовов...`
    );

    this.runEventStreamLoop();
  }

  /**
   * Stop Lichess Bot
   */
  public stop(): void {
    if (!this.isRunning) return;
    this.isRunning = false;
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.activeGame = null;
    this.currentNps = 0;
    this.currentDepth = 0;
    this.currentEval = null;
    this.uciEngine.processCommand('stop');
    this.log('bot', '🛑 Бот остановлен пользователем.');
    this.notify();
  }

  /**
   * Main Event Stream Loop (NDJSON from /api/stream/event)
   */
  private async runEventStreamLoop(): Promise<void> {
    while (this.isRunning) {
      try {
        const signal = this.abortController?.signal;
        const resp = await fetch(this.getApiUrl('/api/stream/event'), {
          headers: {
            Authorization: `Bearer ${this.token}`,
          },
          signal,
        });

        if (!resp.ok) {
          this.log('error', `Ошибка потока событий Lichess: HTTP ${resp.status} ${resp.statusText}`);
          if (resp.status === 401) {
            this.stop();
            return;
          }
          await this.delay(5000);
          continue;
        }

        this.log('net', '✓ Подключен входящий поток событий Lichess (Challenges & Games stream)');

        const reader = resp.body?.getReader();
        if (!reader) {
          throw new Error('ReadableStream not supported by browser');
        }

        const decoder = new TextDecoder();
        let buffer = '';

        while (this.isRunning) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
              const event = JSON.parse(trimmed);
              await this.handleIncomingEvent(event);
            } catch (err) {
              console.warn('Failed to parse NDJSON line', trimmed, err);
            }
          }
        }
      } catch (err: unknown) {
        if (!this.isRunning) break;
        const msg = err instanceof Error ? err.message : String(err);
        this.log('error', `Разрыв соединения со стримом Lichess: ${msg}. Переподключение через 3с...`);
        await this.delay(3000);
      }
    }
  }

  /**
   * Handle an event from /api/stream/event
   */
  private async handleIncomingEvent(event: any): Promise<void> {
    if (!event || !event.type) return;

    if (event.type === 'challenge') {
      await this.handleChallenge(event.challenge);
    } else if (event.type === 'challengeCanceled') {
      this.log('challenge', `Вызов ${event.challenge?.id} был отменён соперником.`);
    } else if (event.type === 'challengeDeclined') {
      this.log('challenge', `Вызов ${event.challenge?.id} отклонён.`);
    } else if (event.type === 'gameStart') {
      this.log('game', `⚡ Началась партия! ID: ${event.game?.id}`);
      this.playGame(event.game.id);
    } else if (event.type === 'gameFinish') {
      this.log('game', `🏁 Партия ${event.game?.id} завершена.`);
      if (this.activeGame && this.activeGame.id === event.game?.id) {
        this.activeGame = null;
        this.notify();
      }
    }
  }

  /**
   * Evaluate and accept/decline challenge
   */
  private async handleChallenge(challenge: any): Promise<void> {
    const id = challenge.id;
    const challenger = challenge.challenger?.name || 'Unknown';
    const rating = challenge.challenger?.rating || '?';
    const speed = challenge.speed;
    const rated = challenge.rated;
    const variant = challenge.variant?.key || 'standard';

    this.log(
      'challenge',
      `Получен вызов от @${challenger} (${rating}): ${speed} (${challenge.timeControl?.show || ''}), ${rated ? 'Рейтинговая' : 'Товарищеская'}, вариант: ${variant}`
    );

    // Filter variant (only standard supported)
    if (variant !== 'standard') {
      this.log('challenge', `Отклоняем вызов ${id}: неподдерживаемый вариант ${variant}`);
      await this.declineChallenge(id, 'unsupportedVariant');
      return;
    }

    // Filter speed
    if (!this.options.allowedSpeeds.includes(speed)) {
      this.log('challenge', `Отклоняем вызов ${id}: скорость ${speed} отключена в настройках.`);
      await this.declineChallenge(id, 'generic');
      return;
    }

    // Filter rated/casual
    if (rated && !this.options.autoAcceptRated) {
      this.log('challenge', `Отклоняем вызов ${id}: авто-приём рейтинговых вызовов выключен.`);
      await this.declineChallenge(id, 'generic');
      return;
    }
    if (!rated && !this.options.autoAcceptCasual) {
      this.log('challenge', `Отклоняем вызов ${id}: авто-приём товарищеских вызовов выключен.`);
      await this.declineChallenge(id, 'generic');
      return;
    }

    // Check concurrent games limit
    if (this.activeGame) {
      this.log('challenge', `Отклоняем вызов ${id}: бот уже играет в партии ${this.activeGame.id}`);
      await this.declineChallenge(id, 'later');
      return;
    }

    // Accept!
    this.log('challenge', `✓ Принимаем вызов от @${challenger}!`);
    await this.acceptChallenge(id);
  }

  private async acceptChallenge(id: string): Promise<void> {
    try {
      await fetch(this.getApiUrl(`/api/challenge/${id}/accept`), {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.token}` },
      });
    } catch (err) {
      this.log('error', `Ошибка при принятии вызова ${id}: ${err}`);
    }
  }

  private async declineChallenge(id: string, reason: string): Promise<void> {
    try {
      await fetch(this.getApiUrl(`/api/challenge/${id}/decline`), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reason }),
      });
    } catch (err) {
      this.log('error', `Ошибка при отклонении вызова ${id}: ${err}`);
    }
  }

  /**
   * Handle game stream (/api/bot/game/stream/{gameId})
   */
  private async playGame(gameId: string): Promise<void> {
    try {
      const signal = this.abortController?.signal;
      const resp = await fetch(this.getApiUrl(`/api/bot/game/stream/${gameId}`), {
        headers: { Authorization: `Bearer ${this.token}` },
        signal,
      });

      if (!resp.ok) {
        this.log('error', `Не удалось открыть стрим партии ${gameId}: HTTP ${resp.status}`);
        return;
      }

      const reader = resp.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      let buffer = '';
      let isMyColorWhite = true;
      let firstTurnGreetingSent = false;

      // Reset UCI engine for new game
      await this.uciEngine.processCommand('ucinewgame');
      await this.uciEngine.processCommand('isready');

      while (this.isRunning) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          let data: any;
          try {
            data = JSON.parse(trimmed);
          } catch {
            continue;
          }

          if (data.type === 'gameFull') {
            const whiteName = data.white?.name || '';
            const blackName = data.black?.name || '';
            isMyColorWhite = whiteName.toLowerCase() === this.botUsername?.toLowerCase();
            const myColor: 'w' | 'b' = isMyColorWhite ? 'w' : 'b';
            const opponentName = isMyColorWhite ? blackName : whiteName;
            const opponentRating = (isMyColorWhite ? data.black?.rating : data.white?.rating) || 1500;
            const opponentTitle = isMyColorWhite ? data.black?.title : data.white?.title;

            this.activeGame = {
              id: gameId,
              speed: data.speed,
              rated: data.rated,
              opponent: opponentName,
              opponentRating,
              opponentTitle,
              myColor,
              movesCount: 0,
              myTimeMs: isMyColorWhite ? data.state?.wtime : data.state?.btime,
              oppTimeMs: isMyColorWhite ? data.state?.btime : data.state?.wtime,
              turn: 'w',
            };
            this.gamesPlayed++;
            this.notify();

            this.log(
              'game',
              `Партия ${gameId} началась! Бот играет за ${isMyColorWhite ? 'Белых (White)' : 'Чёрных (Black)'} против @${opponentName} (${opponentRating})`
            );

            // Send greeting in Lichess chat
            if (this.options.sendGreeting && !firstTurnGreetingSent) {
              firstTurnGreetingSent = true;
              this.sendGameChat(
                gameId,
                `Hello! I am Stockfish NNUE (${NNUE_MODEL_INFO.features}, 1.3B positions). Good luck and have fun!`
              );
            }

            // Handle initial state
            await this.processGameState(gameId, data.state, isMyColorWhite);
          } else if (data.type === 'gameState') {
            await this.processGameState(gameId, data, isMyColorWhite);
          } else if (data.type === 'chatLine') {
            if (data.username !== this.botUsername) {
              this.log('game', `[Чат @${data.username}]: ${data.text}`);
            }
          }
        }
      }
    } catch (err: unknown) {
      if (!this.isRunning) return;
      const msg = err instanceof Error ? err.message : String(err);
      this.log('error', `Ошибка в процессе партии ${gameId}: ${msg}`);
    } finally {
      if (this.activeGame && this.activeGame.id === gameId) {
        this.activeGame = null;
        this.notify();
      }
    }
  }

  /**
   * Process a gameState update from Lichess
   */
  private async processGameState(gameId: string, state: any, isMyColorWhite: boolean): Promise<void> {
    if (!state) return;

    const movesStr = (state.moves || '').trim();
    const moveList = movesStr.length > 0 ? movesStr.split(/\s+/) : [];
    const isWhiteTurn = moveList.length % 2 === 0;
    const isMyTurn = (isWhiteTurn && isMyColorWhite) || (!isWhiteTurn && !isMyColorWhite);

    const wtime = state.wtime || 60000;
    const btime = state.btime || 60000;
    const winc = state.winc || 0;
    const binc = state.binc || 0;

    if (this.activeGame) {
      this.activeGame.movesCount = moveList.length;
      this.activeGame.myTimeMs = isMyColorWhite ? wtime : btime;
      this.activeGame.oppTimeMs = isMyColorWhite ? btime : wtime;
      this.activeGame.turn = isWhiteTurn ? 'w' : 'b';
      if (moveList.length > 0) {
        this.activeGame.lastMove = moveList[moveList.length - 1];
      }
      this.notify();
    }

    // Check if game has finished
    const status = state.status;
    if (status && status !== 'started' && status !== 'created') {
      const winner = state.winner;
      let resultText = `Статус: ${status}`;
      if (winner) {
        const iWon = (winner === 'white' && isMyColorWhite) || (winner === 'black' && !isMyColorWhite);
        if (iWon) {
          this.wins++;
          resultText = `Победа бота! (+1)`;
        } else {
          this.losses++;
          resultText = `Поражение бота (-1)`;
        }
      } else {
        this.draws++;
        resultText = `Ничья (=)`;
      }
      this.log('game', `🏁 Партия ${gameId} окончена: ${resultText}`);
      this.activeGame = null;
      this.notify();
      return;
    }

    if (!isMyTurn) {
      return;
    }

    // It is OUR turn!
    this.log('game', `Ход бота #${moveList.length + 1} (${isMyColorWhite ? 'Белые' : 'Чёрные'}). Позиция: ${moveList.length} полуходов`);

    // 1. Set position in UCI engine
    const posCmd = moveList.length > 0 ? `position startpos moves ${movesStr}` : 'position startpos';
    await this.uciEngine.processCommand(posCmd);

    // 2. Start UCI search with clocks
    const t0 = performance.now();
    let bestMoveUci: string | null = null;

    const unsubscribe = this.uciEngine.subscribe({
      onOutput: () => {},
      onBestMove: (uci) => {
        bestMoveUci = uci;
      },
    });

    const goCmd = `go wtime ${wtime} btime ${btime} winc ${winc} binc ${binc}`;
    await this.uciEngine.processCommand(goCmd);
    unsubscribe();

    const searchTimeMs = Math.round(performance.now() - t0);

    if (bestMoveUci && bestMoveUci !== '(none)') {
      this.log(
        'game',
        `♟ Бот выбрал ход: ${bestMoveUci} за ${searchTimeMs}ms (NPS: ${this.currentNps.toLocaleString()}, Depth: ${this.currentDepth}, Оценка: ${this.currentEval !== null ? (this.currentEval / 100).toFixed(2) + ' cp' : 'N/A'})`
      );

      if (this.activeGame) {
        this.activeGame.lastMove = bestMoveUci;
        this.activeGame.lastMoveTimeMs = searchTimeMs;
        if (this.currentEval !== null) {
          this.activeGame.evalScore = this.currentEval;
        }
        this.notify();
      }

      await this.sendMove(gameId, bestMoveUci);
    } else {
      this.log('error', `Движок не вернул ход для позиции: ${posCmd}`);
    }
  }

  /**
   * Make a move via Lichess API
   */
  private async sendMove(gameId: string, uciMove: string): Promise<boolean> {
    try {
      const resp = await fetch(this.getApiUrl(`/api/bot/game/${gameId}/move/${uciMove}`), {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.token}` },
      });

      if (!resp.ok) {
        const text = await resp.text();
        this.log('error', `Ошибка отправки хода ${uciMove}: ${text}`);
        return false;
      }
      return true;
    } catch (err) {
      this.log('error', `Сетевая ошибка при отправке хода ${uciMove}: ${err}`);
      return false;
    }
  }

  /**
   * Send chat message in game
   */
  private async sendGameChat(gameId: string, text: string): Promise<void> {
    try {
      await fetch(this.getApiUrl(`/api/bot/game/${gameId}/chat`), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ room: 'player', text }),
      });
    } catch {
      // ignore chat error
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }
}
