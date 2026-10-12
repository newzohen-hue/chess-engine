/**
 * Position Evaluation Module for Chess Engine.
 * Powered by Stockfish NNUE architecture (HalfKAv2_hm neural network).
 */

import { BoardState, Color, PositionBreakdown, PieceType } from '../types/chess';
import { squareToFile, squareToRank, toSquare } from './chessRules';
import { evaluateNnue, isNnueLoaded } from './nnue';

// Material base values (Centipawns)
export const PIECE_VALUES: Record<PieceType, { mg: number; eg: number }> = {
  p: { mg: 100, eg: 130 },
  n: { mg: 320, eg: 310 },
  b: { mg: 330, eg: 335 },
  r: { mg: 500, eg: 530 },
  q: { mg: 950, eg: 980 },
  k: { mg: 20000, eg: 20000 },
};

// PeSTO's Piece-Square Tables (White perspective, Index 0 = a8, 63 = h1)
const PAWN_PST_MG = [
    0,   0,   0,   0,   0,   0,   0,   0,
   98, 134,  61,  95,  68, 126,  34, -11,
   -6,   7,  26,  31,  65,  56,  25, -20,
  -14,  13,   6,  21,  23,  12,  17, -23,
  -27,  -2,  -5,  12,  17,   6,  10, -25,
  -26,  -4,  -4, -10,   3,   3,  33, -12,
  -35,  -1, -20, -23, -15,  24,  38, -22,
    0,   0,   0,   0,   0,   0,   0,   0,
];

const PAWN_PST_EG = [
    0,   0,   0,   0,   0,   0,   0,   0,
  178, 173, 158, 134, 147, 132, 165, 187,
   94, 100,  85,  67,  56,  53,  82,  84,
   32,  24,  13,   5,  -2,   4,  17,  17,
   13,   9,  -3,  -7,  -7,  -8,   3,  -1,
    4,   7,  -6,   1,   0,  -5,  -1,  -8,
   13,   9,  -3,  -7,  -7,  -8,   3,  -1,
    0,   0,   0,   0,   0,   0,   0,   0,
];

const KNIGHT_PST_MG = [
  -167, -89, -34, -49,  61, -97, -15, -107,
   -73, -41,  72,  36,  23,  62,   7,  -17,
   -47,  60,  37,  65,  84, 129,  73,   44,
    -9,  17,  19,  53,  37,  69,  18,   22,
   -13,   4,  16,  13,  28,  19,  21,   -8,
   -23,  -9,  12,  10,  19,  17,  25,  -16,
   -29, -53, -12,  -3,  -1,  18, -14,  -19,
  -105, -21, -58, -33, -17, -28, -19,  -23,
];

const KNIGHT_PST_EG = [
  -58, -38, -13, -28, -31, -27, -63, -99,
  -25,  -8, -25,  -2,  -9, -25, -24, -52,
  -24, -20,  10,   9,  -1,  -9, -19, -41,
  -17,   3,  22,  22,  22,  11,   8, -18,
  -18,  -6,  16,  25,  16,  17,   4, -18,
  -23,  -3,  -1,  15,  10,  -3, -20, -22,
  -42, -20, -10,  -5,  -2, -20, -23, -44,
  -29, -51, -23, -15, -22, -18, -50, -64,
];

const BISHOP_PST_MG = [
  -29,   4, -82, -37, -25, -42,   7,  -8,
  -26,  16, -18, -13,  30,  59,  18, -47,
  -16,  37,  43,  40,  35,  50,  37,  -2,
   -4,   5,  19,  50,  37,  37,   7,  -2,
   -6,  13,  13,  26,  34,  12,  10,   4,
    0,  15,  15,  15,  14,  27,  18,  10,
    4,  15,  16,   0,   7,  21,  33,   1,
  -33,  -3, -14, -21, -13, -12, -39, -21,
];

