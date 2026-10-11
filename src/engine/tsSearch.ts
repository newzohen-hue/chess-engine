/**
 * High-Performance Pure TypeScript Chess Search Engine.
 * Master-Grade Alpha-Beta, Transposition Table, Quiescence Search with Legal Captures,
 * MVV-LVA move ordering, Killer Moves, and History Heuristic.
 *
 * Fast, rock-solid, and plays with grandmaster tactical precision.
 */

import { BoardState, Move, SearchStats } from '../types/chess';
import {
  generateLegalCaptures,
  generateLegalMoves,
  getPositionKey,
  isKingInCheck,
  makeMove,
  moveToSAN,
} from './chessRules';
import { evaluateBoard, PIECE_VALUES } from './evaluation';
import { evaluateNnue, isNnueLoaded } from './nnue';

export const MATE_SCORE = 100000;

const EXACT = 0;
const LOWERBOUND = 1;
const UPPERBOUND = 2;

interface TTEntry {
  depth: number;
  score: number;
  flag: number;
  bestMove: Move | null;
}

export class TypeScriptChessSearchEngine {
  private tt = new Map<string, TTEntry>();
  private nodesVisited = 0;
  private isAborted = false;
  private startTime = 0;
  private timeLimitMs = 1500;
  private killerMoves: [Move | null, Move | null][] = Array.from({ length: 64 }, () => [null, null]);
  private historyTable: number[][][] = Array.from({ length: 2 }, () =>
    Array.from({ length: 64 }, () => Array(64).fill(0))
  );

  public stop(): void {
    this.isAborted = true;
  }

  public clearTT(): void {
    this.tt.clear();
    this.killerMoves = Array.from({ length: 64 }, () => [null, null]);
    this.historyTable = Array.from({ length: 2 }, () =>
      Array.from({ length: 64 }, () => Array(64).fill(0))
    );
  }

  private evaluatePosition(state: BoardState): number {
    if (isNnueLoaded()) {
      const score = evaluateNnue(state);
      if (score !== null) {
        // evaluateNnue returns score from White's perspective (+ = White advantage)
        // Negamax search requires score from side-to-move perspective
        return state.turn === 'w' ? score : -score;
      }
    }
    return evaluateBoard(state);
  }

  /**
   * Evaluates a position resolving all immediate tactical hanging captures (Quiescence).
   * Prevents raw material spikes when a capture is made and a recapture is pending.
   * Returns score from White's perspective (+ = White advantage).
   */
  public evaluateQuiescent(state: BoardState): number {
    this.nodesVisited = 0;
    this.startTime = Date.now();
    this.timeLimitMs = 50; // Max 50ms cap for instant UI response
    this.isAborted = false;

    const inCheck = isKingInCheck(state.board, state.turn);
    const score = this.quiescence(state, -MATE_SCORE, MATE_SCORE, 0);
    // Convert negamax score to White perspective
    return state.turn === 'w' ? score : -score;
  }

