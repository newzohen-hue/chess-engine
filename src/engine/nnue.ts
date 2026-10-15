/**
 * Neural Network Evaluation (NNUE) Module
 * Efficiently Updatable Neural Network loader and evaluator.
 * Architecture: HalfKAv2_hm^ (L1: 1024, L2: 15, L3: 32, 8 buckets)
 * Trained on: 1.3 Billion positions (13 epochs of 100M positions on T80.oct2022.bestmove.binpack)
 */

import { BoardState, PieceType } from '../types/chess';
import { NNUE_MODEL_INFO } from './nnueModelInfo';

export { NNUE_MODEL_INFO };

// OrientTBL: Mirrors files a..d (0..3) horizontally so king is on files e..h
const SQ_A1 = 0;
const SQ_H1 = 7;
const OrientTBL = new Int32Array(64);
for (let s = 0; s < 64; s++) {
  const file = s % 8;
  OrientTBL[s] = file < 4 ? SQ_H1 : SQ_A1;
}

// KingBuckets (32 buckets, 704 features each)
const B = (v: number) => v * 704;
const KingBuckets = new Int32Array([
  B(28), B(29), B(30), B(31), B(31), B(30), B(29), B(28),
  B(24), B(25), B(26), B(27), B(27), B(26), B(25), B(24),
  B(20), B(21), B(22), B(23), B(23), B(22), B(21), B(20),
  B(16), B(17), B(18), B(19), B(19), B(18), B(17), B(16),
  B(12), B(13), B(14), B(15), B(15), B(14), B(13), B(12),
  B(8),  B(9),  B(10), B(11), B(11), B(10), B(9),  B(8),
  B(4),  B(5),  B(6),  B(7),  B(7),  B(6),  B(5),  B(4),
  B(0),  B(1),  B(2),  B(3),  B(3),  B(2),  B(1),  B(0),
]);

// Piece offsets in HalfKAv2_hm
const PS_W_PAWN = 0,   PS_B_PAWN = 64;
const PS_W_KNIGHT = 128, PS_B_KNIGHT = 192;
const PS_W_BISHOP = 256, PS_B_BISHOP = 320;
const PS_W_ROOK = 384,   PS_B_ROOK = 448;
const PS_W_QUEEN = 512,  PS_B_QUEEN = 576;
const PS_KING = 640;

const PSI: number[][] = [
  // White perspective (us = White, them = Black)
  [0, PS_W_PAWN, PS_W_KNIGHT, PS_W_BISHOP, PS_W_ROOK, PS_W_QUEEN, PS_KING, 0,
   0, PS_B_PAWN, PS_B_KNIGHT, PS_B_BISHOP, PS_B_ROOK, PS_B_QUEEN, PS_KING, 0],
  // Black perspective (us = Black, them = White)
  [0, PS_B_PAWN, PS_B_KNIGHT, PS_B_BISHOP, PS_B_ROOK, PS_B_QUEEN, PS_KING, 0,
   0, PS_W_PAWN, PS_W_KNIGHT, PS_W_BISHOP, PS_W_ROOK, PS_W_QUEEN, PS_KING, 0],
];

function makeIndex(perspective: number, s: number, pc: number, ksq: number): number {
  const flip = 56 * perspective;
  return (s ^ OrientTBL[ksq] ^ flip) + PSI[perspective][pc] + KingBuckets[ksq ^ flip];
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : (v > max ? max : v);
}

export interface NnueLayerStack {
  fc0_biases: Int32Array;
  fc0_weights: Int8Array;
  fc1_biases: Int32Array;
  fc1_weights: Int8Array;
  fc2_bias: number;
  fc2_weights: Int8Array;
}

export interface NnueModel {
  ftBiases: Int16Array;
  ftWeights: Int16Array;
  psqtWeights: Int32Array;
  layers: NnueLayerStack[];
}

let loadedModel: NnueModel | null = null;
let modelLoadingPromise: Promise<NnueModel | null> | null = null;

function decodeLeb128(buf: Uint8Array, count: number, isInt16: boolean): Int16Array | Int32Array {
  const res = isInt16 ? new Int16Array(count) : new Int32Array(count);
  let p = 0;
  let i = 0;
  const L = buf.length;
  while (i < count && p < L) {
    let result = 0;
    let shift = 0;
    while (true) {
      const b = buf[p++];
      result |= (b & 0x7f) << shift;
      shift += 7;
      if (!(b & 0x80)) {
        if (shift < 32 && (b & 0x40)) result |= -(1 << shift);
        break;
      }
    }
    res[i++] = result;
  }
  return res;
}