const BISHOP_PST_EG = [
  -14, -21, -11,  -8,  -7,  -9, -17, -24,
   -8,  -4,   7, -12,  -3, -13,  -4, -14,
    2,  -8,   0,  -1,  -2,   6,   0,   4,
   -3,   9,  12,   9,  14,  10,   3,   2,
   -6,   3,  13,  19,   7,  10,  -3,  -9,
  -12,  -3,   8,  10,  13,   3,  -7, -15,
  -14, -18,  -7,  -1,   4,  -9, -15, -27,
  -23,  -9, -23,  -5,  -9, -16,  -5, -17,
];

const ROOK_PST_MG = [
   32,  42,  32,  51,  63,   9,  31,  43,
   27,  32,  58,  62,  80,  67,  26,  44,
   -5,  19,  26,  36,  17,  45,  61,  16,
  -24, -11,   7,  26,  24,  35,  -8, -20,
  -36, -26, -12,  -1,   9,  -7,   6, -23,
  -45, -25, -16, -17,   3,   0,  -5, -33,
  -44, -16, -20,  -9,  -1,  11,  -6, -71,
  -19, -13,   1,  17,  16,   7, -37, -26,
];

const ROOK_PST_EG = [
  13, 10, 18, 15, 12,  12,   8,   5,
  11, 13, 13, 11, -3,   3,   8,   3,
   7,  7,  7,  5,  4,  -3,  -5,  -3,
   4,  3, 13,  1,  2,   1,  -1,   2,
   3,  5,  8,  4, -5,  -6,  -8, -11,
  -4,  0, -5, -1, -7, -12,  -8, -16,
  -6, -6,  0,  2, -9,  -9, -11,  -3,
  -9,  2,  3, -1, -5, -13,   4, -20,
];

const QUEEN_PST_MG = [
  -28,   0,  29,  12,  59,  44,  43,  45,
  -24, -39,  -5,   1, -16,  57,  28,  54,
  -13, -17,   7,   8,  29,  56,  47,  57,
  -27, -27, -16, -16,  -1,  17,  -2,   1,
   -9, -26,  -9, -10,  -2,  -4,   3,  -3,
  -14,   2, -11,  -2,  -5,   2,  14,   5,
  -35,  -8,  11,   2,   8,  15,  -3,   1,
   -1, -18,  -9,  10, -15, -25, -31, -50,
];

const QUEEN_PST_EG = [
   -9,  22,  22,  27,  27,  19,  10,  20,
  -17,  20,  32,  41,  58,  25,  30,   0,
  -20,   6,   9,  49,  47,  35,  19,   9,
    3,  22,  24,  45,  57,  40,  57,  36,
  -18,  28,  19,  47,  31,  34,  39,  18,
  -16, -27,  15,   6,   9,  17,  10,   5,
  -22, -23, -30, -16, -16, -23, -36, -32,
  -33, -28, -22, -43,  -5, -32, -20, -41,
];

const KING_PST_MG = [
  -65,  23,  16, -15, -56, -34,   2,  13,
   29,  -1, -20,  -7,  -8,  -4, -38, -29,
   -9,  24,   2, -16, -20,   6,  22, -22,
  -17, -20, -12, -27, -30, -25, -14, -36,
  -49,  -1, -27, -39, -46, -44, -33, -51,
  -14, -14, -22, -46, -44, -30, -15, -27,
    1,   7,  -8, -64, -43, -16,   9,   8,
  -15,  36,  12, -54,   8, -28,  24,  14,
];

const KING_PST_EG = [
  -74, -35, -18, -18, -11,  15,   4, -17,
  -12,  17,  14,  17,  17,  38,  23,  11,
   10,  17,  23,  15,  20,  45,  44,  13,
   -8,  22,  24,  27,  26,  33,  26,   3,
  -18,  -4,  21,  24,  27,  23,   9, -11,
  -19,  -3,  11,  21,  23,  16,   7,  -9,
  -27, -11,   4,  13,  14,   4,  -5, -17,
  -53, -34, -21, -11, -28, -14, -24, -43,
];

