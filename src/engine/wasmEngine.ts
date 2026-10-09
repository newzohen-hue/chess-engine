/**
 * WebAssembly C Chess Search Engine Wrapper with Legal Move Safety & TypeScript Fallback
 * Guarantees 100% legal moves under all circumstances.
 */

import { BoardState, Move, SearchStats } from '../types/chess';
import { generateLegalMoves, makeMove, moveToSAN, toFEN } from './chessRules';
import { TypeScriptChessSearchEngine } from './tsSearch';

export const MATE_SCORE = 100000;

interface WasmExports {
  memory: WebAssembly.Memory;
  __heap_base?: { value: number };
  engine_init: () => void;
  engine_reset: () => void;
  engine_set_fen: (ptr: number) => number;
  engine_get_fen: (ptr: number) => void;
  engine_search: (maxDepth: number, timeLimitMs: number, useQuiescence: number) => void;
  engine_stop: () => void;
  engine_get_best_from: () => number;
  engine_get_best_to: () => number;
  engine_get_best_piece: () => number;
  engine_get_best_captured: () => number;
  engine_get_best_promotion: () => number;
  engine_get_best_flags: () => number;
  engine_get_score: () => number;
  engine_get_nodes: () => number;
  engine_get_time_ms: () => number;
  engine_get_nps: () => number;
  engine_get_depth: () => number;
  engine_get_tt_hits: () => number;
  engine_get_pv_length: () => number;
  engine_get_pv_move: (idx: number, outFromPtr: number, outToPtr: number, outPromoPtr: number) => void;
  engine_evaluate_current: () => number;
}

let wasmInstance: WasmExports | null = null;
let wasmInitPromise: Promise<WasmExports> | null = null;

export async function initWasmEngine(): Promise<WasmExports> {
  if (wasmInstance) return wasmInstance;
  if (wasmInitPromise) return wasmInitPromise;

  wasmInitPromise = (async () => {
    let wasmBytes: ArrayBuffer;

    if (typeof window !== 'undefined') {
      const resp = await fetch('/chess_engine.wasm');
      wasmBytes = await resp.arrayBuffer();
    } else {
      // Node.js environment
      const fs = await import('fs');
      const path = await import('path');
      const wasmPath = path.resolve(process.cwd(), 'public', 'chess_engine.wasm');
      const buf = fs.readFileSync(wasmPath);
      wasmBytes = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    }

    const { instance } = await WebAssembly.instantiate(wasmBytes, {
      env: {
        js_get_time_ms: () => Date.now(),
      },
    });

    const exp = instance.exports as unknown as WasmExports;
    exp.engine_init();
    wasmInstance = exp;
    return exp;
  })();

  return wasmInitPromise;
}

const PIECE_TYPES: ('p' | 'n' | 'b' | 'r' | 'q' | 'k')[] = ['', 'p', 'n', 'b', 'r', 'q', 'k', 'p', 'n', 'b', 'r', 'q', 'k'] as any;

export class WasmChessSearchEngine {
  private wasm: WasmExports | null = null;
  private tsEngine = new TypeScriptChessSearchEngine();

  public async init(): Promise<void> {
    try {
      this.wasm = await initWasmEngine();
    } catch (e) {
      console.warn('WASM engine init fallback to TypeScript search:', e);
    }
  }

  public clearTT(): void {
    if (this.wasm) {
      try {
        this.wasm.engine_reset();
      } catch {
        // ignore
      }
    }
    this.tsEngine.clearTT();
  }

  public stop(): void {
    if (this.wasm) {
      try {
        this.wasm.engine_stop();
      } catch {
        // ignore
      }
    }
    this.tsEngine.stop();
  }

  private writeString(ptr: number, str: string): void {
    if (!this.wasm) return;
    const view = new Uint8Array(this.wasm.memory.buffer);
    for (let i = 0; i < str.length; i++) {
      view[ptr + i] = str.charCodeAt(i);
    }
    view[ptr + str.length] = 0;
  }

