/**
 * Grandmaster Chess Opening Book with ECO Classification and Master Move Trees.
 * Provides instant, master-level opening play for both White and Black.
 */

import { BoardState, Color, Move, PieceType } from '../types/chess';
import { algebraicToSquare, generateLegalMoves, squareToAlgebraic, toFEN } from './chessRules';

export interface BookEntry {
  eco: string;
  name: string;
  nameRu: string;
  moves: string[]; // UCI strings, e.g. ["e2e4", "e7e5", "g1f3", "b8c6"]
}

export const OPENING_BOOK: BookEntry[] = [
  // === 1. e4 Open Games (1. e4 e5) ===
  {
    eco: 'C65',
    name: 'Ruy Lopez: Berlin Defence',
    nameRu: 'Испанская партия: Берлинская защита',
    moves: ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5', 'g8f6', 'e1g1', 'f6e4', 'd2d4', 'e4d6', 'b5c6', 'd7c6', 'd4e5', 'd6f5'],
  },
  {
    eco: 'C78',
    name: 'Ruy Lopez: Morphy Defence, Archangelsk',
    nameRu: 'Испанская партия: Защита Морфи',
    moves: ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5', 'a7a6', 'b5a4', 'g8f6', 'e1g1', 'b7b5', 'a4b3', 'f8c5', 'c2c3', 'd7d6'],
  },
  {
    eco: 'C50',
    name: 'Giuoco Piano (Italian Game)',
    nameRu: 'Итальянская партия',
    moves: ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'f8c5', 'c2c3', 'g8f6', 'd2d3', 'd7d6', 'e1g1', 'a7a6', 'a2a4', 'h7h6'],
  },
  {
    eco: 'C55',
    name: 'Two Knights Defence',
    nameRu: 'Защита двух коней',
    moves: ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'g8f6', 'd2d3', 'f8e7', 'e1g1', 'e8g8', 'f1e1', 'd7d6'],
  },
  {
    eco: 'C45',
    name: 'Scotch Game',
    nameRu: 'Шотландская партия',
    moves: ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'd2d4', 'e5d4', 'f3d4', 'g8f6', 'b1c3', 'f8b4', 'd4c6', 'b7c6', 'f1d3', 'd7d5'],
  },
  {
    eco: 'C42',
    name: 'Petroff Defence',
    nameRu: 'Русская партия (Защита Петроff)',
    moves: ['e2e4', 'e7e5', 'g1f3', 'g8f6', 'f3e5', 'd7d6', 'e5f3', 'f6e4', 'd2d4', 'd6d5', 'f1d3', 'f8d6', 'e1g1', 'e8g8'],
  },
  {
    eco: 'C28',
    name: 'Vienna Game',
    nameRu: 'Венская партия',
    moves: ['e2e4', 'e7e5', 'b1c3', 'g8f6', 'f1c4', 'b8c6', 'd2d3', 'f8c5', 'f2f4', 'd7d6', 'g1f3'],
  },
  {
    eco: 'C30',
    name: "King's Gambit",
    nameRu: 'Королевский гамбит',
    moves: ['e2e4', 'e7e5', 'f2f4', 'e5f4', 'g1f3', 'g7g5', 'h2h4', 'g5g4', 'f3e5', 'g8f6', 'd2d4', 'd7d6'],
  },

  // === 1. e4 Semi-Open Games (Sicilian, French, Caro-Kann, etc.) ===
  {
    eco: 'B90',
    name: 'Sicilian: Najdorf Variation',
    nameRu: 'Сицилианская защита: Вариант Найдорфа',
    moves: ['e2e4', 'c7c5', 'g1f3', 'd7d6', 'd2d4', 'c5d4', 'f3d4', 'g8f6', 'b1c3', 'a7a6', 'c1e3', 'e7e5', 'd4b3', 'c8e6', 'f2f3', 'f8e7'],
  },
  {
    eco: 'B70',
    name: 'Sicilian: Dragon Variation',
    nameRu: 'Сицилианская защита: Вариант Дракона',
    moves: ['e2e4', 'c7c5', 'g1f3', 'd7d6', 'd2d4', 'c5d4', 'f3d4', 'g8f6', 'b1c3', 'g7g6', 'c1e3', 'f8g7', 'f2f3', 'e8g8', 'd1d2', 'b8c6'],
  },
  {
    eco: 'B33',
    name: 'Sicilian: Sveshnikov Variation',
    nameRu: 'Сицилианская защита: Вариант Свешникова',
    moves: ['e2e4', 'c7c5', 'g1f3', 'b8c6', 'd2d4', 'c5d4', 'f3d4', 'g8f6', 'b1c3', 'e7e5', 'd4b5', 'd7d6', 'c1g5', 'a7a6', 'b5a3', 'b7b5'],
  },
  {
    eco: 'B22',
    name: 'Sicilian: Alapin Variation',
    nameRu: 'Сицилианская защита: Вариант Алапина',
    moves: ['e2e4', 'c7c5', 'c2c3', 'g8f6', 'e4e5', 'f6d5', 'd2d4', 'c5d4', 'g1f3', 'b8c6', 'f1c4', 'd5b6', 'c4b3', 'd7d5'],
  },
  {
    eco: 'C01',
    name: 'French Defence: Exchange Variation',
    nameRu: 'Французская защита: Разменный вариант',
    moves: ['e2e4', 'e7e6', 'd2d4', 'd7d5', 'e4d5', 'e6d5', 'g1f3', 'g8f6', 'f1d3', 'f8d6', 'e1g1', 'e8g8', 'c1g5', 'c8g4'],
  },
  {
    eco: 'C03',
    name: 'French Defence: Tarrasch Variation',
    nameRu: 'Французская защита: Вариант Тарраша',
    moves: ['e2e4', 'e7e6', 'd2d4', 'd7d5', 'b1d2', 'g8f6', 'e4e5', 'f6d7', 'f1d3', 'c7c5', 'c2c3', 'b8c6', 'g1e2', 'c5d4'],
  },
  {
    eco: 'C11',
    name: 'French Defence: Classical',
    nameRu: 'Французская защита: Классическая система',
    moves: ['e2e4', 'e7e6', 'd2d4', 'd7d5', 'b1c3', 'g8f6', 'c1g5', 'f8e7', 'e4e5', 'f6d7', 'g5e7', 'd8e7', 'f2f4', 'e8g8'],
  },
  {
    eco: 'C02',
    name: 'French Defence: Advance Variation',
    nameRu: 'Французская защита: Вариант продвижения',
    moves: ['e2e4', 'e7e6', 'd2d4', 'd7d5', 'e4e5', 'c7c5', 'c2c3', 'b8c6', 'g1f3', 'c8d7', 'f1e2', 'g8e7', 'e1g1', 'c5d4'],
  },
  {
    eco: 'B12',
    name: 'Caro-Kann Defence: Advance Variation',
    nameRu: 'Защита Каро-Канн: Вариант продвижения',
    moves: ['e2e4', 'c7c6', 'd2d4', 'd7d5', 'e4e5', 'c8f5', 'g1f3', 'e7e6', 'f1e2', 'c6c5', 'c1e3', 'd8b6', 'b1c3', 'b8c6'],
  },
  {
    eco: 'B18',
    name: 'Caro-Kann Defence: Classical',
    nameRu: 'Защита Каро-Канн: Классическая система',
    moves: ['e2e4', 'c7c6', 'd2d4', 'd7d5', 'b1c3', 'd5e4', 'c3e4', 'c8f5', 'e4g3', 'f5g6', 'h2h4', 'h7h6', 'g1f3', 'b8d7'],
  },
  {
    eco: 'B01',
    name: 'Scandinavian Defence',
    nameRu: 'Скандинавская защита',
    moves: ['e2e4', 'd7d5', 'e4d5', 'd8d5', 'b1c3', 'd5a5', 'd2d4', 'g8f6', 'g1f3', 'c7c6', 'f1c4', 'c8f5', 'c1d2', 'e7e6'],
  },
  {
    eco: 'B07',
    name: 'Pirc Defence',
    nameRu: 'Защита Пирца-Уфимцева',
    moves: ['e2e4', 'd7d6', 'd2d4', 'g8f6', 'b1c3', 'g7g6', 'g1f3', 'f8g7', 'f1e2', 'e8g8', 'e1g1', 'c7c6', 'a2a4'],
  },

  // === 1. d4 Closed Games (Queen's Gambit, Slav, Indian Defences) ===
  {
    eco: 'D37',
    name: "Queen's Gambit Declined",
    nameRu: 'Отказанный ферзевый гамбит',
    moves: ['d2d4', 'd7d5', 'c2c4', 'e7e6', 'b1c3', 'g8f6', 'g1f3', 'f8e7', 'c1f4', 'e8g8', 'e2e3', 'c7c5', 'd4c5', 'e7c5'],
  },
  {
    eco: 'D10',
    name: 'Slav Defence',
    nameRu: 'Славянская защита',
    moves: ['d2d4', 'd7d5', 'c2c4', 'c7c6', 'g1f3', 'g8f6', 'b1c3', 'd5c4', 'a2a4', 'c8f5', 'e2e3', 'e7e6', 'f1c4', 'f8b4', 'e1g1'],
  },
  {
    eco: 'D20',
    name: "Queen's Gambit Accepted",
    nameRu: 'Принятый ферзевый гамбит',
    moves: ['d2d4', 'd7d5', 'c2c4', 'd5c4', 'g1f3', 'g8f6', 'e2e3', 'e7e6', 'f1c4', 'c7c5', 'e1g1', 'a7a6', 'd4c5', 'd8d1'],
  },
  {
    eco: 'D02',
    name: 'London System',
    nameRu: 'Лондонская система',
    moves: ['d2d4', 'd7d5', 'g1f3', 'g8f6', 'c1f4', 'c7c5', 'e2e3', 'b8c6', 'c2c3', 'd8b6', 'd1b3', 'c5c4', 'b3c2', 'c8f5'],
  },
  {
    eco: 'E60',
    name: "King's Indian Defence: Mar del Plata",
    nameRu: 'Староиндийская защита: Вариант Мар-дель-Плата',
    moves: ['d2d4', 'g8f6', 'c2c4', 'g7g6', 'b1c3', 'f8g7', 'e2e4', 'd7d6', 'g1f3', 'e8g8', 'f1e2', 'e7e5', 'e1g1', 'b8c6', 'd4d5', 'c6e7'],
  },
  {
    eco: 'E32',
    name: 'Nimzo-Indian Defence: Classical',
    nameRu: 'Защита Нимцовича: Классическая система',
    moves: ['d2d4', 'g8f6', 'c2c4', 'e7e6', 'b1c3', 'f8b4', 'd1c2', 'e8g8', 'a2a3', 'b4c3', 'c2c3', 'b7b6', 'c1g5', 'c8b7'],
  },
  {
    eco: 'D85',
    name: 'Grünfeld Defence: Exchange Variation',
    nameRu: 'Защита Грюнфельда: Разменный вариант',
    moves: ['d2d4', 'g8f6', 'c2c4', 'g7g6', 'b1c3', 'd7d5', 'c4d5', 'f6d5', 'e2e4', 'd5c3', 'b2c3', 'f8g7', 'g1f3', 'c7c5', 'a1b1', 'e8g8'],
  },
  {
    eco: 'A80',
    name: 'Dutch Defence',
    nameRu: 'Голландская защита',
    moves: ['d2d4', 'f7f5', 'g1f3', 'g8f6', 'g2g3', 'e7e6', 'f1g2', 'd7d5', 'e1g1', 'f8d6', 'c2c4', 'c7c6', 'b2b3', 'd8e7'],
  },

  // === Flank Openings (1. c4, 1. Nf3) ===
  {
    eco: 'A20',
    name: 'English Opening: King’s English',
    nameRu: 'Английское начало: Обратная сицилианка',
    moves: ['c2c4', 'e7e5', 'b1c3', 'g8f6', 'g1f3', 'b8c6', 'g2g3', 'f8b4', 'f1g2', 'e8g8', 'e1g1', 'f8e8', 'd2d3', 'b4c3', 'b2c3'],
  },
  {
    eco: 'A30',
    name: 'English Opening: Symmetrical',
    nameRu: 'Английское начало: Симметричный вариант',
    moves: ['c2c4', 'c7c5', 'g1f3', 'g8f6', 'b1c3', 'b8c6', 'g2g3', 'd7d5', 'c4d5', 'f6d5', 'f1g2', 'd5c7', 'e1g1', 'e7e5'],
  },
  {
    eco: 'A04',
    name: 'Réti Opening',
    nameRu: 'Дебют Рети',
    moves: ['g1f3', 'd7d5', 'g2g3', 'g8f6', 'f1g2', 'c7c6', 'e1g1', 'c8g4', 'd2d3', 'e7e6', 'b1d2', 'b8d7', 'h2h3', 'g4h5'],
  },
];

