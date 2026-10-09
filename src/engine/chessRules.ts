/**
 * Standard chess rules, move generator, and FEN utilities.
 */

import { BoardState, CastlingRights, Color, Move, Piece, PieceType } from '../types/chess';

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export function squareToFile(sq: number): number {
  return sq % 8;
}

export function squareToRank(sq: number): number {
  return Math.floor(sq / 8);
}

export function toSquare(rank: number, file: number): number {
  return rank * 8 + file;
}

export function squareToAlgebraic(sq: number): string {
  const file = String.fromCharCode('a'.charCodeAt(0) + squareToFile(sq));
  const rank = 8 - squareToRank(sq);
  return `${file}${rank}`;
}

export function algebraicToSquare(coord: string): number {
  if (coord.length < 2) return -1;
  const file = coord.charCodeAt(0) - 'a'.charCodeAt(0);
  const rank = 8 - parseInt(coord[1], 10);
  if (file < 0 || file > 7 || rank < 0 || rank > 7) return -1;
  return toSquare(rank, file);
}

export function cloneBoard(state: BoardState): BoardState {
  return {
    board: [...state.board],
    turn: state.turn,
    castling: { ...state.castling },
    enPassant: state.enPassant,
    halfmoveClock: state.halfmoveClock,
    fullmoveNumber: state.fullmoveNumber,
  };
}

export function parseFEN(fen: string): BoardState {
  const parts = fen.trim().split(/\s+/);
  const piecePlacement = parts[0] || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR';
  const turn = (parts[1] === 'b' ? 'b' : 'w') as Color;
  const castlingStr = parts[2] || '-';
  const enPassantStr = parts[3] || '-';
  const halfmove = parseInt(parts[4] || '0', 10);
  const fullmove = parseInt(parts[5] || '1', 10);

  const board: (Piece | null)[] = new Array(64).fill(null);
  const rows = piecePlacement.split('/');

  for (let r = 0; r < 8; r++) {
    const row = rows[r] || '';
    let file = 0;
    for (let i = 0; i < row.length; i++) {
      const char = row[i];
      if (char >= '1' && char <= '8') {
        file += parseInt(char, 10);
      } else {
        const isUpper = char === char.toUpperCase();
        const color: Color = isUpper ? 'w' : 'b';
        const type = char.toLowerCase() as PieceType;
        if (file < 8) {
          board[toSquare(r, file)] = { type, color };
        }
        file++;
      }
    }
  }

  const castling: CastlingRights = {
    wK: castlingStr.includes('K'),
    wQ: castlingStr.includes('Q'),
    bK: castlingStr.includes('k'),
    bQ: castlingStr.includes('q'),
  };

  const enPassant = enPassantStr === '-' ? null : algebraicToSquare(enPassantStr);

  return {
    board,
    turn,
    castling,
    enPassant: enPassant !== -1 ? enPassant : null,
    halfmoveClock: isNaN(halfmove) ? 0 : halfmove,
    fullmoveNumber: isNaN(fullmove) ? 1 : fullmove,
  };
}

export function toFEN(state: BoardState): string {
  let fen = '';
  for (let r = 0; r < 8; r++) {
    let empty = 0;
    for (let f = 0; f < 8; f++) {
      const piece = state.board[toSquare(r, f)];
      if (!piece) {
        empty++;
      } else {
        if (empty > 0) {
          fen += empty.toString();
          empty = 0;
        }
        const letter = piece.type === 'p' ? 'p' : piece.type;
        fen += piece.color === 'w' ? letter.toUpperCase() : letter.toLowerCase();
      }
    }
    if (empty > 0) {
      fen += empty.toString();
    }
    if (r < 7) {
      fen += '/';
    }
  }

  fen += ` ${state.turn}`;

  let castlingStr = '';
  if (state.castling.wK) castlingStr += 'K';
  if (state.castling.wQ) castlingStr += 'Q';
  if (state.castling.bK) castlingStr += 'k';
  if (state.castling.bQ) castlingStr += 'q';
  fen += ` ${castlingStr || '-'}`;

  fen += ` ${state.enPassant !== null ? squareToAlgebraic(state.enPassant) : '-'}`;
  fen += ` ${state.halfmoveClock} ${state.fullmoveNumber}`;

  return fen;
}

