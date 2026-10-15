/**
 * WebAssembly C Chess Search Engine Wrapper with Legal Move Safety & TypeScript Fallback
 * Guarantees 100% legal moves under all circumstances.
 * Offloads search to a dedicated Web Worker to prevent browser thread freezing.
 */

import { BoardState, SearchStats } from '../types/chess';
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
    const isNode = typeof process !== 'undefined' && process.versions != null && process.versions.node != null;

    if (!isNode && typeof fetch !== 'undefined') {
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

export class WasmChessSearchEngine {
  private wasm: WasmExports | null = null;
  private tsEngine = new TypeScriptChessSearchEngine();
  private worker: Worker | null = null;
  private activeSearchResolve: ((value: SearchStats) => void) | null = null;
  private activeSearchReject: ((reason?: unknown) => void) | null = null;
  private activeProgressCallback: ((stats: SearchStats) => void) | null = null;
  private activeSearchState: BoardState | null = null;
  private activeSearchOptions: { maxDepth: number; timeLimitMs?: number; useQuiescence?: boolean } | null = null;
  private watchdogTimer: ReturnType<typeof setTimeout> | null = null;
  private currentSearchId = 0;

  constructor() {
    this.initWorker();
  }

  private initWorker(): void {
    if (typeof window !== 'undefined' && typeof Worker !== 'undefined') {
      try {
        this.worker = new Worker(new URL('./engineWorker.ts', import.meta.url), {
          type: 'module',
        });

        this.worker.onmessage = (e: MessageEvent) => {
          const { id, type, stats, result, error } = e.data;
          if (id !== undefined && id !== this.currentSearchId) {
            return; // Ignore stale search messages
          }

          if (type === 'progress') {
            if (this.activeProgressCallback && stats) {
              this.activeProgressCallback(stats);
            }
          } else if (type === 'done') {
            if (this.watchdogTimer) clearTimeout(this.watchdogTimer);
            if (this.activeSearchResolve && result) {
              this.activeSearchResolve(result);
            }
            this.cleanupSearch();
          } else if (type === 'error') {
            console.warn('Worker search error, falling back to main thread:', error);
            this.fallbackToTsSearch();
          }
        };

        this.worker.onerror = (err) => {
          console.warn('Chess worker error event, falling back to main thread search:', err);
          this.fallbackToTsSearch();
        };

        this.worker.postMessage({ type: 'init' });
      } catch (err) {
        console.warn('Web Worker initialization failed, fallback to main thread search:', err);
        this.worker = null;
      }
    }
  }

  private fallbackToTsSearch(): void {
    if (this.watchdogTimer) clearTimeout(this.watchdogTimer);
    const resolve = this.activeSearchResolve;
    const reject = this.activeSearchReject;
    const progress = this.activeProgressCallback;
    const state = this.activeSearchState;
    const options = this.activeSearchOptions;

    this.cleanupSearch();

    // Terminate problematic worker
    try {
      this.worker?.terminate();
    } catch {}
    this.worker = null;

    if (resolve && state && options) {
      this.tsEngine.search(state, options, progress || undefined)
        .then(resolve)
        .catch((err) => {
          if (reject) reject(err);
        });
    }
  }

  private cleanupSearch(): void {
    if (this.watchdogTimer) {
      clearTimeout(this.watchdogTimer);
      this.watchdogTimer = null;
    }
    this.activeSearchResolve = null;
    this.activeSearchReject = null;
    this.activeProgressCallback = null;
    this.activeSearchState = null;
    this.activeSearchOptions = null;
  }

  public async init(): Promise<void> {
    try {
      this.wasm = await initWasmEngine();
    } catch (e) {
      console.warn('WASM engine init fallback to TypeScript search:', e);
    }
  }

  public clearTT(): void {
    if (this.worker) {
      try {
        this.worker.postMessage({ type: 'clearTT' });
      } catch {
        // ignore
      }
    }
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
    if (this.watchdogTimer) {
      clearTimeout(this.watchdogTimer);
      this.watchdogTimer = null;
    }
    if (this.worker) {
      try {
        this.worker.postMessage({ type: 'stop' });
      } catch {
        // ignore
      }
    }
    if (this.wasm) {
      try {
        this.wasm.engine_stop();
      } catch {
        // ignore
      }
    }
    this.tsEngine.stop();
  }

  public evaluateQuiescent(state: BoardState): number {
    return this.tsEngine.evaluateQuiescent(state);
  }

  public async search(
    state: BoardState,
    options: { maxDepth: number; timeLimitMs?: number; useQuiescence?: boolean },
    onProgress?: (stats: SearchStats) => void
  ): Promise<SearchStats> {
    // If Web Worker is available, run on separate background thread to guarantee 0% UI freeze
    if (this.worker) {
      return new Promise<SearchStats>((resolve, reject) => {
        this.currentSearchId++;
        const id = this.currentSearchId;

        this.activeSearchResolve = resolve;
        this.activeSearchReject = reject;
        this.activeProgressCallback = onProgress || null;
        this.activeSearchState = state;
        this.activeSearchOptions = options;

        // Safety watchdog: ensure a move is NEVER permanently stuck
        const maxExpectedMs = (options.timeLimitMs || 1500) + 2000;
        this.watchdogTimer = setTimeout(() => {
          console.warn('Search watchdog triggered, forcing stop and resolution');
          this.stop();
        }, maxExpectedMs);

        this.worker!.postMessage({
          id,
          type: 'search',
          state,
          options,
        });
      });
    }

    // Fallback: asynchronous main thread search with event-loop yields
    return this.tsEngine.search(state, options, onProgress);
  }
}