/**
 * Convert Move object to UCI move string (e.g. 'e2e4', 'e7e8q')
 */
export function moveToUciString(move: Move): string {
  const from = squareToAlgebraic(move.from);
  const to = squareToAlgebraic(move.to);
  const promo = move.promotion ? move.promotion.toLowerCase() : '';
  return `${from}${to}${promo}`;
}

/**
 * Convert UCI move string to legal Move object from current board state
 */
export function uciStringToMove(state: BoardState, uciStr: string): Move | null {
  if (uciStr.length < 4) return null;
  const from = algebraicToSquare(uciStr.slice(0, 2));
  const to = algebraicToSquare(uciStr.slice(2, 4));
  const promo = uciStr.length >= 5 ? (uciStr[4].toLowerCase() as PieceType) : undefined;

  const legals = generateLegalMoves(state);
  return (
    legals.find((m) => {
      if (m.from !== from || m.to !== to) return false;
      if (promo) return m.promotion === promo;
      return !m.promotion;
    }) || null
  );
}

export interface BookRecommendation {
  move: Move;
  uci: string;
  eco: string;
  name: string;
  nameRu: string;
  ply: number;
}

/**
 * Searches the Grandmaster Opening Book for a move matching the current game sequence.
 */
export function getBookMove(
  state: BoardState,
  history: Move[],
  randomize = true
): BookRecommendation | null {
  const currentPly = history.length;
  // Opening book is active in the first 16 plies (8 full moves)
  if (currentPly >= 16) return null;

  // Convert current game history to UCI strings
  const currentUciSequence = history.map(moveToUciString);

  // Find all opening entries that match current prefix
  const matchingCandidates: { entry: BookEntry; nextUci: string }[] = [];

  for (const entry of OPENING_BOOK) {
    if (entry.moves.length <= currentPly) continue;

    // Check if entry prefix matches current game moves
    let matches = true;
    for (let i = 0; i < currentPly; i++) {
      if (entry.moves[i] !== currentUciSequence[i]) {
        matches = false;
        break;
      }
    }

    if (matches) {
      const nextUci = entry.moves[currentPly];
      matchingCandidates.push({ entry, nextUci });
    }
  }

  if (matchingCandidates.length === 0) return null;

  // Pick candidate (random or first)
  const choice = randomize
    ? matchingCandidates[Math.floor(Math.random() * matchingCandidates.length)]
    : matchingCandidates[0];

  const moveObj = uciStringToMove(state, choice.nextUci);
  if (!moveObj) return null;

  return {
    move: moveObj,
    uci: choice.nextUci,
    eco: choice.entry.eco,
    name: choice.entry.name,
    nameRu: choice.entry.nameRu,
    ply: currentPly + 1,
  };
}

/**
 * Identifies the current opening name and ECO based on move history.
 */
export function identifyOpening(history: Move[]): { eco: string; name: string; nameRu: string } | null {
  if (history.length === 0) return null;

  const currentUciSequence = history.map(moveToUciString);
  let bestMatch: BookEntry | null = null;
  let maxMatchedPlies = 0;

  for (const entry of OPENING_BOOK) {
    let matchedPlies = 0;
    const limit = Math.min(entry.moves.length, currentUciSequence.length);
    for (let i = 0; i < limit; i++) {
      if (entry.moves[i] === currentUciSequence[i]) {
        matchedPlies++;
      } else {
        break;
      }
    }
    if (matchedPlies > maxMatchedPlies && matchedPlies >= 2) {
      maxMatchedPlies = matchedPlies;
      bestMatch = entry;
    }
  }

  if (!bestMatch) return null;

  return {
    eco: bestMatch.eco,
    name: bestMatch.name,
    nameRu: bestMatch.nameRu,
  };
}
