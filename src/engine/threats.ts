/**
 * Tactical Threat & Blunder Detector with Natural Explanations and Hints.
 */

import { BoardState, Color, Move, Piece, PieceType } from '../types/chess';
import {
  findKing,
  generateLegalMoves,
  isKingInCheck,
  isSquareAttacked,
  squareToAlgebraic,
  squareToFile,
  squareToRank,
} from './chessRules';
import { PIECE_VALUES } from './evaluation';

export interface TacticalThreat {
  type: 'check' | 'hanging' | 'fork' | 'pin';
  severity: 'critical' | 'warning' | 'info';
  sourceSquare?: number;
  targetSquare: number;
  pieceType: PieceType;
  color: Color;
  description: string;
}

export interface HintAnalysis {
  move: Move;
  uci: string;
  explanation: string;
  badge: 'Дебют' | 'Тактика' | 'Защита' | 'Атака' | 'Позиция';
}

/**
 * Scan board for current tactical threats against side to move or by side to move
 */
export function detectThreats(state: BoardState): TacticalThreat[] {
  const threats: TacticalThreat[] = [];
  const us = state.turn;
  const them: Color = us === 'w' ? 'b' : 'w';

  // 1. Check
  if (isKingInCheck(state.board, us)) {
    const kingSq = findKing(state.board, us);
    threats.push({
      type: 'check',
      severity: 'critical',
      targetSquare: kingSq,
      pieceType: 'k',
      color: us,
      description: `Шах вашему королю на ${squareToAlgebraic(kingSq)}!`,
    });
  }

  // 2. Hanging Pieces (Pieces attacked by opponent with insufficient or no defense)
  for (let sq = 0; sq < 64; sq++) {
    const piece = state.board[sq];
    if (!piece || piece.type === 'k') continue;

    if (piece.color === us) {
      const isAttacked = isSquareAttacked(state.board, sq, them);
      if (isAttacked) {
        const isDefended = isSquareAttacked(state.board, sq, us);
        if (!isDefended) {
          threats.push({
            type: 'hanging',
            severity: 'critical',
            targetSquare: sq,
            pieceType: piece.type,
            color: us,
            description: `Фигура ${piece.type.toUpperCase()} на ${squareToAlgebraic(sq)} под боем и не защищена!`,
          });
        }
      }
    } else {
      // Opponent piece hanging
      const isAttackedByUs = isSquareAttacked(state.board, sq, us);
      const isDefendedByThem = isSquareAttacked(state.board, sq, them);
      if (isAttackedByUs && !isDefendedByThem) {
        threats.push({
          type: 'hanging',
          severity: 'info',
          targetSquare: sq,
          pieceType: piece.type,
          color: them,
          description: `У соперника висит фигура ${piece.type.toUpperCase()} на ${squareToAlgebraic(sq)}!`,
        });
      }
    }
  }

  return threats;
}

/**
 * Generates an intuitive grandmaster explanation for a recommended move
 */
export function explainMove(state: BoardState, move: Move): string {
  const piece = state.board[move.from];
  const targetPiece = state.board[move.to];
  const fromStr = squareToAlgebraic(move.from);
  const toStr = squareToAlgebraic(move.to);

  if (move.isCastling) {
    return 'Рокировка обеспечивает безопасность короля и вводит ладью в игру.';
  }

  if (targetPiece) {
    const targetVal = PIECE_VALUES[targetPiece.type].mg;
    const attackerVal = piece ? PIECE_VALUES[piece.type].mg : 100;
    if (targetVal > attackerVal) {
      return `Выгодный тактический выигрыш материала: взятие ${targetPiece.type.toUpperCase()} на ${toStr}!`;
    }
    return `Взятие фигуры соперника на ${toStr}.`;
  }

  if (piece?.type === 'p') {
    const rank = squareToRank(move.to);
    if ((piece.color === 'w' && rank === 1) || (piece.color === 'b' && rank === 6)) {
      return `Опасное продвижение пешки на предпоследнюю горизонталь ${toStr}.`;
    }
    const file = squareToFile(move.to);
    if ((file === 3 || file === 4) && (rank === 3 || rank === 4)) {
      return `Захват и укрепление центральной клетки ${toStr} пешкой.`;
    }
  }

  if (piece?.type === 'n') {
    const rank = squareToRank(move.to);
    const file = squareToFile(move.to);
    if (rank >= 2 && rank <= 5 && file >= 2 && file <= 5) {
      return `Активизация коня в центр на форпост ${toStr}.`;
    }
  }

  if (piece?.type === 'b') {
    return `Вывод слона на активную диагональ ${toStr}.`;
  }

  if (piece?.type === 'r') {
    const rank = squareToRank(move.to);
    if (rank === 1 || rank === 6) {
      return `Вторжение ладьи на 7-ю горизонталь ${toStr} для атаки тыла.`;
    }
    return `Занятие ладьей открытой или полуоткрытой линии ${toStr}.`;
  }

  if (piece?.type === 'q') {
    return `Перевод ферзя на активную атакующую позицию ${toStr}.`;
  }

  return `Оптимальный позиционный маневр ${fromStr}-${toStr}.`;
}