  public async search(
    state: BoardState,
    options: { maxDepth: number; timeLimitMs?: number; useQuiescence?: boolean },
    onProgress?: (stats: SearchStats) => void
  ): Promise<SearchStats> {
    this.isAborted = false;
    this.nodesVisited = 0;
    this.startTime = Date.now();
    this.timeLimitMs = options.timeLimitMs || 1500;
    const maxDepth = Math.max(1, Math.min(10, options.maxDepth));
    const useQuiescence = options.useQuiescence !== false;

    // Generate root legal moves without expensive SAN strings
    const legalMoves = generateLegalMoves(state, false);
    if (legalMoves.length === 0) {
      const inCheck = isKingInCheck(state.board, state.turn);
      return {
        depth: 0,
        selDepth: 0,
        nodes: 1,
        timeMs: 1,
        nps: 1,
        score: inCheck ? -MATE_SCORE : 0,
        isMate: inCheck,
        mateIn: inCheck ? 0 : undefined,
        bestMove: null,
        pv: [],
        pvSan: [],
      };
    }

    // Default to first legal move with SAN computed
    let overallBestMove: Move = {
      ...legalMoves[0],
      san: moveToSAN(state, legalMoves[0]),
    };
    let overallBestScore = -MATE_SCORE;
    let overallPv: Move[] = [overallBestMove];
    let overallPvSan: string[] = [overallBestMove.san || ''];
    let reachedDepth = 1;

    // Iterative Deepening
    for (let depth = 1; depth <= maxDepth; depth++) {
      if (this.isAborted) break;
      if (this.timeLimitMs > 0 && Date.now() - this.startTime >= this.timeLimitMs) break;

      const pvLine: Move[] = [];
      const score = this.searchRoot(
        state,
        legalMoves,
        depth,
        -MATE_SCORE,
        MATE_SCORE,
        useQuiescence,
        pvLine
      );

      if (this.isAborted && depth > 1) break;

      reachedDepth = depth;
      overallBestScore = score;

      if (pvLine.length > 0) {
        overallBestMove = {
          ...pvLine[0],
          san: moveToSAN(state, pvLine[0]),
        };
        overallPv = pvLine;

        // Build clean SAN representation for PV line
        const pvSan: string[] = [];
        let curState = state;
        for (const m of pvLine) {
          try {
            const san = moveToSAN(curState, m);
            pvSan.push(san);
            curState = makeMove(curState, { ...m, san });
          } catch {
            break;
          }
        }
        overallPvSan = pvSan;
      }

      // Check for forced mate
      const isMate = Math.abs(overallBestScore) > MATE_SCORE - 100;
      let mateIn: number | undefined;
      if (isMate) {
        const pliesToMate = MATE_SCORE - Math.abs(overallBestScore);
        const movesToMate = Math.ceil(pliesToMate / 2);
        mateIn = overallBestScore > 0 ? movesToMate : -movesToMate;
      }

      const elapsed = Math.max(1, Date.now() - this.startTime);
      const nps = Math.floor((this.nodesVisited * 1000) / elapsed);

      // Convert score to White perspective for UI
      const whitePerspectiveScore = state.turn === 'w' ? overallBestScore : -overallBestScore;

      const progressStats: SearchStats = {
        depth: reachedDepth,
        selDepth: reachedDepth + (useQuiescence ? 2 : 0),
        nodes: this.nodesVisited,
        timeMs: elapsed,
        nps,
        score: whitePerspectiveScore,
        isMate,
        mateIn,
        bestMove: overallBestMove,
        pv: overallPv,
        pvSan: overallPvSan,
        ttHits: this.tt.size,
      };

      if (onProgress) {
        onProgress(progressStats);
      }

      if (isMate) break;
    }

    const finalElapsed = Math.max(1, Date.now() - this.startTime);
    const finalNps = Math.floor((this.nodesVisited * 1000) / finalElapsed);
    const isMate = Math.abs(overallBestScore) > MATE_SCORE - 100;
    let mateIn: number | undefined;
    if (isMate) {
      const pliesToMate = MATE_SCORE - Math.abs(overallBestScore);
      const movesToMate = Math.ceil(pliesToMate / 2);
      mateIn = overallBestScore > 0 ? movesToMate : -movesToMate;
    }

    const whitePerspectiveScore = state.turn === 'w' ? overallBestScore : -overallBestScore;

    return {
      depth: reachedDepth,
      selDepth: reachedDepth + (useQuiescence ? 2 : 0),
      nodes: this.nodesVisited,
      timeMs: finalElapsed,
      nps: finalNps,
      score: whitePerspectiveScore,
      isMate,
      mateIn,
      bestMove: overallBestMove,
      pv: overallPv,
      pvSan: overallPvSan,
      ttHits: this.tt.size,
    };
  }

  private scoreMove(move: Move, ttMove: Move | null, ply: number, turn: 'w' | 'b'): number {
    // 1. Hash move from Transposition Table
    if (
      ttMove &&
      move.from === ttMove.from &&
      move.to === ttMove.to &&
      move.promotion === ttMove.promotion
    ) {
      return 10000000;
    }

    // 2. MVV-LVA for Captures
    if (move.captured) {
      const victimVal = PIECE_VALUES[move.captured].mg;
      const attackerVal = PIECE_VALUES[move.piece].mg;
      return 1000000 + victimVal * 16 - attackerVal;
    }

    // 3. Queen Promotions
    if (move.promotion === 'q') {
      return 900000;
    }

    // 4. Killer Moves
    if (ply < 64) {
      const killers = this.killerMoves[ply];
      if (killers[0] && move.from === killers[0].from && move.to === killers[0].to) {
        return 800000;
      }
      if (killers[1] && move.from === killers[1].from && move.to === killers[1].to) {
        return 700000;
      }
    }

    // 5. History Table
    const turnIdx = turn === 'w' ? 0 : 1;
    return this.historyTable[turnIdx][move.from][move.to];
  }