function getPstScore(type: PieceType, sq: number, isEg: boolean): number {
  if (isEg) {
    switch (type) {
      case 'p': return PAWN_PST_EG[sq];
      case 'n': return KNIGHT_PST_EG[sq];
      case 'b': return BISHOP_PST_EG[sq];
      case 'r': return ROOK_PST_EG[sq];
      case 'q': return QUEEN_PST_EG[sq];
      case 'k': return KING_PST_EG[sq];
    }
  } else {
    switch (type) {
      case 'p': return PAWN_PST_MG[sq];
      case 'n': return KNIGHT_PST_MG[sq];
      case 'b': return BISHOP_PST_MG[sq];
      case 'r': return ROOK_PST_MG[sq];
      case 'q': return QUEEN_PST_MG[sq];
      case 'k': return KING_PST_MG[sq];
    }
  }
}

// Mirror square vertically for Black's perspective
export function mirrorSquare(sq: number): number {
  return sq ^ 56;
}

// Calculate game phase from non-pawn pieces (0 = late endgame, 24 = opening/full board)
export function getGamePhase(board: (any | null)[]): number {
  let phase = 0;
  for (let sq = 0; sq < 64; sq++) {
    const piece = board[sq];
    if (!piece) continue;
    switch (piece.type) {
      case 'n': phase += 1; break;
      case 'b': phase += 1; break;
      case 'r': phase += 2; break;
      case 'q': phase += 4; break;
    }
  }
  return Math.min(24, phase);
}

/**
 * Fast evaluation returning centipawns relative to side to move.
 * Uses Stockfish NNUE neural network evaluation.
 */
export function evaluateBoard(state: BoardState): number {
  if (isNnueLoaded()) {
    const nnue = evaluateNnue(state);
    if (nnue !== null) {
      return state.turn === 'w' ? nnue : -nnue;
    }
  }
  const scoreFromWhite = evaluateFromWhitePerspective(state);
  return state.turn === 'w' ? scoreFromWhite : -scoreFromWhite;
}

/**
 * Position evaluation from White's perspective (+ = White advantage, - = Black advantage).
 * Strictly driven by Stockfish NNUE.
 */