export function isSquareAttacked(board: (Piece | null)[], sq: number, byColor: Color): boolean {
  const sqRank = squareToRank(sq);
  const sqFile = squareToFile(sq);

  // 1. Pawn attacks
  if (byColor === 'w') {
    // White pawns attack from rank+1, file-1 and file+1
    const pRank = sqRank + 1;
    if (pRank <= 7) {
      if (sqFile > 0) {
        const p = board[toSquare(pRank, sqFile - 1)];
        if (p && p.color === 'w' && p.type === 'p') return true;
      }
      if (sqFile < 7) {
        const p = board[toSquare(pRank, sqFile + 1)];
        if (p && p.color === 'w' && p.type === 'p') return true;
      }
    }
  } else {
    // Black pawns attack from rank-1, file-1 and file+1
    const pRank = sqRank - 1;
    if (pRank >= 0) {
      if (sqFile > 0) {
        const p = board[toSquare(pRank, sqFile - 1)];
        if (p && p.color === 'b' && p.type === 'p') return true;
      }
      if (sqFile < 7) {
        const p = board[toSquare(pRank, sqFile + 1)];
        if (p && p.color === 'b' && p.type === 'p') return true;
      }
    }
  }

  // 2. Knight attacks
  const knightDeltas = [
    [-2, -1], [-2, 1], [-1, -2], [-1, 2],
    [1, -2], [1, 2], [2, -1], [2, 1],
  ];
  for (const [dr, df] of knightDeltas) {
    const r = sqRank + dr;
    const f = sqFile + df;
    if (r >= 0 && r < 8 && f >= 0 && f < 8) {
      const p = board[toSquare(r, f)];
      if (p && p.color === byColor && p.type === 'n') return true;
    }
  }

  // 3. King attacks (adjacent squares)
  for (let dr = -1; dr <= 1; dr++) {
    for (let df = -1; df <= 1; df++) {
      if (dr === 0 && df === 0) continue;
      const r = sqRank + dr;
      const f = sqFile + df;
      if (r >= 0 && r < 8 && f >= 0 && f < 8) {
        const p = board[toSquare(r, f)];
        if (p && p.color === byColor && p.type === 'k') return true;
      }
    }
  }

  // 4. Straight rays (Rook & Queen)
  const straightDirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  for (const [dr, df] of straightDirs) {
    let r = sqRank + dr;
    let f = sqFile + df;
    while (r >= 0 && r < 8 && f >= 0 && f < 8) {
      const p = board[toSquare(r, f)];
      if (p) {
        if (p.color === byColor && (p.type === 'r' || p.type === 'q')) {
          return true;
        }
        break; // blocked
      }
      r += dr;
      f += df;
    }
  }

  // 5. Diagonal rays (Bishop & Queen)
  const diagDirs = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  for (const [dr, df] of diagDirs) {
    let r = sqRank + dr;
    let f = sqFile + df;
    while (r >= 0 && r < 8 && f >= 0 && f < 8) {
      const p = board[toSquare(r, f)];
      if (p) {
        if (p.color === byColor && (p.type === 'b' || p.type === 'q')) {
          return true;
        }
        break; // blocked
      }
      r += dr;
      f += df;
    }
  }

  return false;
}

export function findKing(board: (Piece | null)[], color: Color): number {
  for (let i = 0; i < 64; i++) {
    const p = board[i];
    if (p && p.color === color && p.type === 'k') {
      return i;
    }
  }
  return -1;
}

export function isKingInCheck(board: (Piece | null)[], color: Color): boolean {
  const kingSq = findKing(board, color);
  if (kingSq === -1) return false;
  const oppColor: Color = color === 'w' ? 'b' : 'w';
  return isSquareAttacked(board, kingSq, oppColor);
}