export async function loadNnueModel(url = '/models/final_model.nnue'): Promise<NnueModel | null> {
  if (loadedModel) return loadedModel;
  if (modelLoadingPromise) return modelLoadingPromise;

  modelLoadingPromise = (async () => {
    try {
      let arrayBuffer: ArrayBuffer;
      const isNode = typeof process !== 'undefined' && process.versions != null && process.versions.node != null;

      if (!isNode && typeof fetch !== 'undefined') {
        // Browser Window or Web Worker
        const resp = await fetch(url);
        if (!resp.ok) {
          console.warn(`Failed to fetch NNUE file at ${url}: status ${resp.status}`);
          return null;
        }
        arrayBuffer = await resp.arrayBuffer();
      } else {
        // Node.js environment
        const fs = await import('fs');
        const path = await import('path');
        const targetPath = url.startsWith('/') ? path.join(process.cwd(), 'public', url) : url;
        const buf = fs.readFileSync(targetPath);
        arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
      }

      const fileBuf = new Uint8Array(arrayBuffer);
      const dataView = new DataView(arrayBuffer);

      let pos = 0;
      pos += 8; // skip version & netHash
      const descLen = dataView.getUint32(pos, true);
      pos += 4 + descLen + 4; // skip description + ftHash

      function readLeb128Chunk(): Uint8Array {
        pos += 17; // skip COMPRESSED_LEB128 magic
        const size = dataView.getUint32(pos, true);
        pos += 4;
        const chunk = fileBuf.subarray(pos, pos + size);
        pos += size;
        return chunk;
      }

      const ftBiases = decodeLeb128(readLeb128Chunk(), 1024, true) as Int16Array;
      const ftWeights = decodeLeb128(readLeb128Chunk(), 22528 * 1024, true) as Int16Array;
      const psqtWeights = decodeLeb128(readLeb128Chunk(), 22528 * 8, false) as Int32Array;

      const layers: NnueLayerStack[] = [];
      for (let s = 0; s < 8; s++) {
        pos += 4; // skip stack hash
        const fc0_biases = new Int32Array(15);
        for (let j = 0; j < 15; j++) {
          fc0_biases[j] = dataView.getInt32(pos, true);
          pos += 4;
        }
        const fc0_weights = new Int8Array(arrayBuffer, pos, 15 * 1024);
        pos += 15 * 1024;

        const fc1_biases = new Int32Array(32);
        for (let j = 0; j < 32; j++) {
          fc1_biases[j] = dataView.getInt32(pos, true);
          pos += 4;
        }
        const fc1_weights = new Int8Array(arrayBuffer, pos, 32 * 32);
        pos += 32 * 32;

        const fc2_bias = dataView.getInt32(pos, true);
        pos += 4;

        const fc2_weights = new Int8Array(arrayBuffer, pos, 96);
        pos += 96;

        layers.push({
          fc0_biases,
          fc0_weights,
          fc1_biases,
          fc1_weights,
          fc2_bias,
          fc2_weights,
        });
      }

      loadedModel = {
        ftBiases,
        ftWeights,
        psqtWeights,
        layers,
      };

      console.info('✓ Stockfish NNUE model successfully loaded into memory.');
      return loadedModel;
    } catch (err) {
      console.warn('NNUE model loading failed:', err);
      return null;
    }
  })();

  return modelLoadingPromise;
}

export function isNnueLoaded(): boolean {
  return loadedModel !== null;
}

/**
 * Maps standard board representation (0=a8..63=h1) to Stockfish square (0=a1..63=h8)
 * and Stockfish piece codes.
 */
function toStockfishPiece(type: PieceType, color: 'w' | 'b'): number {
  if (color === 'w') {
    switch (type) {
      case 'p': return 1;
      case 'n': return 2;
      case 'b': return 3;
      case 'r': return 4;
      case 'q': return 5;
      case 'k': return 6;
    }
  } else {
    switch (type) {
      case 'p': return 9;
      case 'n': return 10;
      case 'b': return 11;
      case 'r': return 12;
      case 'q': return 13;
      case 'k': return 14;
    }
  }
}

// Reusable buffers to minimize GC allocations during evaluation
const accWhiteBuf = new Int32Array(1024);
const accBlackBuf = new Int32Array(1024);
const psqtWhiteBuf = new Int32Array(8);
const psqtBlackBuf = new Int32Array(8);
const transformedBuf = new Int8Array(1024);
const fc0OutBuf = new Int32Array(15);
const concat0Buf = new Int8Array(32);
const fc1OutBuf = new Int32Array(32);
const concat1Buf = new Int8Array(96);

/**
 * Evaluates a board position using Stockfish NNUE architecture.
 * Returns evaluation in centipawns from White's perspective (+ = White advantage).
 */