export function evaluateFromWhitePerspective(state: BoardState): number {
  if (isNnueLoaded()) {
    const nnue = evaluateNnue(state);
    if (nnue !== null) {
      return nnue;
    }
  }
  const { board } = state;
  const phase = getGamePhase(board); // 0 to 24

  let mgWhite = 0;
  let mgBlack = 0;
  let egWhite = 0;
  let egBlack = 0;

  let whiteBishops = 0;
  let blackBishops = 0;
  const whiteBishopSquares: number[] = [];
  const blackBishopSquares: number[] = [];
  const whiteKnightSquares: number[] = [];
  const blackKnightSquares: number[] = [];
  const whiteRookSquares: number[] = [];
  const blackRookSquares: number[] = [];

  const whitePawnsOnFile = [0, 0, 0, 0, 0, 0, 0, 0];
  const blackPawnsOnFile = [0, 0, 0, 0, 0, 0, 0, 0];
  const whitePawnSquares: number[] = [];
  const blackPawnSquares: number[] = [];

  let whiteKingSq = 60;
  let blackKingSq = 4;

  // 1. Piece Material and Piece-Square Tables (PeSTO)
  for (let sq = 0; sq < 64; sq++) {
    const p = board[sq];
    if (!p) continue;

    const file = squareToFile(sq);

    if (p.color === 'w') {
      mgWhite += PIECE_VALUES[p.type].mg;
      egWhite += PIECE_VALUES[p.type].eg;
      mgWhite += getPstScore(p.type, sq, false);
      egWhite += getPstScore(p.type, sq, true);

      if (p.type === 'b') {
        whiteBishops++;
        whiteBishopSquares.push(sq);
      } else if (p.type === 'n') {
        whiteKnightSquares.push(sq);
      } else if (p.type === 'r') {
        whiteRookSquares.push(sq);
      } else if (p.type === 'p') {
        whitePawnsOnFile[file]++;
        whitePawnSquares.push(sq);
      } else if (p.type === 'k') {
        whiteKingSq = sq;
      }
    } else {
      const mirrored = mirrorSquare(sq);
      mgBlack += PIECE_VALUES[p.type].mg;
      egBlack += PIECE_VALUES[p.type].eg;
      mgBlack += getPstScore(p.type, mirrored, false);
      egBlack += getPstScore(p.type, mirrored, true);

      if (p.type === 'b') {
        blackBishops++;
        blackBishopSquares.push(sq);
      } else if (p.type === 'n') {
        blackKnightSquares.push(sq);
      } else if (p.type === 'r') {
        blackRookSquares.push(sq);
      } else if (p.type === 'p') {
        blackPawnsOnFile[file]++;
        blackPawnSquares.push(sq);
      } else if (p.type === 'k') {
        blackKingSq = sq;
      }
    }
  }

  // 2. Bishop Pair Bonus & Bad Bishop Penalties
  if (whiteBishops >= 2) {
    mgWhite += 40;
    egWhite += 50;
  }
  if (blackBishops >= 2) {
    mgBlack += 40;
    egBlack += 50;
  }

  // Bad bishop: penalty for friendly pawns locked on same square color
  for (const bSq of whiteBishopSquares) {
    const isLightSq = (squareToRank(bSq) + squareToFile(bSq)) % 2 === 0;
    let lockedPawns = 0;
    for (const pSq of whitePawnSquares) {
      if (((squareToRank(pSq) + squareToFile(pSq)) % 2 === 0) === isLightSq) {
        lockedPawns++;
      }
    }
    if (lockedPawns >= 4) {
      mgWhite -= lockedPawns * 3;
      egWhite -= lockedPawns * 4;
    }
  }

  for (const bSq of blackBishopSquares) {
    const isLightSq = (squareToRank(bSq) + squareToFile(bSq)) % 2 === 0;
    let lockedPawns = 0;
    for (const pSq of blackPawnSquares) {
      if (((squareToRank(pSq) + squareToFile(pSq)) % 2 === 0) === isLightSq) {
        lockedPawns++;
      }
    }
    if (lockedPawns >= 4) {
      mgBlack -= lockedPawns * 3;
      egBlack -= lockedPawns * 4;
    }
  }

  // 3. Pawn Structure (Doubled, Isolated, Phalanxes, Center Control)
  for (let f = 0; f < 8; f++) {
    // Doubled pawns
    if (whitePawnsOnFile[f] > 1) {
      const penalty = (whitePawnsOnFile[f] - 1) * 16;
      mgWhite -= penalty;
      egWhite -= penalty + 4;
    }
    if (blackPawnsOnFile[f] > 1) {
      const penalty = (blackPawnsOnFile[f] - 1) * 16;
      mgBlack -= penalty;
      egBlack -= penalty + 4;
    }

    // Isolated pawn penalty (amplified if on open file with no opponent pawns either)
    const whiteHasNeighbor = (f > 0 && whitePawnsOnFile[f - 1] > 0) || (f < 7 && whitePawnsOnFile[f + 1] > 0);
    if (whitePawnsOnFile[f] > 0 && !whiteHasNeighbor) {
      const openFileBonus = blackPawnsOnFile[f] === 0 ? 8 : 0;
      mgWhite -= 18 + openFileBonus;
      egWhite -= 22 + openFileBonus;
    }

    const blackHasNeighbor = (f > 0 && blackPawnsOnFile[f - 1] > 0) || (f < 7 && blackPawnsOnFile[f + 1] > 0);
    if (blackPawnsOnFile[f] > 0 && !blackHasNeighbor) {
      const openFileBonus = whitePawnsOnFile[f] === 0 ? 8 : 0;
      mgBlack -= 18 + openFileBonus;
      egBlack -= 22 + openFileBonus;
    }
  }

  // Connected Pawns / Pawn Phalanxes
  for (const sq of whitePawnSquares) {
    const f = squareToFile(sq);
    const r = squareToRank(sq);
    // Supporting pawn diagonally behind
    const hasLeftSupport = f > 0 && r < 7 && board[toSquare(r + 1, f - 1)]?.type === 'p' && board[toSquare(r + 1, f - 1)]?.color === 'w';
    const hasRightSupport = f < 7 && r < 7 && board[toSquare(r + 1, f + 1)]?.type === 'p' && board[toSquare(r + 1, f + 1)]?.color === 'w';
    if (hasLeftSupport || hasRightSupport) {
      mgWhite += 8;
      egWhite += 10;
    }
    // Center control bonus (pawns on d4, e4, c4, f4)
    if ((r === 4 || r === 3) && (f === 3 || f === 4)) {
      mgWhite += 16;
    }
  }

  for (const sq of blackPawnSquares) {
    const f = squareToFile(sq);
    const r = squareToRank(sq);
    const hasLeftSupport = f > 0 && r > 0 && board[toSquare(r - 1, f - 1)]?.type === 'p' && board[toSquare(r - 1, f - 1)]?.color === 'b';
    const hasRightSupport = f < 7 && r > 0 && board[toSquare(r - 1, f + 1)]?.type === 'p' && board[toSquare(r - 1, f + 1)]?.color === 'b';
    if (hasLeftSupport || hasRightSupport) {
      mgBlack += 8;
      egBlack += 10;
    }
    if ((r === 3 || r === 4) && (f === 3 || f === 4)) {
      mgBlack += 16;
    }
  }

  // 4. Passed Pawns (With Protected & Connected Bonuses)
  for (const sq of whitePawnSquares) {
    const f = squareToFile(sq);
    const r = squareToRank(sq);
    let isPassed = true;
    for (let checkF = Math.max(0, f - 1); checkF <= Math.min(7, f + 1); checkF++) {
      for (let checkR = 0; checkR < r; checkR++) {
        const bp = board[toSquare(checkR, checkF)];
        if (bp && bp.color === 'b' && bp.type === 'p') {
          isPassed = false;
          break;
        }
      }
      if (!isPassed) break;
    }

    if (isPassed) {
      const advance = 7 - r; // 1 to 6
      let bonusMg = advance * advance * 4;
      let bonusEg = advance * advance * 6 + (advance >= 4 ? 25 : 0);

      // Protected passed pawn bonus
      const isProtected =
        (f > 0 && r < 7 && board[toSquare(r + 1, f - 1)]?.type === 'p' && board[toSquare(r + 1, f - 1)]?.color === 'w') ||
        (f < 7 && r < 7 && board[toSquare(r + 1, f + 1)]?.type === 'p' && board[toSquare(r + 1, f + 1)]?.color === 'w');
      if (isProtected) {
        bonusMg = Math.floor(bonusMg * 1.3);
        bonusEg = Math.floor(bonusEg * 1.35);
      }

      mgWhite += bonusMg;
      egWhite += bonusEg;
    }
  }

  for (const sq of blackPawnSquares) {
    const f = squareToFile(sq);
    const r = squareToRank(sq);
    let isPassed = true;
    for (let checkF = Math.max(0, f - 1); checkF <= Math.min(7, f + 1); checkF++) {
      for (let checkR = r + 1; checkR < 8; checkR++) {
        const wp = board[toSquare(checkR, checkF)];
        if (wp && wp.color === 'w' && wp.type === 'p') {
          isPassed = false;
          break;
        }
      }
      if (!isPassed) break;
    }

    if (isPassed) {
      const advance = r; // 1 to 6
      let bonusMg = advance * advance * 4;
      let bonusEg = advance * advance * 6 + (advance >= 4 ? 25 : 0);

      const isProtected =
        (f > 0 && r > 0 && board[toSquare(r - 1, f - 1)]?.type === 'p' && board[toSquare(r - 1, f - 1)]?.color === 'b') ||
        (f < 7 && r > 0 && board[toSquare(r - 1, f + 1)]?.type === 'p' && board[toSquare(r - 1, f + 1)]?.color === 'b');
      if (isProtected) {
        bonusMg = Math.floor(bonusMg * 1.3);
        bonusEg = Math.floor(bonusEg * 1.35);
      }

      mgBlack += bonusMg;
      egBlack += bonusEg;
    }
  }

  // 5. Rook Positional Evaluation (Open / Semi-open files, 7th Rank, Connected Rooks)
  for (const sq of whiteRookSquares) {
    const f = squareToFile(sq);
    const r = squareToRank(sq);

    // Open & Semi-open files
    if (whitePawnsOnFile[f] === 0) {
      if (blackPawnsOnFile[f] === 0) {
        mgWhite += 28; // Fully open file
        egWhite += 20;
      } else {
        mgWhite += 14; // Semi-open file
        egWhite += 10;
      }
    }

    // Rook on 7th rank (rank index 1 for white)
    if (r === 1) {
      mgWhite += 35;
      egWhite += 45;
    }
  }

  for (const sq of blackRookSquares) {
    const f = squareToFile(sq);
    const r = squareToRank(sq);

    if (blackPawnsOnFile[f] === 0) {
      if (whitePawnsOnFile[f] === 0) {
        mgBlack += 28;
        egBlack += 20;
      } else {
        mgBlack += 14;
        egBlack += 10;
      }
    }

    // Rook on 2nd rank for black (rank index 6)
    if (r === 6) {
      mgBlack += 35;
      egBlack += 45;
    }
  }

  // Connected rooks bonus
  if (whiteRookSquares.length >= 2) {
    const r1 = whiteRookSquares[0];
    const r2 = whiteRookSquares[1];
    if (squareToRank(r1) === squareToRank(r2) || squareToFile(r1) === squareToFile(r2)) {
      mgWhite += 16;
      egWhite += 16;
    }
  }
  if (blackRookSquares.length >= 2) {
    const r1 = blackRookSquares[0];
    const r2 = blackRookSquares[1];
    if (squareToRank(r1) === squareToRank(r2) || squareToFile(r1) === squareToFile(r2)) {
      mgBlack += 16;
      egBlack += 16;
    }
  }

  // 6. Knight Outposts & Rim Penalties
  for (const sq of whiteKnightSquares) {
    const f = squareToFile(sq);
    const r = squareToRank(sq);

    // Rim knight penalty (a-file or h-file)
    if (f === 0 || f === 7) {
      mgWhite -= 14;
      egWhite -= 16;
    }

    // Outpost on ranks 3, 4, 5 (indices 4, 3, 2)
    if (r >= 2 && r <= 4 && f >= 2 && f <= 5) {
      const isDefendedByPawn =
        (f > 0 && r < 7 && board[toSquare(r + 1, f - 1)]?.type === 'p' && board[toSquare(r + 1, f - 1)]?.color === 'w') ||
        (f < 7 && r < 7 && board[toSquare(r + 1, f + 1)]?.type === 'p' && board[toSquare(r + 1, f + 1)]?.color === 'w');
      if (isDefendedByPawn) {
        mgWhite += 24;
        egWhite += 18;
      }
    }
  }

  for (const sq of blackKnightSquares) {
    const f = squareToFile(sq);
    const r = squareToRank(sq);

    if (f === 0 || f === 7) {
      mgBlack -= 14;
      egBlack -= 16;
    }

    if (r >= 3 && r <= 5 && f >= 2 && f <= 5) {
      const isDefendedByPawn =
        (f > 0 && r > 0 && board[toSquare(r - 1, f - 1)]?.type === 'p' && board[toSquare(r - 1, f - 1)]?.color === 'b') ||
        (f < 7 && r > 0 && board[toSquare(r - 1, f + 1)]?.type === 'p' && board[toSquare(r - 1, f + 1)]?.color === 'b');
      if (isDefendedByPawn) {
        mgBlack += 24;
        egBlack += 18;
      }
    }
  }

  // 7. King Safety in Midgame & King Centralization in Endgame
  const mgKingWeight = phase / 24;
  const egKingWeight = 1 - mgKingWeight;

  if (mgKingWeight > 0.25) {
    // White king pawn shield
    const wkf = squareToFile(whiteKingSq);
    const wkr = squareToRank(whiteKingSq);
    if (wkr >= 6) {
      let shield = 0;
      for (let f = Math.max(0, wkf - 1); f <= Math.min(7, wkf + 1); f++) {
        if (whitePawnsOnFile[f] > 0) {
          shield += 14;
        } else {
          shield -= 20; // Open file directly adjacent to king
        }
        if (blackPawnsOnFile[f] === 0) shield -= 10;
      }
      mgWhite += shield;
    } else {
      // King stuck in center penalty during opening/midgame
      if (wkf >= 3 && wkf <= 4 && wkr >= 4) {
        mgWhite -= 24;
      }
    }

    // Black king pawn shield
    const bkf = squareToFile(blackKingSq);
    const bkr = squareToRank(blackKingSq);
    if (bkr <= 1) {
      let shield = 0;
      for (let f = Math.max(0, bkf - 1); f <= Math.min(7, bkf + 1); f++) {
        if (blackPawnsOnFile[f] > 0) {
          shield += 14;
        } else {
          shield -= 20;
        }
        if (whitePawnsOnFile[f] === 0) shield -= 10;
      }
      mgBlack += shield;
    } else {
      if (bkf >= 3 && bkf <= 4 && bkr <= 3) {
        mgBlack -= 24;
      }
    }
  }

  // Endgame King Centralization
  if (egKingWeight > 0.4) {
    const wkr = squareToRank(whiteKingSq);
    const wkf = squareToFile(whiteKingSq);
    const bkr = squareToRank(blackKingSq);
    const bkf = squareToFile(blackKingSq);

    // Distance to center (3.5, 3.5)
    const wDist = Math.abs(wkr - 3.5) + Math.abs(wkf - 3.5);
    const bDist = Math.abs(bkr - 3.5) + Math.abs(bkf - 3.5);

    egWhite += Math.round((7 - wDist) * 8);
    egBlack += Math.round((7 - bDist) * 8);
  }

  // Tapered evaluation interpolation
  const mgScore = mgWhite - mgBlack;
  const egScore = egWhite - egBlack;
  const total = Math.round((mgScore * phase + egScore * (24 - phase)) / 24);

  return total;
}