export function generatePseudoLegalMoves(state: BoardState, onlyCaptures = false): Move[] {
  const moves: Move[] = [];
  const { board, turn, castling, enPassant } = state;
  const oppColor: Color = turn === 'w' ? 'b' : 'w';

  for (let sq = 0; sq < 64; sq++) {
    const piece = board[sq];
    if (!piece || piece.color !== turn) continue;

    const rank = squareToRank(sq);
    const file = squareToFile(sq);

    switch (piece.type) {
      case 'p': {
        const forward = turn === 'w' ? -1 : 1;
        const startRank = turn === 'w' ? 6 : 1;
        const promoRank = turn === 'w' ? 0 : 7;

        // 1. One step forward
        const nextRank = rank + forward;
        const oneStepSq = toSquare(nextRank, file);
        if (!onlyCaptures && nextRank >= 0 && nextRank < 8 && !board[oneStepSq]) {
          if (nextRank === promoRank) {
            const promos: PieceType[] = ['q', 'r', 'b', 'n'];
            for (const promo of promos) {
              moves.push({ from: sq, to: oneStepSq, piece: 'p', color: turn, promotion: promo });
            }
          } else {
            moves.push({ from: sq, to: oneStepSq, piece: 'p', color: turn });

            // 2. Two steps forward
            if (rank === startRank) {
              const twoStepSq = toSquare(rank + 2 * forward, file);
              if (!board[twoStepSq]) {
                moves.push({ from: sq, to: twoStepSq, piece: 'p', color: turn });
              }
            }
          }
        }

        // 3. Captures (left and right)
        for (const df of [-1, 1]) {
          const capFile = file + df;
          if (capFile >= 0 && capFile < 8) {
            const capSq = toSquare(nextRank, capFile);
            const target = board[capSq];
            if (target && target.color === oppColor) {
              if (nextRank === promoRank) {
                const promos: PieceType[] = ['q', 'r', 'b', 'n'];
                for (const promo of promos) {
                  moves.push({
                    from: sq,
                    to: capSq,
                    piece: 'p',
                    color: turn,
                    captured: target.type,
                    promotion: promo,
                  });
                }
              } else {
                moves.push({
                  from: sq,
                  to: capSq,
                  piece: 'p',
                  color: turn,
                  captured: target.type,
                });
              }
            } else if (enPassant !== null && capSq === enPassant) {
              // En passant capture
              moves.push({
                from: sq,
                to: capSq,
                piece: 'p',
                color: turn,
                captured: 'p',
                isEnPassant: true,
              });
            }
          }
        }
        break;
      }

      case 'n': {
        const knightDeltas = [
          [-2, -1], [-2, 1], [-1, -2], [-1, 2],
          [1, -2], [1, 2], [2, -1], [2, 1],
        ];
        for (const [dr, df] of knightDeltas) {
          const r = rank + dr;
          const f = file + df;
          if (r >= 0 && r < 8 && f >= 0 && f < 8) {
            const toSq = toSquare(r, f);
            const target = board[toSq];
            if (!target) {
              if (!onlyCaptures) {
                moves.push({ from: sq, to: toSq, piece: 'n', color: turn });
              }
            } else if (target.color === oppColor) {
              moves.push({ from: sq, to: toSq, piece: 'n', color: turn, captured: target.type });
            }
          }
        }
        break;
      }

      case 'b':
      case 'r':
      case 'q': {
        const dirs: [number, number][] = [];
        if (piece.type === 'b' || piece.type === 'q') {
          dirs.push([-1, -1], [-1, 1], [1, -1], [1, 1]);
        }
        if (piece.type === 'r' || piece.type === 'q') {
          dirs.push([-1, 0], [1, 0], [0, -1], [0, 1]);
        }
        for (const [dr, df] of dirs) {
          let r = rank + dr;
          let f = file + df;
          while (r >= 0 && r < 8 && f >= 0 && f < 8) {
            const toSq = toSquare(r, f);
            const target = board[toSq];
            if (!target) {
              if (!onlyCaptures) {
                moves.push({ from: sq, to: toSq, piece: piece.type, color: turn });
              }
            } else {
              if (target.color === oppColor) {
                moves.push({ from: sq, to: toSq, piece: piece.type, color: turn, captured: target.type });
              }
              break;
            }
            r += dr;
            f += df;
          }
        }
        break;
      }

      case 'k': {
        // Standard moves
        for (let dr = -1; dr <= 1; dr++) {
          for (let df = -1; df <= 1; df++) {
            if (dr === 0 && df === 0) continue;
            const r = rank + dr;
            const f = file + df;
            if (r >= 0 && r < 8 && f >= 0 && f < 8) {
              const toSq = toSquare(r, f);
              const target = board[toSq];
              if (!target) {
                if (!onlyCaptures) {
                  moves.push({ from: sq, to: toSq, piece: 'k', color: turn });
                }
              } else if (target.color === oppColor) {
                moves.push({ from: sq, to: toSq, piece: 'k', color: turn, captured: target.type });
              }
            }
          }
        }

        // Castling (never in quiescence / onlyCaptures)
        if (!onlyCaptures) {
          if (turn === 'w' && sq === 60) {
            // White O-O
            if (
              castling.wK &&
              !board[61] &&
              !board[62] &&
              board[63]?.type === 'r' &&
              board[63]?.color === 'w' &&
              !isSquareAttacked(board, 60, 'b') &&
              !isSquareAttacked(board, 61, 'b') &&
              !isSquareAttacked(board, 62, 'b')
            ) {
              moves.push({ from: 60, to: 62, piece: 'k', color: 'w', isCastling: true });
            }
            // White O-O-O
            if (
              castling.wQ &&
              !board[59] &&
              !board[58] &&
              !board[57] &&
              board[56]?.type === 'r' &&
              board[56]?.color === 'w' &&
              !isSquareAttacked(board, 60, 'b') &&
              !isSquareAttacked(board, 59, 'b') &&
              !isSquareAttacked(board, 58, 'b')
            ) {
              moves.push({ from: 60, to: 58, piece: 'k', color: 'w', isCastling: true });
            }
          } else if (turn === 'b' && sq === 4) {
            // Black O-O
            if (
              castling.bK &&
              !board[5] &&
              !board[6] &&
              board[7]?.type === 'r' &&
              board[7]?.color === 'b' &&
              !isSquareAttacked(board, 4, 'w') &&
              !isSquareAttacked(board, 5, 'w') &&
              !isSquareAttacked(board, 6, 'w')
            ) {
              moves.push({ from: 4, to: 6, piece: 'k', color: 'b', isCastling: true });
            }
            // Black O-O-O
            if (
              castling.bQ &&
              !board[3] &&
              !board[2] &&
              !board[1] &&
              board[0]?.type === 'r' &&
              board[0]?.color === 'b' &&
              !isSquareAttacked(board, 4, 'w') &&
              !isSquareAttacked(board, 3, 'w') &&
              !isSquareAttacked(board, 2, 'w')
            ) {
              moves.push({ from: 4, to: 2, piece: 'k', color: 'b', isCastling: true });
            }
          }
        }
        break;
      }
    }
  }

  return moves;
}

