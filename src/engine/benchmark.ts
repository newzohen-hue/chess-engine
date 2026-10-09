/**
 * Benchmark runner for measuring C Chess Engine NPS across standard tactical and positional test suites.
 * Executes on the C/WebAssembly compiled engine with -O3 optimizations.
 */

import { parseFEN, START_FEN } from './chessRules';
import { WasmChessSearchEngine } from './wasmEngine';

export interface BenchmarkResult {
  name: string;
  fen: string;
  depth: number;
  nodes: number;
  timeMs: number;
  nps: number;
  bestMoveSan?: string;
  ttHits?: number;
  backend: 'c_wasm' | 'native_c';
}

export interface BenchmarkSuiteResult {
  backend: 'c_wasm' | 'native_c';
  results: BenchmarkResult[];
  totalNodes: number;
  totalTimeMs: number;
  averageNps: number;
}

export const BENCHMARK_POSITIONS = [
  {
    name: 'Стартовая позиция (Opening)',
    fen: START_FEN,
    depth: 6,
  },
  {
    name: 'Миттельшпиль (Тактика Kiwipete)',
    fen: 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1',
    depth: 5,
  },
  {
    name: 'Окончание (Ладейный эндшпиль)',
    fen: '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1',
    depth: 6,
  },
];

export async function runWasmEngineBenchmark(
  onProgress?: (index: number, total: number, currentName: string) => void
): Promise<BenchmarkSuiteResult> {
  const engine = new WasmChessSearchEngine();
  await engine.init();
  const results: BenchmarkResult[] = [];
  let totalNodes = 0;
  let totalTimeMs = 0;

  for (let i = 0; i < BENCHMARK_POSITIONS.length; i++) {
    const pos = BENCHMARK_POSITIONS[i];
    if (onProgress) {
      onProgress(i + 1, BENCHMARK_POSITIONS.length, `[C / WebAssembly] ${pos.name}`);
    }

    const state = parseFEN(pos.fen);
    const t0 = performance.now();
    const stats = await engine.search(state, {
      maxDepth: pos.depth,
      useQuiescence: true,
      timeLimitMs: 0,
    });
    const dt = Math.max(1, Math.round(performance.now() - t0));

    results.push({
      name: pos.name,
      fen: pos.fen,
      depth: stats.depth,
      nodes: stats.nodes,
      timeMs: dt,
      nps: Math.round((stats.nodes / dt) * 1000),
      bestMoveSan: stats.pvSan?.[0],
      ttHits: stats.ttHits,
      backend: 'c_wasm',
    });

    totalNodes += stats.nodes;
    totalTimeMs += dt;
  }

  const averageNps = totalTimeMs > 0 ? Math.round((totalNodes / totalTimeMs) * 1000) : 0;

  return {
    backend: 'c_wasm',
    results,
    totalNodes,
    totalTimeMs,
    averageNps,
  };
}
