import React, { useState } from 'react';
import { BoardState, Color, Move, Piece, PieceType } from '../types/chess';
import {
  findKing,
  generateLegalMoves,
  isKingInCheck,
  squareToFile,
  squareToRank,
  toSquare,
} from '../engine/chessRules';
import { ChessPieceIcon } from './ChessPieces';

interface ChessboardProps {
  state: BoardState;
  orientation: Color;
  lastMove: Move | null;
  bestMove: Move | null;
  hintMove?: Move | null;
  threatSquares?: number[];
  isEngineThinking: boolean;
  onMove: (move: Move) => void;
  disabled?: boolean;
}

interface PendingPromotion {
  from: number;
  to: number;
  color: Color;
  captured?: PieceType;
}

export const Chessboard: React.FC<ChessboardProps> = ({
  state,
  orientation,
  lastMove,
  bestMove,
  hintMove,
  threatSquares = [],
  isEngineThinking,
  onMove,
  disabled = false,
}) => {
  const [selectedSquare, setSelectedSquare] = useState<number | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<PendingPromotion | null>(null);

  // All legal moves from current state
  const legalMoves = React.useMemo(() => {
    return generateLegalMoves(state);
  }, [state]);

  // Legal moves for selected piece
  const selectedSquareMoves = React.useMemo(() => {
    if (selectedSquare === null) return [];
    return legalMoves.filter((m) => m.from === selectedSquare);
  }, [legalMoves, selectedSquare]);

  const inCheck = isKingInCheck(state.board, state.turn);
  const kingInCheckSq = inCheck ? findKing(state.board, state.turn) : -1;

  // Coordinate mapping for orientation
  const getSquareIndex = (row: number, col: number): number => {
    return orientation === 'w' ? toSquare(row, col) : toSquare(7 - row, 7 - col);
  };

  const handleSquareClick = (sq: number) => {
    if (disabled || isEngineThinking) return;

    const clickedPiece = state.board[sq];

    // If already selected, check if clicked square is a legal destination
    if (selectedSquare !== null) {
      const matchMove = selectedSquareMoves.find((m) => m.to === sq);

      if (matchMove) {
        // Check for promotion
        const piece = state.board[selectedSquare];
        const isPromoRank =
          piece?.type === 'p' &&
          ((piece.color === 'w' && squareToRank(sq) === 0) ||
            (piece.color === 'b' && squareToRank(sq) === 7));

        if (isPromoRank) {
          setPendingPromotion({
            from: selectedSquare,
            to: sq,
            color: piece.color,
            captured: clickedPiece?.type,
          });
          setSelectedSquare(null);
          return;
        }

        onMove(matchMove);
        setSelectedSquare(null);
        return;
      }

      // If clicked own piece again, reselect
      if (clickedPiece && clickedPiece.color === state.turn) {
        setSelectedSquare(sq);
        return;
      }

      // Clicked invalid destination: deselect
      setSelectedSquare(null);
      return;
    }

    // Select piece if it's player's turn piece
    if (clickedPiece && clickedPiece.color === state.turn) {
      setSelectedSquare(sq);
    }
  };

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, sq: number) => {
    if (disabled || isEngineThinking) {
      e.preventDefault();
      return;
    }
    const piece = state.board[sq];
    if (!piece || piece.color !== state.turn) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData('text/plain', sq.toString());
    e.dataTransfer.effectAllowed = 'move';
    setSelectedSquare(sq);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, targetSq: number) => {
    e.preventDefault();
    const sourceSqStr = e.dataTransfer.getData('text/plain');
    if (!sourceSqStr) return;
    const sourceSq = parseInt(sourceSqStr, 10);
    if (isNaN(sourceSq)) return;

    const matchMove = legalMoves.find((m) => m.from === sourceSq && m.to === targetSq);
    if (matchMove) {
      const piece = state.board[sourceSq];
      const isPromoRank =
        piece?.type === 'p' &&
        ((piece.color === 'w' && squareToRank(targetSq) === 0) ||
          (piece.color === 'b' && squareToRank(targetSq) === 7));

      if (isPromoRank) {
        setPendingPromotion({
          from: sourceSq,
          to: targetSq,
          color: piece.color,
          captured: state.board[targetSq]?.type,
        });
        setSelectedSquare(null);
        return;
      }

      onMove(matchMove);
      setSelectedSquare(null);
    }
  };

  const executePromotion = (promo: PieceType) => {
    if (!pendingPromotion) return;
    const matchMove = legalMoves.find(
      (m) =>
        m.from === pendingPromotion.from &&
        m.to === pendingPromotion.to &&
        m.promotion === promo
    );
    if (matchMove) {
      onMove(matchMove);
    }
    setPendingPromotion(null);
  };

  // Calculate coordinates for Best Move Arrow
  const getSquareCenterPercent = (sq: number) => {
    const rank = squareToRank(sq);
    const file = squareToFile(sq);
    const col = orientation === 'w' ? file : 7 - file;
    const row = orientation === 'w' ? rank : 7 - rank;
    return {
      x: (col + 0.5) * 12.5,
      y: (row + 0.5) * 12.5,
    };
  };

  return (
    <div className="relative w-full max-w-[620px] aspect-square rounded-xl overflow-hidden shadow-2xl border-4 border-slate-800 bg-slate-900 select-none">
      {/* 8x8 Board Grid */}
      <div className="grid grid-cols-8 grid-rows-8 w-full h-full">
        {Array.from({ length: 64 }).map((_, idx) => {
          const row = Math.floor(idx / 8);
          const col = idx % 8;
          const sq = getSquareIndex(row, col);
          const piece = state.board[sq];

          const isDark = (row + col) % 2 === 1;
          const isSelected = selectedSquare === sq;
          const isLastMove = lastMove && (lastMove.from === sq || lastMove.to === sq);
          const isCheck = kingInCheckSq === sq;

          // Legal move marker
          const legalTarget = selectedSquareMoves.find((m) => m.to === sq);
          const isCaptureTarget = legalTarget && (state.board[sq] || legalTarget.isEnPassant);

          // Square rank and file labels
          const showFileLabel = row === 7;
          const showRankLabel = col === 0;
          const fileLetter = String.fromCharCode(
            'a'.charCodeAt(0) + (orientation === 'w' ? col : 7 - col)
          );
          const rankNumber = orientation === 'w' ? 8 - row : row + 1;

          // Background color computation
          let bgClass = isDark ? 'bg-[#739552]' : 'bg-[#EBECD0]';
          if (isLastMove) {
            bgClass = isDark ? 'bg-[#BBCB44]' : 'bg-[#F5F682]';
          }
          if (isSelected) {
            bgClass = isDark ? 'bg-[#22C55E]/80 ring-inset ring-2 ring-emerald-300' : 'bg-[#86EFAC] ring-inset ring-2 ring-emerald-500';
          }

          return (
            <div
              key={sq}
              id={`square-${sq}`}
              className={`relative flex items-center justify-center transition-colors duration-100 ${bgClass}`}
              onClick={() => handleSquareClick(sq)}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, sq)}
            >
              {/* Check Crimson Glow */}
              {isCheck && (
                <div className="absolute inset-0 bg-red-600/60 rounded-full animate-pulse blur-[2px]" />
              )}

              {/* Tactical Threat Warning Glow */}
              {threatSquares.includes(sq) && !isCheck && (
                <div className="absolute inset-0 bg-rose-500/20 ring-2 ring-inset ring-rose-500/80 pointer-events-none animate-pulse z-5" />
              )}

              {/* Coordinate Labels */}
              {showRankLabel && (
                <span
                  className={`absolute top-0.5 left-1 text-[10px] sm:text-xs font-semibold leading-none pointer-events-none ${
                    isDark ? 'text-[#EBECD0]/90' : 'text-[#739552]'
                  }`}
                >
                  {rankNumber}
                </span>
              )}
              {showFileLabel && (
                <span
                  className={`absolute bottom-0.5 right-1 text-[10px] sm:text-xs font-semibold leading-none pointer-events-none ${
                    isDark ? 'text-[#EBECD0]/90' : 'text-[#739552]'
                  }`}
                >
                  {fileLetter}
                </span>
              )}

              {/* Piece SVG */}
              {piece && (
                <div
                  draggable={!disabled && !isEngineThinking && piece.color === state.turn}
                  onDragStart={(e) => handleDragStart(e, sq)}
                  className={`w-[84%] h-[84%] cursor-grab active:cursor-grabbing transition-transform ${
                    isSelected ? 'scale-105 drop-shadow-lg' : 'hover:scale-102'
                  }`}
                >
                  <ChessPieceIcon type={piece.type} color={piece.color} />
                </div>
              )}

              {/* Legal Move Indicators */}
              {legalTarget && !isCaptureTarget && (
                <div className="absolute w-3.5 h-3.5 sm:w-4 sm:h-4 bg-slate-900/30 rounded-full pointer-events-none shadow-sm" />
              )}
              {isCaptureTarget && (
                <div className="absolute inset-1 border-4 border-slate-900/25 rounded-full pointer-events-none" />
              )}
            </div>
          );
        })}
      </div>

      {/* SVG Best Move & Hint Arrows Overlay */}
      {(bestMove || hintMove) && (
        <svg className="absolute inset-0 w-full h-full pointer-events-none z-10">
          <defs>
            <marker
              id="engine-arrowhead"
              markerWidth="6"
              markerHeight="6"
              refX="4"
              refY="3"
              orient="auto"
            >
              <polygon points="0 0, 6 3, 0 6" fill="#3B82F6" opacity="0.85" />
            </marker>
            <marker
              id="hint-arrowhead"
              markerWidth="6"
              markerHeight="6"
              refX="4"
              refY="3"
              orient="auto"
            >
              <polygon points="0 0, 6 3, 0 6" fill="#10B981" opacity="0.9" />
            </marker>
          </defs>

          {/* Hint Move Arrow (Emerald) */}
          {hintMove && (() => {
            const start = getSquareCenterPercent(hintMove.from);
            const end = getSquareCenterPercent(hintMove.to);
            return (
              <line
                x1={`${start.x}%`}
                y1={`${start.y}%`}
                x2={`${end.x}%`}
                y2={`${end.y}%`}
                stroke="#10B981"
                strokeWidth="7"
                strokeLinecap="round"
                opacity="0.9"
                markerEnd="url(#hint-arrowhead)"
              />
            );
          })()}

          {/* Engine Best Move Arrow (Blue) */}
          {bestMove && !hintMove && (() => {
            const start = getSquareCenterPercent(bestMove.from);
            const end = getSquareCenterPercent(bestMove.to);
            return (
              <line
                x1={`${start.x}%`}
                y1={`${start.y}%`}
                x2={`${end.x}%`}
                y2={`${end.y}%`}
                stroke="#3B82F6"
                strokeWidth="7"
                strokeLinecap="round"
                opacity="0.85"
                markerEnd="url(#engine-arrowhead)"
              />
            );
          })()}
        </svg>
      )}

      {/* Promotion Choice Modal */}
      {pendingPromotion && (
        <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center z-20">
          <div className="bg-slate-900 border border-slate-700 p-4 rounded-xl shadow-2xl flex flex-col items-center gap-3">
            <span className="text-sm font-medium text-slate-200">Выберите фигуру для превращения:</span>
            <div className="flex gap-2">
              {(['q', 'r', 'b', 'n'] as PieceType[]).map((promo) => (
                <button
                  key={promo}
                  onClick={() => executePromotion(promo)}
                  className="w-14 h-14 p-2 bg-slate-800 hover:bg-emerald-600/40 rounded-lg border border-slate-600 transition-all hover:scale-105 cursor-pointer"
                  title={`Превратить в ${promo}`}
                >
                  <ChessPieceIcon type={promo} color={pendingPromotion.color} />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
