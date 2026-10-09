/**
 * Specialized Endgame Knowledge & Tablebase-like Heuristics
 * - Rule of the Square for Passed Pawns in King & Pawn Endgames
 * - Opposition & Key Squares
 * - Draw detection for insufficient material
 */

import { BoardState, Color, Piece } from '../types/chess';
import { findKing, squareToFile, squareToRank, toSquare } from './chessRules';

/**
 * Checks the "Rule of the Square" in pure King and Pawn endgames.
 * Returns true if the passed pawn can promote without the enemy king being able to catch it.
 */
export function isPawnUnstoppable(
  board: (Piece | null)[],
  pawnSq: number,
  pawnColor: Color,
  sideToMove: Color
): boolean {
  const enemyColor: Color = pawnColor === 'w' ? 'b' : 'w';
  const enemyKingSq = findKing(board, enemyColor);
  if (enemyKingSq === -1) return false;

  const pawnRank = squareToRank(pawnSq);
  const pawnFile = squareToFile(pawnSq);
  const kingRank = squareToRank(enemyKingSq);
  const kingFile = squareToFile(enemyKingSq);

  // Distance of pawn to promotion rank
  const promoRank = pawnColor === 'w' ? 0 : 7;
  let distToPromo = Math.abs(promoRank - pawnRank);

  // If pawn is on starting rank and side to move is pawn color, it can move 2 squares
  if (sideToMove === pawnColor) {
    if ((pawnColor === 'w' && pawnRank === 6) || (pawnColor === 'b' && pawnRank === 1)) {
      distToPromo = Math.max(1, distToPromo - 1);
    }
  }

  // If enemy king is to move, its effective distance decreases by 1
  let kingDistance = Math.max(Math.abs(kingRank - promoRank), Math.abs(kingFile - pawnFile));
  if (sideToMove === enemyColor) {
    kingDistance = Math.max(0, kingDistance - 1);
  }

  // If pawn is strictly closer to promotion than enemy king, it's unstoppable
  return distToPromo < kingDistance;
}

/**
 * Detects if a game is a dead theoretical draw by insufficient material or known drawish configurations.
 */
export function isTheoreticalDraw(board: (Piece | null)[]): { isDraw: boolean; reason?: string } {
  let wPawns = 0, bPawns = 0;
  let wKnights = 0, bKnights = 0;
  let wBishops = 0, bBishops = 0;
  let wRooks = 0, bRooks = 0;
  let wQueens = 0, bQueens = 0;

  let wBishopLight = false;
  let bBishopLight = false;

  for (let sq = 0; sq < 64; sq++) {
    const p = board[sq];
    if (!p || p.type === 'k') continue;

    const isLight = (squareToRank(sq) + squareToFile(sq)) % 2 === 0;

    if (p.color === 'w') {
      if (p.type === 'p') wPawns++;
      else if (p.type === 'n') wKnights++;
      else if (p.type === 'b') { wBishops++; wBishopLight = isLight; }
      else if (p.type === 'r') wRooks++;
      else if (p.type === 'q') wQueens++;
    } else {
      if (p.type === 'p') bPawns++;
      else if (p.type === 'n') bKnights++;
      else if (p.type === 'b') { bBishops++; bBishopLight = isLight; }
      else if (p.type === 'r') bRooks++;
      else if (p.type === 'q') bQueens++;
    }
  }

  // 1. King vs King
  if (
    wPawns === 0 && bPawns === 0 &&
    wKnights === 0 && bKnights === 0 &&
    wBishops === 0 && bBishops === 0 &&
    wRooks === 0 && bRooks === 0 &&
    wQueens === 0 && bQueens === 0
  ) {
    return { isDraw: true, reason: 'Король против короля (K vs K)' };
  }

  // 2. King + Minor vs King
  const wPieces = wPawns + wKnights + wBishops + wRooks + wQueens;
  const bPieces = bPawns + bKnights + bBishops + bRooks + bQueens;

  if (wPawns === 0 && bPawns === 0 && wRooks === 0 && bRooks === 0 && wQueens === 0 && bQueens === 0) {
    if (wPieces <= 1 && bPieces === 0) {
      return { isDraw: true, reason: 'Недостаточно материала для мата (K+N или K+B против K)' };
    }
    if (bPieces <= 1 && wPieces === 0) {
      return { isDraw: true, reason: 'Недостаточно материала для мата (K против K+N или K+B)' };
    }
    // K+B vs K+B with same square colored bishops
    if (wBishops === 1 && bBishops === 1 && wKnights === 0 && bKnights === 0) {
      if (wBishopLight === bBishopLight) {
        return { isDraw: true, reason: 'Ничейный эндшпиль: одноцветные слоны (KB vs KB)' };
      }
    }
  }

  return { isDraw: false };
}