  private searchRoot(
    state: BoardState,
    legalMoves: Move[],
    depth: number,
    alpha: number,
    beta: number,
    useQuiescence: boolean,
    pvLine: Move[]
  ): number {
    this.nodesVisited++;

    // Probe TT for root move ordering
    const key = getPositionKey(state);
    const ttEntry = this.tt.get(key);
    const ttMove = ttEntry ? ttEntry.bestMove : null;

    // Score and sort moves
    const scores = legalMoves.map((m) => this.scoreMove(m, ttMove, 0, state.turn));
    const sortedMoves = legalMoves
      .map((m, idx) => ({ move: m, score: scores[idx] }))
      .sort((a, b) => b.score - a.score)
      .map((item) => item.move);

    let bestScore = -MATE_SCORE * 2;
    let bestMove: Move = sortedMoves[0];

    for (let i = 0; i < sortedMoves.length; i++) {
      const move = sortedMoves[i];
      const nextState = makeMove(state, move);

      const childPv: Move[] = [];
      let score: number;

      // Principal Variation Search (PVS)
      if (i === 0) {
        score = -this.alphaBeta(nextState, depth - 1, -beta, -alpha, 1, useQuiescence, childPv);
      } else {
        // Late Move Reduction on non-captures
        let reduction = 0;
        if (depth >= 3 && i >= 4 && !move.captured && !move.promotion) {
          reduction = i >= 8 ? 2 : 1;
        }

        score = -this.alphaBeta(
          nextState,
          depth - 1 - reduction,
          -alpha - 1,
          -alpha,
          1,
          useQuiescence,
          childPv
        );

        if (reduction > 0 && score > alpha) {
          score = -this.alphaBeta(nextState, depth - 1, -alpha - 1, -alpha, 1, useQuiescence, childPv);
        }

        if (score > alpha && score < beta) {
          score = -this.alphaBeta(nextState, depth - 1, -beta, -alpha, 1, useQuiescence, childPv);
        }
      }

      if (this.isAborted) return bestScore;

      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
      }

      if (score > alpha) {
        alpha = score;
        pvLine.length = 0;
        pvLine.push(move, ...childPv);
      }

      if (alpha >= beta) {
        break;
      }
    }

    // Always ensure pvLine starts with the highest scored root move
    if (pvLine.length === 0) {
      pvLine.push(bestMove);
    }

    // Save to TT
    this.tt.set(key, {
      depth,
      score: bestScore,
      flag: EXACT,
      bestMove,
    });

