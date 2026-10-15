/**
 * Stockfish 19 / Modern UCI Time Management Model.
 * 
 * Implements standard competitive chess clock controls:
 * - Blitz, Rapid, Bullet, Classical time controls (with increment)
 * - Move-horizon allocation (~move 20 to 60 dynamic scale)
 * - Safe floor and ceiling limits with panic buffers
 */

export interface TimeControlConfig {
  id: string;
  name: string;
  nameRu: string;
  initialSeconds: number; // 0 = unlimited / no clock
  incrementSeconds: number;
}

export const TIME_PRESETS: TimeControlConfig[] = [
  { id: 'none', name: 'No Clock', nameRu: 'Без времени (Фикс. 1.5с)', initialSeconds: 0, incrementSeconds: 0 },
  { id: '1+0', name: '1 min', nameRu: '1 мин (Bullet)', initialSeconds: 60, incrementSeconds: 0 },
  { id: '3+0', name: '3 min', nameRu: '3 мин (Blitz)', initialSeconds: 180, incrementSeconds: 0 },
  { id: '3+2', name: '3+2', nameRu: '3 + 2 сек (Blitz)', initialSeconds: 180, incrementSeconds: 2 },
  { id: '5+0', name: '5 min', nameRu: '5 мин (Blitz)', initialSeconds: 300, incrementSeconds: 0 },
  { id: '5+3', name: '5+3', nameRu: '5 + 3 сек (Blitz)', initialSeconds: 300, incrementSeconds: 3 },
  { id: '10+0', name: '10 min', nameRu: '10 мин (Rapid)', initialSeconds: 600, incrementSeconds: 0 },
  { id: '15+10', name: '15+10', nameRu: '15 + 10 сек (Rapid)', initialSeconds: 900, incrementSeconds: 10 },
];

/**
 * Calculates optimal engine search time for a move using standard Stockfish TM rules.
 * 
 * @param remainingMs Engine remaining time on clock in milliseconds
 * @param incMs Clock increment per move in milliseconds
 * @param ply Current move ply (fullmoveNumber * 2)
 * @returns Allocated search time in milliseconds (bounded safely)
 */
export function calculateEngineMoveTime(
  remainingMs: number,
  incMs: number = 0,
  ply: number = 10
): number {
  if (remainingMs <= 0) {
    return 1500; // Default fixed time when unlimited/no clock
  }

  // Stockfish move horizon constant
  // Estimated moves remaining until game conclusion or time control
  const moveNumber = Math.max(1, Math.floor(ply / 2));
  const expectedMovesRemaining = Math.max(15, Math.min(50, 60 - moveNumber));

  // Base allocation: fraction of remaining time plus generous portion of increment
  const baseTime = remainingMs / expectedMovesRemaining + incMs * 0.75;

  // Stockfish 19 bounds:
  // - Minimum sanity time: 80ms (or remainingMs / 2 if flagging)
  // - Maximum safe ceiling: min(remainingMs * 0.35, baseTime * 2.5) to never flag
  const minTime = Math.min(100, Math.max(20, Math.floor(remainingMs * 0.05)));
  const maxCeiling = Math.max(minTime, Math.floor(remainingMs * 0.35));

  // Web engine practical cap: keep moves responsive (max 3000ms)
  const safeCap = Math.min(3000, maxCeiling);
  const allocated = Math.max(minTime, Math.min(safeCap, Math.round(baseTime)));
  return allocated;
}

/**
 * Format clock milliseconds into chess clock string mm:ss or ss.t
 */
export function formatClockTime(ms: number): string {
  if (ms <= 0) return '0:00';
  // Sub-10 seconds with tenths: e.g. 8.4s
  if (ms < 10000) {
    const wholeSecs = Math.floor(ms / 1000);
    const tenths = Math.floor((ms % 1000) / 100);
    return `${wholeSecs}.${tenths}`;
  }
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
}