export function makeMove(state: BoardState, move: Move): BoardState {
  const next = cloneBoard(state);
  const { from, to, piece, color, promotion, isCastling, isEnPassant } = move;

  // Determine authentic moving piece type from actual square on board
  const pieceOnBoard = state.board[from];
  const actualPieceType: PieceType = promotion || pieceOnBoard?.type || piece;

  // Move piece
  next.board[from] = null;
  next.board[to] = { type: actualPieceType, color };

  // Handle en passant capture
  if (isEnPassant) {
    const capSq = color === 'w' ? to + 8 : to - 8;
    next.board[capSq] = null;
  }

  // Handle castling rook movement
  if (isCastling) {
    if (to === 62) {
      // White Kingside
      next.board[63] = null;
      next.board[61] = { type: 'r', color: 'w' };
    } else if (to === 58) {
      // White Queenside
      next.board[56] = null;
      next.board[59] = { type: 'r', color: 'w' };
    } else if (to === 6) {
      // Black Kingside
      next.board[7] = null;
      next.board[5] = { type: 'r', color: 'b' };
    } else if (to === 2) {
      // Black Queenside
      next.board[0] = null;
      next.board[3] = { type: 'r', color: 'b' };
    }
  }

  // Update castling rights if King moves
  if (piece === 'k') {
    if (color === 'w') {
      next.castling.wK = false;
      next.castling.wQ = false;
    } else {
      next.castling.bK = false;
      next.castling.bQ = false;
    }
  }

  // Update castling rights if Rook moves
  if (piece === 'r') {
    if (from === 63) next.castling.wK = false;
    if (from === 56) next.castling.wQ = false;
    if (from === 7) next.castling.bK = false;
    if (from === 0) next.castling.bQ = false;
  }

  // Update castling rights if Rook is captured
  if (to === 63) next.castling.wK = false;
  if (to === 56) next.castling.wQ = false;
  if (to === 7) next.castling.bK = false;
  if (to === 0) next.castling.bQ = false;

  // Set en passant target square if pawn moved 2 squares
  if (piece === 'p' && Math.abs(to - from) === 16) {
    next.enPassant = color === 'w' ? from - 8 : from + 8;
  } else {
    next.enPassant = null;
  }

  // Halfmove clock: reset on pawn move or capture
  if (piece === 'p' || move.captured) {
    next.halfmoveClock = 0;
  } else {
    next.halfmoveClock++;
  }

  // Turn and fullmove
  if (color === 'b') {
    next.fullmoveNumber++;
  }
  next.turn = color === 'w' ? 'b' : 'w';

  return next;
}

