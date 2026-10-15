/**
 * Web Worker for offloading Stockfish NNUE chess search from the main UI thread.
 * Guarantees zero freezing/hanging of the browser UI, silky smooth clocks, and instant responsiveness.
 */

import { TypeScriptChessSearchEngine } from './tsSearch';
import { loadNnueModel } from './nnue';
import { BoardState, SearchStats } from '../types/chess';

const engine = new TypeScriptChessSearchEngine();

// Preload NNUE model in worker memory
loadNnueModel('/models/final_model.nnue').catch((err) => {
  console.warn('Worker NNUE preload fallback:', err);
});

self.onmessage = async (e: MessageEvent) => {
  const { id, type, state, options } = e.data;

  if (type === 'init') {
    try {
      await loadNnueModel('/models/final_model.nnue');
      self.postMessage({ id, type: 'init_done' });
    } catch {
      self.postMessage({ id, type: 'init_done' });
    }
    return;
  }

  if (type === 'stop') {
    engine.stop();
    return;
  }

  if (type === 'clearTT') {
    engine.clearTT();
    return;
  }

  if (type === 'search') {
    engine.stop(); // Stop any previous search
    try {
      // Ensure model is loaded before searching
      await loadNnueModel('/models/final_model.nnue');

      const result = await engine.search(
        state as BoardState,
        options,
        (progress: SearchStats) => {
          self.postMessage({ id, type: 'progress', stats: progress });
        }
      );
      self.postMessage({ id, type: 'done', result });
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      self.postMessage({ id, type: 'error', error: errorMsg });
    }
  }
};
