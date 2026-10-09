/**
 * Universal Chess Interface (UCI) Protocol Implementation for HCE Chess Engine.
 * Supports standard UCI commands:
 * - uci
 * - isready
 * - ucinewgame
 * - position [startpos | fen <fen>] [moves <m1> <m2> ...]
 * - go [depth <d>] [movetime <ms>] [wtime <ms>] [btime <ms>] [infinite]
 * - stop
 * - quit
 * - eval (Extended diagnostic command)
 * - d (ASCII board display)
 */

import { BoardState, Color, Move, PieceType } from '../types/chess';
import {
  START_FEN,
  algebraicToSquare,
  generateLegalMoves,
  makeMove,
  parseFEN,
  squareToAlgebraic,
  toFEN,
} from './chessRules';
import { evaluateFromWhitePerspective, getHceBreakdown } from './evaluation';
import { WasmChessSearchEngine } from './wasmEngine';

export interface UciOutputHandler {
  onOutput: (line: string) => void;
  onBestMove?: (moveUci: string, move: Move | null) => void;
}

export class UciEngine {
  private currentBoard: BoardState = parseFEN(START_FEN);
  private wasmEngine: WasmChessSearchEngine;
  private isSearching = false;
  private outputHandlers: Set<UciOutputHandler> = new Set();
  private maxDepth = 6;
  private hashSizeMb = 64;
  private useQuiescence = true;

  constructor(wasmEngine?: WasmChessSearchEngine) {
    this.wasmEngine = wasmEngine || new WasmChessSearchEngine();
  }

  public subscribe(handler: UciOutputHandler): () => void {
    this.outputHandlers.add(handler);
    return () => this.outputHandlers.delete(handler);
  }

  private send(line: string) {
    for (const h of this.outputHandlers) {
      try {
        h.onOutput(line);
      } catch (e) {
        console.error('UCI output error', e);
      }
    }
  }

  public getCurrentBoard(): BoardState {
    return this.currentBoard;
  }

  public setBoard(state: BoardState) {
    this.currentBoard = state;
  }

  /**
   * Process a single line UCI command
   */
  public async processCommand(rawCommand: string): Promise<void> {
    const cmd = rawCommand.trim();
    if (!cmd) return;

    this.send(`> ${cmd}`);
    const tokens = cmd.split(/\s+/);
    const mainCmd = tokens[0].toLowerCase();

    switch (mainCmd) {
      case 'uci':
        this.handleUci();
        break;

      case 'isready':
        this.send('readyok');
        break;

      case 'ucinewgame':
        this.handleUciNewGame();
        break;

      case 'setoption':
        this.handleSetOption(tokens);
        break;

      case 'position':
        this.handlePosition(tokens);
        break;

      case 'go':
        await this.handleGo(tokens);
        break;

      case 'stop':
        this.handleStop();
        break;

      case 'quit':
        this.handleStop();
        this.send('info string engine terminated');
        break;

      case 'eval':
        this.handleEval();
        break;

      case 'd':
        this.handleDisplay();
        break;

      default:
        this.send(`unknown command: ${cmd}`);
        break;
    }
  }

  private handleUci() {
    this.send('id name HCE Chess Engine (C/WASM)');
    this.send('id author AI Studio & Open Source');
    this.send(`option name Hash type spin default 64 min 1 max 512`);
    this.send(`option name Quiescence type check default true`);
    this.send(`option name MaxDepth type spin default 6 min 1 max 12`);
    this.send('uciok');
  }

  private handleUciNewGame() {
    this.wasmEngine.clearTT();
    this.currentBoard = parseFEN(START_FEN);
    this.send('info string new game initialized, TT cleared');
  }

  private handleSetOption(tokens: string[]) {
    // setoption name <name> [value <val>]
    const nameIdx = tokens.indexOf('name');
    const valIdx = tokens.indexOf('value');
    if (nameIdx !== -1 && valIdx !== -1) {
      const optName = tokens[nameIdx + 1]?.toLowerCase();
      const optVal = tokens[valIdx + 1];
      if (optName === 'hash') {
        this.hashSizeMb = parseInt(optVal, 10) || 64;
        this.send(`info string Hash set to ${this.hashSizeMb} MB`);
      } else if (optName === 'quiescence') {
        this.useQuiescence = optVal.toLowerCase() === 'true';
        this.send(`info string Quiescence set to ${this.useQuiescence}`);
      } else if (optName === 'maxdepth') {
        this.maxDepth = parseInt(optVal, 10) || 6;
        this.send(`info string MaxDepth set to ${this.maxDepth}`);
      }
    }
  }