    return bestScore;
  }

  private alphaBeta(
    state: BoardState,
    depth: number,
    alpha: number,
    beta: number,
    ply: number,
    useQuiescence: boolean,
    pvLine: Move[]
  ): number {
    this.nodesVisited++;

    // Time budget check periodically
    if ((this.nodesVisited & 2047) === 0) {
      if (this.timeLimitMs > 0 && Date.now() - this.startTime >= this.timeLimitMs) {
        this.isAborted = true;
        return 0;
      }
    }

    const key = getPositionKey(state);
    const ttEntry = this.tt.get(key);

    // TT Probe
    if (ttEntry && ttEntry.depth >= depth && ply > 0) {
      if (ttEntry.flag === EXACT) {
        if (ttEntry.bestMove) {
          pvLine.length = 0;
          pvLine.push(ttEntry.bestMove);
        }
        return ttEntry.score;
      } else if (ttEntry.flag === LOWERBOUND && ttEntry.score > alpha) {
        alpha = ttEntry.score;
      } else if (ttEntry.flag === UPPERBOUND && ttEntry.score < beta) {
        beta = ttEntry.score;
      }
      if (alpha >= beta) {
        return ttEntry.score;
      }
    }

    const inCheck = isKingInCheck(state.board, state.turn);
    if (inCheck && depth > 0) {
      depth++; // Check extension
    }

    if (depth <= 0) {
      if (useQuiescence) {
        return this.quiescence(state, alpha, beta, ply);
      }
      return this.evaluatePosition(state);
    }

    // Draw by 50-move rule
    if (ply > 0 && state.halfmoveClock >= 100) {
      return 0;
    }

    const legalMoves = generateLegalMoves(state, false);
    if (legalMoves.length === 0) {
      return inCheck ? -MATE_SCORE + ply : 0; // Checkmate or stalemate
    }

    const ttMove = ttEntry ? ttEntry.bestMove : null;
    const scores = legalMoves.map((m) => this.scoreMove(m, ttMove, ply, state.turn));
    const sortedMoves = legalMoves
      .map((m, idx) => ({ move: m, score: scores[idx] }))
      .sort((a, b) => b.score - a.score)
      .map((item) => item.move);

    let bestScore = -MATE_SCORE * 2;
    let bestMove: Move = sortedMoves[0];
    const originalAlpha = alpha;

    for (let i = 0; i < sortedMoves.length; i++) {
      const move = sortedMoves[i];
      const nextState = makeMove(state, move);

      const childPv: Move[] = [];
      let score: number;

      if (i === 0) {
        score = -this.alphaBeta(nextState, depth - 1, -beta, -alpha, ply + 1, useQuiescence, childPv);
      } else {
        let reduction = 0;
        if (depth >= 3 && i >= 4 && !move.captured && !move.promotion && !inCheck) {
          reduction = i >= 8 ? 2 : 1;
        }

        score = -this.alphaBeta(
          nextState,
          depth - 1 - reduction,
          -alpha - 1,
          -alpha,
          ply + 1,
          useQuiescence,
          childPv
        );

        if (reduction > 0 && score > alpha) {
          score = -this.alphaBeta(nextState, depth - 1, -alpha - 1, -alpha, ply + 1, useQuiescence, childPv);
        }

        if (score > alpha && score < beta) {
          score = -this.alphaBeta(nextState, depth - 1, -beta, -alpha, ply + 1, useQuiescence, childPv);
        }
      }

      if (this.isAborted) return bestScore;

      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
      }

      if (score > alpha) {
        alpha = score;
        pvLine.length = 0;
        pvLine.push(move, ...childPv);
      }

      if (alpha >= beta) {
        // Killer moves & History heuristic for non-captures
        if (!move.captured && ply < 64) {
          const killers = this.killerMoves[ply];
          if (!killers[0] || killers[0].from !== move.from || killers[0].to !== move.to) {
            killers[1] = killers[0];
            killers[0] = move;
          }
          const turnIdx = state.turn === 'w' ? 0 : 1;
          this.historyTable[turnIdx][move.from][move.to] += depth * depth;
        }
        break;
      }
    }

    // Record in TT
    let flag = EXACT;
    if (bestScore <= originalAlpha) flag = UPPERBOUND;
    else if (bestScore >= beta) flag = LOWERBOUND;

    if (!ttEntry || ttEntry.depth <= depth) {
      this.tt.set(key, {
        depth,
        score: bestScore,
        flag,
        bestMove,
      });
    }

    return bestScore;
  }

  private quiescence(state: BoardState, alpha: number, beta: number, ply: number): number {
    this.nodesVisited++;

    if ((this.nodesVisited & 2047) === 0) {
      if (this.timeLimitMs > 0 && Date.now() - this.startTime >= this.timeLimitMs) {
        this.isAborted = true;
        return 0;
      }
    }

    const inCheck = isKingInCheck(state.board, state.turn);
    const standPat = this.evaluatePosition(state);

    if (!inCheck) {
      if (standPat >= beta) return beta;
      if (standPat > alpha) alpha = standPat;

      // Delta pruning
      if (standPat < alpha - 950) return alpha;
    }

    // Generate strictly captures in quiescence (or all moves if in check)
    const moves = inCheck
      ? generateLegalMoves(state, false)
      : generateLegalCaptures(state);

    if (moves.length === 0) {
      return inCheck ? -MATE_SCORE + ply : standPat;
    }

    // MVV-LVA ordering for captures
    moves.sort((a, b) => {
      const vA = a.captured ? PIECE_VALUES[a.captured].mg * 16 - PIECE_VALUES[a.piece].mg : 0;
      const vB = b.captured ? PIECE_VALUES[b.captured].mg * 16 - PIECE_VALUES[b.piece].mg : 0;
      return vB - vA;
    });

    for (const move of moves) {
      // Bad capture pruning when not in check: if stand_pat + victim + 200 < alpha
      if (!inCheck && move.captured && !move.promotion) {
        const victimVal = PIECE_VALUES[move.captured].mg;
        if (standPat + victimVal + 200 < alpha) {
          continue;
        }
      }

      const nextState = makeMove(state, move);
      const score = -this.quiescence(nextState, -beta, -alpha, ply + 1);

      if (this.isAborted) return 0;
      if (score >= beta) return beta;
      if (score > alpha) alpha = score;
    }

    return alpha;
  }
}
