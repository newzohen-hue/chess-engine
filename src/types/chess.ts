/**
 * Standard chess types and interfaces for board, moves, and engine
 */

export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
export type Color = 'w' | 'b';

export interface Piece {
  type: PieceType;
  color: Color;
}

export interface CastlingRights {
  wK: boolean; // White kingside (O-O)
  wQ: boolean; // White queenside (O-O-O)
  bK: boolean; // Black kingside (O-O)
  bQ: boolean; // Black queenside (O-O-O)
}

export type MoveClassification = 'brilliant' | 'best' | 'good' | 'inaccuracy' | 'mistake' | 'blunder';

export interface Move {
  from: number; // 0 to 63
  to: number;   // 0 to 63
  piece: PieceType;
  color: Color;
  captured?: PieceType;
  promotion?: PieceType;
  isCastling?: boolean;
  isEnPassant?: boolean;
  san?: string;
  evalAfter?: number; // Score from White perspective after move
  classification?: MoveClassification;
}

export interface BoardState {
  board: (Piece | null)[]; // 64 squares (0 = a8, 7 = h8, 56 = a1, 63 = h1)
  turn: Color;
  castling: CastlingRights;
  enPassant: number | null; // target square index or null
  halfmoveClock: number;    // for 50-move rule
  fullmoveNumber: number;
}

export interface PreMove {
  from: number;
  to: number;
  piece: PieceType;
  color: Color;
  promotion?: PieceType;
}

export interface PositionBreakdown {
  total: number; // In centipawns from White's perspective (+ = White advantage)
  nnueScore: number; // Stockfish NNUE neural network evaluation (+ = White advantage)
  gamePhase: number; // 0 = Endgame, 1 = Midgame/Opening
  evalPerspective: 'w' | 'b'; // Side to move
  whitePieces: Record<PieceType, number>;
  blackPieces: Record<PieceType, number>;
  materialBalance: number; // Material delta in pawns (+ = White advantage)
  winProbabilityWhite: number; // Percentage 0 - 100
}

export interface SearchStats {
  depth: number;
  selDepth: number;
  nodes: number;
  timeMs: number;
  nps: number;
  score: number; // centipawns or mate value from White's perspective
  nnueScore?: number; // Stockfish NNUE raw neural network evaluation
  isMate?: boolean;
  mateIn?: number;
  bestMove: Move | null;
  pv: Move[];
  pvSan: string[];
  ttHits?: number;
  isBookMove?: boolean;
  opening?: { eco: string; name: string; nameRu: string };
  hintExplanation?: string;
}

export type GameStatus =
  | 'ongoing'
  | 'check'
  | 'checkmate'
  | 'stalemate'
  | 'draw-fifty-move'
  | 'draw-threefold'
  | 'draw-insufficient-material'
  | 'timeout-white'
  | 'timeout-black';

export type GameMode =
  | 'player-vs-engine-white'
  | 'player-vs-engine-black'
  | 'two-player-analysis'
  | 'engine-vs-engine';