  private handlePosition(tokens: string[]) {
    // position [startpos | fen <fen...>] [moves <m1> <m2> ...]
    let moveIdx = -1;
    if (tokens[1] === 'startpos') {
      this.currentBoard = parseFEN(START_FEN);
      moveIdx = tokens.indexOf('moves');
    } else if (tokens[1] === 'fen') {
      const fenTokens: string[] = [];
      let i = 2;
      while (i < tokens.length && tokens[i] !== 'moves') {
        fenTokens.push(tokens[i]);
        i++;
      }
      try {
        const fenStr = fenTokens.join(' ');
        this.currentBoard = parseFEN(fenStr);
      } catch (err) {
        this.send(`info string error parsing FEN: ${err}`);
        return;
      }
      if (i < tokens.length && tokens[i] === 'moves') {
        moveIdx = i;
      }
    }

    // Apply moves if present
    if (moveIdx !== -1 && moveIdx + 1 < tokens.length) {
      const moveTokens = tokens.slice(moveIdx + 1);
      for (const mStr of moveTokens) {
        const move = this.parseUciMove(this.currentBoard, mStr);
        if (!move) {
          this.send(`info string illegal move in position: ${mStr}`);
          break;
        }
        this.currentBoard = makeMove(this.currentBoard, move);
      }
    }

    this.send(`info string position set to ${toFEN(this.currentBoard)}`);
  }

  private async handleGo(tokens: string[]) {
    if (this.isSearching) return;

    let searchDepth = this.maxDepth;
    let timeLimitMs = 1500;

    for (let i = 1; i < tokens.length; i++) {
      const t = tokens[i].toLowerCase();
      if (t === 'depth' && i + 1 < tokens.length) {
        searchDepth = Math.max(1, Math.min(12, parseInt(tokens[i + 1], 10) || 6));
      } else if (t === 'movetime' && i + 1 < tokens.length) {
        timeLimitMs = parseInt(tokens[i + 1], 10) || 1000;
      } else if (t === 'infinite') {
        timeLimitMs = 0;
        searchDepth = 10;
      } else if ((t === 'wtime' && this.currentBoard.turn === 'w') || (t === 'btime' && this.currentBoard.turn === 'b')) {
        const timeRemaining = parseInt(tokens[i + 1], 10) || 10000;
        timeLimitMs = Math.max(200, Math.floor(timeRemaining / 30));
      }
    }

    this.isSearching = true;

    try {
      const result = await this.wasmEngine.search(
        this.currentBoard,
        {
          maxDepth: searchDepth,
          timeLimitMs,
          useQuiescence: this.useQuiescence,
        },
        (progress) => {
          // Standard UCI protocol expects score relative to the engine's side to move
          const isBlack = this.currentBoard.turn === 'b';
          const uciScore = isBlack ? -progress.score : progress.score;
          const uciMate = progress.mateIn !== undefined ? (isBlack ? -progress.mateIn : progress.mateIn) : undefined;
          const scoreStr = progress.isMate && uciMate !== undefined
            ? `mate ${uciMate}`
            : `cp ${uciScore}`;
          const pvStr = progress.pv
            ? progress.pv.map((m) => this.moveToUci(m)).join(' ')
            : '';
          this.send(
            `info depth ${progress.depth} seldepth ${progress.selDepth} score ${scoreStr} nodes ${progress.nodes} nps ${progress.nps} time ${progress.timeMs} pv ${pvStr}`
          );
        }
      );

      const bestMoveUci = result.bestMove ? this.moveToUci(result.bestMove) : '(none)';
      this.send(`bestmove ${bestMoveUci}`);

      for (const h of this.outputHandlers) {
        if (h.onBestMove) {
          h.onBestMove(bestMoveUci, result.bestMove);
        }
      }
    } catch (e) {
      this.send(`info string search error: ${e}`);
      this.send('bestmove (none)');
    } finally {
      this.isSearching = false;
    }
  }