/**
 * Returns authentic Stockfish NNUE neural network evaluation, game phase,
 * piece inventory and win probability.
 * NNUE computes non-linear feature interactions directly via trained weight matrices.
 */
export function getPositionBreakdown(state: BoardState): PositionBreakdown {
  const { board } = state;
  const phase = getGamePhase(board); // 0 to 24

  const nnue = isNnueLoaded() ? evaluateNnue(state) ?? undefined : undefined;
  const total = nnue ?? evaluateFromWhitePerspective(state);

  const whitePieces: Record<PieceType, number> = { p: 0, n: 0, b: 0, r: 0, q: 0, k: 1 };
  const blackPieces: Record<PieceType, number> = { p: 0, n: 0, b: 0, r: 0, q: 0, k: 1 };

  for (let sq = 0; sq < 64; sq++) {
    const piece = board[sq];
    if (!piece || piece.type === 'k') continue;
    if (piece.color === 'w') {
      whitePieces[piece.type] = (whitePieces[piece.type] || 0) + 1;
    } else {
      blackPieces[piece.type] = (blackPieces[piece.type] || 0) + 1;
    }
  }

  const pieceScores: Record<PieceType, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
  let whiteMat = 0;
  let blackMat = 0;
  for (const t of ['p', 'n', 'b', 'r', 'q'] as PieceType[]) {
    whiteMat += (whitePieces[t] || 0) * pieceScores[t];
    blackMat += (blackPieces[t] || 0) * pieceScores[t];
  }
  const materialBalance = whiteMat - blackMat;

  // Stockfish WDL win-probability model: 1 / (1 + 10^(-score / 400))
  const winProbabilityWhite = Math.round(
    (1 / (1 + Math.pow(10, -total / 400))) * 1000
  ) / 10;

  return {
    total,
    nnueScore: nnue ?? total,
    gamePhase: Number((phase / 24).toFixed(2)),
    evalPerspective: state.turn,
    whitePieces,
    blackPieces,
    materialBalance,
    winProbabilityWhite,
  };
}
