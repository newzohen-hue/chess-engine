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

export interface PositionComponent {
  white: number;
  black: number;
  diff: number; // white - black
}

export interface PositionBreakdown {
  total: number; // In centipawns from White's perspective (+ = White advantage)
  nnueScore: number; // Stockfish NNUE neural network evaluation (+ = White advantage)
  gamePhase: number; // 0 = Endgame, 1 = Midgame/Opening
  material: PositionComponent;
  pst: PositionComponent; // Positional piece activity
  pawns: PositionComponent; // Pawn structure
  kingSafety: PositionComponent; // King safety
  activity: PositionComponent; // Piece mobility and coordination
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
  | 'draw-insufficient-material';

export type GameMode =
  | 'player-vs-engine-white'
  | 'player-vs-engine-black'
  | 'two-player-analysis'
  | 'engine-vs-engine';

export type EngineSkillLevel = 'beginner' | 'intermediate' | 'club' | 'master';

export interface SkillConfig {
  name: string;
  nameRu: string;
  elo: number;
  depth: number;
  timeMs: number;
  useBook: boolean;
  useQuiescence: boolean;
  description: string;
}

export const SKILL_CONFIGS: Record<EngineSkillLevel, SkillConfig> = {
  beginner: {
    name: 'Beginner',
    nameRu: 'Новичок (~1100 ELO)',
    elo: 1100,
    depth: 3,
    timeMs: 400,
    useBook: false,
    useQuiescence: true,
    description: 'Лёгкий уровень: базовый расчёт на 3 полухода с проверкой взятий.',
  },
  intermediate: {
    name: 'Casual Player',
    nameRu: 'Любитель (~1500 ELO)',
    elo: 1500,
    depth: 5,
    timeMs: 700,
    useBook: true,
    useQuiescence: true,
    description: 'Уверенная тактическая игра, базовые дебюты и форсированные взятия.',
  },
  club: {
    name: 'Club Player',
    nameRu: 'Клубный (~1900 ELO)',
    elo: 1900,
    depth: 7,
    timeMs: 1400,
    useBook: true,
    useQuiescence: true,
    description: 'Сильная позиционная игра, классическая дебютная теория и поиск на 7 полуходов.',
  },
  master: {
    name: 'Grandmaster',
    nameRu: 'Гроссмейстер (2400+ ELO)',
    elo: 2400,
    depth: 9,
    timeMs: 2200,
    useBook: true,
    useQuiescence: true,
    description: 'Максимальная глубина (9+), глубокий перебор вариантов, нейросетевая оценка NNUE и GM-книга.',
  },
};