  private handleStop() {
    if (this.isSearching) {
      this.wasmEngine.stop();
      this.isSearching = false;
    }
  }

  private handleEval() {
    const bd = getHceBreakdown(this.currentBoard);
    const scoreWhite = evaluateFromWhitePerspective(this.currentBoard);
    const cpTurn = this.currentBoard.turn === 'w' ? scoreWhite : -scoreWhite;

    this.send('=== Handcrafted Evaluation (HCE) ===');
    this.send(
      `Turn: ${this.currentBoard.turn === 'w' ? 'White' : 'Black'} | Total: ${scoreWhite > 0 ? '+' : ''}${(scoreWhite / 100).toFixed(2)} cp (Perspective: ${cpTurn > 0 ? '+' : ''}${(cpTurn / 100).toFixed(2)} cp)`
    );
    this.send(`Game Phase: ${bd.gamePhase} (${bd.gamePhase > 0.5 ? 'Midgame' : 'Endgame'})`);
    this.send(
      `Material:   White ${bd.material.white} | Black ${bd.material.black} | Diff: ${bd.material.diff > 0 ? '+' : ''}${bd.material.diff} cp`
    );
    this.send(
      `PST:        White ${bd.pst.white} | Black ${bd.pst.black} | Diff: ${bd.pst.diff > 0 ? '+' : ''}${bd.pst.diff} cp`
    );
    this.send(
      `Pawns:      White ${bd.pawns.white} | Black ${bd.pawns.black} | Diff: ${bd.pawns.diff > 0 ? '+' : ''}${bd.pawns.diff} cp`
    );
    this.send(
      `KingSafety: White ${bd.kingSafety.white} | Black ${bd.kingSafety.black} | Diff: ${bd.kingSafety.diff > 0 ? '+' : ''}${bd.kingSafety.diff} cp`
    );
    this.send(
      `Activity:   White ${bd.activity.white} | Black ${bd.activity.black} | Diff: ${bd.activity.diff > 0 ? '+' : ''}${bd.activity.diff} cp`
    );
    this.send('====================================');
  }

  private handleDisplay() {
    const b = this.currentBoard.board;
    this.send('+---+---+---+---+---+---+---+---+');
    for (let r = 0; r < 8; r++) {
      let line = '|';
      for (let c = 0; c < 8; c++) {
        const p = b[r * 8 + c];
        if (!p) {
          line += ' . |';
        } else {
          const char = p.color === 'w' ? p.type.toUpperCase() : p.type.toLowerCase();
          line += ` ${char} |`;
        }
      }
      line += `  ${8 - r}`;
      this.send(line);
      this.send('+---+---+---+---+---+---+---+---+');
    }
    this.send('  a   b   c   d   e   f   g   h');
    this.send(`FEN: ${toFEN(this.currentBoard)}`);
    this.send(`Turn: ${this.currentBoard.turn === 'w' ? 'White' : 'Black'}`);
  }

  public moveToUci(move: Move): string {
    const fromStr = squareToAlgebraic(move.from);
    const toStr = squareToAlgebraic(move.to);
    const promoStr = move.promotion ? move.promotion.toLowerCase() : '';
    return `${fromStr}${toStr}${promoStr}`;
  }

  public parseUciMove(state: BoardState, moveStr: string): Move | null {
    if (moveStr.length < 4) return null;
    const fromStr = moveStr.slice(0, 2);
    const toStr = moveStr.slice(2, 4);
    const promoChar = moveStr.length >= 5 ? (moveStr[4].toLowerCase() as PieceType) : undefined;

    const from = algebraicToSquare(fromStr);
    const to = algebraicToSquare(toStr);
    if (from < 0 || from > 63 || to < 0 || to > 63) return null;

    const legal = generateLegalMoves(state);
    const match = legal.find((m) => {
      if (m.from !== from || m.to !== to) return false;
      if (promoChar) {
        return m.promotion === promoChar;
      }
      return !m.promotion;
    });

    return match || null;
  }
}