  public async search(
    state: BoardState,
    options: { maxDepth: number; timeLimitMs?: number; useQuiescence?: boolean },
    onProgress?: (stats: SearchStats) => void
  ): Promise<SearchStats> {
    // Generate legal moves to guarantee 100% legality
    const legalMoves = generateLegalMoves(state);
    if (legalMoves.length === 0) {
      return this.tsEngine.search(state, options, onProgress);
    }

    if (!this.wasm) {
      await this.init();
    }

    if (!this.wasm) {
      return this.tsEngine.search(state, options, onProgress);
    }

    const wasm = this.wasm;

    try {
      const fen = toFEN(state);
      // Safe heap memory base: guaranteed above all static tables and global variables
      const heapBase = wasm.__heap_base?.value ?? 12720000;
      const neededBytes = heapBase + 4096;
      if (wasm.memory.buffer.byteLength < neededBytes) {
        const extraPages = Math.ceil((neededBytes - wasm.memory.buffer.byteLength) / 65536);
        try {
          wasm.memory.grow(extraPages);
        } catch {
          // ignore
        }
      }

      const FEN_BUFFER_PTR = heapBase + 64;
      const scratchPtr = heapBase + 1024;

      this.writeString(FEN_BUFFER_PTR, fen);
      wasm.engine_set_fen(FEN_BUFFER_PTR);

      const maxDepth = options.maxDepth;
      const timeLimitMs = options.timeLimitMs || 0;
      const useQuiescence = options.useQuiescence !== false ? 1 : 0;

      let bestStats: SearchStats | null = null;

      // Iterative deepening through WASM
      for (let depth = 1; depth <= maxDepth; depth++) {
        wasm.engine_search(depth, timeLimitMs, useQuiescence);

        const nodes = wasm.engine_get_nodes();
        const timeMs = Math.max(1, wasm.engine_get_time_ms());
        const nps = wasm.engine_get_nps();
        const rawScore = wasm.engine_get_score();
        const ttHits = wasm.engine_get_tt_hits();
        const reachedDepth = wasm.engine_get_depth();

        // Convert negamax score (side to move) to canonical White perspective (+ = White, - = Black)
        const isBlackToMove = state.turn === 'b';
        const score = isBlackToMove ? -rawScore : rawScore;

        const from = wasm.engine_get_best_from();
        const to = wasm.engine_get_best_to();
        const promoVal = wasm.engine_get_best_promotion();
        const promoChar = promoVal ? PIECE_TYPES[promoVal] : undefined;

        // Match strictly against authentic legal moves
        let bestMove: Move | null = null;
        const matchingLegal = legalMoves.find(
          (m) =>
            m.from === from &&
            m.to === to &&
            (!promoChar || m.promotion === promoChar)
        );

        if (matchingLegal) {
          bestMove = {
            ...matchingLegal,
            san: matchingLegal.san || moveToSAN(state, matchingLegal),
          };
        } else {
          // If WASM produced an invalid move, fallback immediately to TS engine
          console.warn('WASM returned non-legal move candidates. Engaging TypeScript search verification.');
          return this.tsEngine.search(state, options, onProgress);
        }

        // Read PV line from WASM with validation
        const pvLen = wasm.engine_get_pv_length();
        const pv: Move[] = [];
        const memI32 = new Int32Array(wasm.memory.buffer);
        const scratchIdx = scratchPtr / 4;

        let curState = state;
        const pvSan: string[] = [];

        for (let i = 0; i < pvLen; i++) {
          wasm.engine_get_pv_move(i, scratchPtr, scratchPtr + 4, scratchPtr + 8);
          const mFrom = memI32[scratchIdx];
          const mTo = memI32[scratchIdx + 1];
          const mPromo = memI32[scratchIdx + 2];
          const promoType = mPromo ? PIECE_TYPES[mPromo] : undefined;

          const curLegals = generateLegalMoves(curState);
          const matched = curLegals.find(
            (m) => m.from === mFrom && m.to === mTo && (!promoType || m.promotion === promoType)
          );

          if (!matched) break;

          try {
            const san = matched.san || moveToSAN(curState, matched);
            pvSan.push(san);
            curState = makeMove(curState, matched);
            pv.push(matched);
          } catch {
            break;
          }
        }

        let isMate = false;
        let mateIn: number | undefined;
        if (Math.abs(score) > MATE_SCORE - 100) {
          isMate = true;
          const pliesToMate = MATE_SCORE - Math.abs(score);
          const movesToMate = Math.ceil(pliesToMate / 2);
          mateIn = score > 0 ? movesToMate : -movesToMate;
        }

        const stats: SearchStats = {
          depth: reachedDepth,
          selDepth: reachedDepth + (useQuiescence ? 2 : 0),
          nodes,
          timeMs,
          nps,
          score,
          isMate,
          mateIn,
          bestMove,
          pv: pv.length > 0 ? pv : [bestMove],
          pvSan: pvSan.length > 0 ? pvSan : [bestMove.san || ''],
          ttHits,
        };

        bestStats = stats;
        if (onProgress) {
          onProgress(stats);
        }

        if (isMate) break;
        if (timeLimitMs > 0 && timeMs >= timeLimitMs) break;
      }

      if (bestStats && bestStats.bestMove) {
        return bestStats;
      }
    } catch (e) {
      console.warn('WASM search execution error, falling back to TypeScript search:', e);
    }

    // Rock-solid fallback to TypeScript search
    return this.tsEngine.search(state, options, onProgress);
  }
}