export function generateLegalMoves(state: BoardState, generateSan = true): Move[] {
  const pseudoMoves = generatePseudoLegalMoves(state);
  const legalMoves: Move[] = [];

  for (const move of pseudoMoves) {
    const nextState = makeMove(state, move);
    // King must not be in check after own move
    if (!isKingInCheck(nextState.board, state.turn)) {
      if (generateSan) {
        move.san = moveToSAN(state, move);
      }
      legalMoves.push(move);
    }
  }

  return legalMoves;
}

export function generateLegalCaptures(state: BoardState): Move[] {
  const pseudoCaptures = generatePseudoLegalMoves(state, true);
  const legalCaptures: Move[] = [];

  for (const move of pseudoCaptures) {
    const nextState = makeMove(state, move);
    if (!isKingInCheck(nextState.board, state.turn)) {
      legalCaptures.push(move);
    }
  }

  return legalCaptures;
}

export function moveToSAN(state: BoardState, move: Move): string {
  if (move.isCastling) {
    return move.to === 62 || move.to === 6 ? 'O-O' : 'O-O-O';
  }

  const piece = move.piece;
  const isCapture = !!move.captured || !!move.isEnPassant;
  const dest = squareToAlgebraic(move.to);

  let san = '';

  if (piece === 'p') {
    if (isCapture) {
      san += squareToAlgebraic(move.from)[0] + 'x' + dest;
    } else {
      san += dest;
    }
    if (move.promotion) {
      san += '=' + move.promotion.toUpperCase();
    }
  } else {
    san += piece.toUpperCase();

    // Disambiguation
    const pseudo = generatePseudoLegalMoves(state).filter(
      (m) =>
        m.piece === piece &&
        m.to === move.to &&
        m.from !== move.from &&
        !isKingInCheck(makeMove(state, m).board, state.turn)
    );

    if (pseudo.length > 0) {
      const fromAlg = squareToAlgebraic(move.from);
      const sameFile = pseudo.some((m) => squareToFile(m.from) === squareToFile(move.from));
      const sameRank = pseudo.some((m) => squareToRank(m.from) === squareToRank(move.from));

      if (!sameFile) {
        san += fromAlg[0]; // file disambiguation
      } else if (!sameRank) {
        san += fromAlg[1]; // rank disambiguation
      } else {
        san += fromAlg; // both file and rank
      }
    }

    if (isCapture) {
      san += 'x';
    }
    san += dest;
  }

  // Check or checkmate
  const nextState = makeMove(state, move);
  const oppColor = state.turn === 'w' ? 'b' : 'w';
  if (isKingInCheck(nextState.board, oppColor)) {
    // Check if checkmate (without re-generating SAN recursively)
    const oppMoves = generateLegalMoves(nextState, false);
    if (oppMoves.length === 0) {
      san += '#';
    } else {
      san += '+';
    }
  }

  return san;
}