export function evaluateNnue(state: BoardState): number | null {
  if (!loadedModel) return null;

  const model = loadedModel;

  let pieceCount = 0;
  let ksqWhite = -1;
  let ksqBlack = -1;

  for (let sq = 0; sq < 64; sq++) {
    const p = state.board[sq];
    if (p) {
      pieceCount++;
      const sfSq = sq ^ 56;
      if (p.type === 'k') {
        if (p.color === 'w') ksqWhite = sfSq;
        else ksqBlack = sfSq;
      }
    }
  }

  if (ksqWhite < 0 || ksqBlack < 0) return null;

  // Initialize accumulators with feature transformer biases
  accWhiteBuf.set(model.ftBiases);
  accBlackBuf.set(model.ftBiases);
  psqtWhiteBuf.fill(0);
  psqtBlackBuf.fill(0);

  const ftW = model.ftWeights;
  const psqtW = model.psqtWeights;

  for (let sq = 0; sq < 64; sq++) {
    const p = state.board[sq];
    if (!p) continue;
    const sfSq = sq ^ 56;
    const pc = toStockfishPiece(p.type, p.color);

    // White perspective
    const idxW = makeIndex(0, sfSq, pc, ksqWhite);
    const wOff = idxW * 1024;
    for (let j = 0; j < 1024; j++) accWhiteBuf[j] += ftW[wOff + j];
    const pwOff = idxW * 8;
    for (let b = 0; b < 8; b++) psqtWhiteBuf[b] += psqtW[pwOff + b];

    // Black perspective
    const idxB = makeIndex(1, sfSq, pc, ksqBlack);
    const bOff = idxB * 1024;
    for (let j = 0; j < 1024; j++) accBlackBuf[j] += ftW[bOff + j];
    const pbOff = idxB * 8;
    for (let b = 0; b < 8; b++) psqtBlackBuf[b] += psqtW[pbOff + b];
  }

  // Perspective 0: Side to move
  const isWhiteToMove = state.turn === 'w';
  const accUs = isWhiteToMove ? accWhiteBuf : accBlackBuf;
  const accThem = isWhiteToMove ? accBlackBuf : accWhiteBuf;

  // Clipped pairwise multiplication: clamp to [0, 255] and divide product by 512
  for (let j = 0; j < 512; j++) {
    const s0 = clamp(accUs[j], 0, 255);
    const s1 = clamp(accUs[j + 512], 0, 255);
    transformedBuf[j] = Math.floor((s0 * s1) / 512);
  }
  for (let j = 0; j < 512; j++) {
    const s0 = clamp(accThem[j], 0, 255);
    const s1 = clamp(accThem[j + 512], 0, 255);
    transformedBuf[512 + j] = Math.floor((s0 * s1) / 512);
  }

  const bucket = Math.max(0, Math.min(7, Math.floor((pieceCount - 1) / 4)));
  const layer = model.layers[bucket];

  const psqtUs = isWhiteToMove ? psqtWhiteBuf[bucket] : psqtBlackBuf[bucket];
  const psqtThem = isWhiteToMove ? psqtBlackBuf[bucket] : psqtWhiteBuf[bucket];
  const psqtScore = Math.floor((psqtUs - psqtThem) / 2);

  // fc_0: 1024 -> 15
  for (let out = 0; out < 15; out++) {
    let sum = layer.fc0_biases[out];
    const row = out * 1024;
    for (let k = 0; k < 1024; k++) {
      sum += transformedBuf[k] * layer.fc0_weights[row + k];
    }
    fc0OutBuf[out] = sum;
  }

  // ac_sqr_0 and ac_0 (WeightScaleBitsLocal = 7)
  concat0Buf.fill(0);
  for (let out = 0; out < 15; out++) {
    const v = fc0OutBuf[out];
    const sqr = Math.floor((v * v) / 2097152); // (v * v) >> 21
    concat0Buf[out] = sqr > 127 ? 127 : sqr;
    concat0Buf[15 + out] = clamp(v >> 7, 0, 127);
  }

  // fc_1: 32 (padded from 30) -> 32
  for (let out = 0; out < 32; out++) {
    let sum = layer.fc1_biases[out];
    const row = out * 32;
    for (let k = 0; k < 32; k++) {
      sum += concat0Buf[k] * layer.fc1_weights[row + k];
    }
    fc1OutBuf[out] = sum;
  }

  // ac_sqr_1 and ac_1 (WeightScaleBitsLocal = 6)
  concat1Buf.set(concat0Buf.subarray(0, 30), 0);
  for (let out = 0; out < 32; out++) {
    const v = fc1OutBuf[out];
    const sqr = Math.floor((v * v) / 524288); // (v * v) >> 19
    concat1Buf[30 + out] = sqr > 127 ? 127 : sqr;
    concat1Buf[30 + 32 + out] = clamp(v >> 6, 0, 127);
  }

  // fc_2: 96 (padded from 94) -> 1
  let fwdOut = layer.fc2_bias;
  for (let k = 0; k < 96; k++) {
    fwdOut += concat1Buf[k] * layer.fc2_weights[k];
  }

  // Skip connection
  const skip0 = fc0OutBuf[13] - fc0OutBuf[14];
  fwdOut += skip0;

  // Multiplier: (600 * 16) / (128 * 64 * 2) = 9600 / 16384
  const positional = Math.round((fwdOut * 9600) / 16384);

  const totalRaw = psqtScore + positional;
  // Convert Stockfish internal units (where PawnValue = 208 and OutputScale = 16) to standard centipawns
  const centipawns = Math.round((totalRaw / 16 / 208) * 100);

  // Return score from White perspective (+ = White advantage)
  return isWhiteToMove ? centipawns : -centipawns;
}