export function hasInsufficientMaterial(board: (Piece | null)[]): boolean {
  const pieces = board.filter((p): p is Piece => p !== null);
  if (pieces.length === 2) {
    // King vs King
    return true;
  }
  if (pieces.length === 3) {
    // King & Bishop vs King or King & Knight vs King
    const nonKing = pieces.find((p) => p.type !== 'k');
    if (nonKing && (nonKing.type === 'b' || nonKing.type === 'n')) {
      return true;
    }
  }
  if (pieces.length === 4) {
    // King & Bishop vs King & Bishop of same color squares
    const bishops = pieces.filter((p) => p.type === 'b');
    if (bishops.length === 2 && pieces.every((p) => p.type === 'k' || p.type === 'b')) {
      const bSq1 = board.findIndex((p) => p?.type === 'b' && p.color === 'w');
      const bSq2 = board.findIndex((p) => p?.type === 'b' && p.color === 'b');
      if (bSq1 !== -1 && bSq2 !== -1) {
        const isWhiteSquare1 = (squareToRank(bSq1) + squareToFile(bSq1)) % 2 === 0;
        const isWhiteSquare2 = (squareToRank(bSq2) + squareToFile(bSq2)) % 2 === 0;
        if (isWhiteSquare1 === isWhiteSquare2) return true;
      }
    }
  }
  return false;
}

/**
 * Returns a canonical key for threefold repetition:
 * includes piece positions, active turn, castling rights, and valid en passant target.
 */
export function getPositionKey(state: BoardState): string {
  // 1. Board placement
  let placement = '';
  for (let r = 0; r < 8; r++) {
    let empty = 0;
    for (let f = 0; f < 8; f++) {
      const piece = state.board[toSquare(r, f)];
      if (!piece) {
        empty++;
      } else {
        if (empty > 0) {
          placement += empty.toString();
          empty = 0;
        }
        placement += piece.color === 'w' ? piece.type.toUpperCase() : piece.type.toLowerCase();
      }
    }
    if (empty > 0) placement += empty.toString();
    if (r < 7) placement += '/';
  }

  // 2. Castling rights
  let castlingStr = '';
  if (state.castling.wK) castlingStr += 'K';
  if (state.castling.wQ) castlingStr += 'Q';
  if (state.castling.bK) castlingStr += 'k';
  if (state.castling.bQ) castlingStr += 'q';

  // 3. En passant target square (only if an opposing pawn can actually capture it!)
  let epStr = '-';
  if (state.enPassant !== null) {
    const epSq = state.enPassant;
    const epRank = squareToRank(epSq);
    const epFile = squareToFile(epSq);
    const attackerColor: Color = state.turn;
    const pawnRank = attackerColor === 'w' ? epRank + 1 : epRank - 1;
    let canCapture = false;
    if (epFile > 0) {
      const p = state.board[toSquare(pawnRank, epFile - 1)];
      if (p && p.color === attackerColor && p.type === 'p') canCapture = true;
    }
    if (epFile < 7) {
      const p = state.board[toSquare(pawnRank, epFile + 1)];
      if (p && p.color === attackerColor && p.type === 'p') canCapture = true;
    }
    if (canCapture) {
      epStr = squareToAlgebraic(epSq);
    }
  }

  return `${placement} ${state.turn} ${castlingStr || '-'} ${epStr}`;
}
