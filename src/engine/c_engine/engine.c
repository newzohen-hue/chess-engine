#include "engine.h"

#if defined(__wasm__)
typedef unsigned long size_t;
void* memset(void* dest, int val, size_t len) {
  unsigned char* ptr = (unsigned char*)dest;
  unsigned char c = (unsigned char)val;
  while (((unsigned long)ptr & 3) && len > 0) {
    *ptr++ = c;
    len--;
  }
  uint32_t c32 = (uint32_t)c | ((uint32_t)c << 8) | ((uint32_t)c << 16) | ((uint32_t)c << 24);
  uint32_t* ptr32 = (uint32_t*)ptr;
  while (len >= 4) {
    *ptr32++ = c32;
    len -= 4;
  }
  ptr = (unsigned char*)ptr32;
  while (len > 0) {
    *ptr++ = c;
    len--;
  }
  return dest;
}

void* memcpy(void* dest, const void* src, size_t len) {
  unsigned char* d = (unsigned char*)dest;
  const unsigned char* s = (const unsigned char*)src;
  while (((unsigned long)d & 3) && ((unsigned long)s & 3) && len > 0) {
    *d++ = *s++;
    len--;
  }
  uint32_t* d32 = (uint32_t*)d;
  const uint32_t* s32 = (const uint32_t*)s;
  while (len >= 4) {
    *d32++ = *s32++;
    len -= 4;
  }
  d = (unsigned char*)d32;
  s = (const unsigned char*)s32;
  while (len > 0) {
    *d++ = *s++;
    len--;
  }
  return dest;
}
#else
#include <string.h>
#endif

// Material Values (Centipawns)
static const int16_t piece_val_mg[7] = { 0, 100, 320, 330, 500, 950, 20000 };
static const int16_t piece_val_eg[7] = { 0, 130, 310, 335, 530, 980, 20000 };
static const int8_t  piece_phase[7]  = { 0, 0, 1, 1, 2, 4, 0 };

// PeSTO's Piece-Square Tables (White perspective, square 0=a8, 63=h1)
static const int16_t mg_pawn_table[64] = {
    0,   0,   0,   0,   0,   0,   0,   0,
   98, 134,  61,  95,  68, 126,  34, -11,
   -6,   7,  26,  31,  65,  56,  25, -20,
  -14,  13,   6,  21,  23,  12,  17, -23,
  -27,  -2,  -5,  12,  17,   6,  10, -25,
  -26,  -4,  -4, -10,   3,   3,  33, -12,
  -35,  -1, -20, -23, -15,  24,  38, -22,
    0,   0,   0,   0,   0,   0,   0,   0,
};

static const int16_t eg_pawn_table[64] = {
    0,   0,   0,   0,   0,   0,   0,   0,
  178, 173, 158, 134, 147, 132, 165, 187,
   94, 100,  85,  67,  56,  53,  82,  84,
   32,  24,  13,   5,  -2,   4,  17,  17,
   13,   9,  -3,  -7,  -7,  -8,   3,  -1,
    4,   7,  -6,   1,   0,  -5,  -1,  -8,
   13,   8,   8,  10,  13,   0,   2,  -7,
    0,   0,   0,   0,   0,   0,   0,   0,
};

static const int16_t mg_knight_table[64] = {
  -167, -89, -34, -49,  61, -97, -15, -107,
   -73, -41,  72,  36,  23,  62,   7,  -17,
   -47,  60,  37,  65,  84, 129,  73,   44,
    -9,  17,  19,  53,  37,  69,  18,   22,
   -13,   4,  16,  13,  28,  19,  21,   -8,
   -23,  -9,  12,  10,  19,  17,  25,  -16,
   -29, -53, -12,  -3,  -1,  18, -14,  -19,
  -105, -21, -58, -33, -17, -28, -19,  -23,
};

static const int16_t eg_knight_table[64] = {
  -58, -38, -13, -28, -31, -27, -63, -99,
  -25,  -8, -25,  -2,  -9, -25, -24, -52,
  -24, -20,  10,   9,  -1,  -9, -19, -41,
  -17,   3,  22,  22,  22,  11,   8, -18,
  -18,  -6,  16,  25,  16,  17,   4, -18,
  -23,  -3,  -1,  15,  10,  -3, -20, -22,
  -42, -20, -10,  -5,  -2, -20, -23, -44,
  -29, -51, -23, -15, -22, -18, -50, -64,
};

static const int16_t mg_bishop_table[64] = {
  -29,   4, -82, -37, -25, -42,   7,  -8,
  -26,  16, -18, -13,  30,  59,  18, -47,
  -16,  37,  43,  40,  35,  50,  37,  -2,
   -4,   5,  19,  50,  37,  37,   7,  -2,
   -6,  13,  13,  26,  34,  12,  10,   4,
    0,  15,  15,  15,  14,  27,  18,  10,
    4,  15,  16,   0,   7,  21,  33,   1,
  -33,  -3, -14, -21, -13, -12, -39, -21,
};

static const int16_t eg_bishop_table[64] = {
  -14, -21, -11,  -8,  -7,  -9, -17, -24,
   -8,  -4,   7, -12,  -3, -13,  -4, -14,
    2,  -8,   0,  -1,  -2,   6,   0,   4,
   -3,   9,  12,   9,  14,  10,   3,   2,
   -6,   3,  13,  19,   7,  10,  -3,  -9,
  -12,  -3,   8,  10,  13,   3,  -7, -15,
  -14, -18,  -7,  -1,   4,  -9, -15, -27,
  -23,  -9, -23,  -5,  -9, -16,  -5, -17,
};

static const int16_t mg_rook_table[64] = {
   32,  42,  32,  51,  63,   9,  31,  43,
   27,  32,  58,  62,  80,  67,  26,  44,
   -5,  19,  26,  36,  17,  45,  61,  16,
  -24, -11,   7,  26,  24,  35,  -8, -20,
  -36, -26, -12,  -1,   9,  -7,   6, -23,
  -45, -25, -16, -17,   3,   0,  -5, -33,
  -44, -16, -20,  -9,  -1,  11,  -6, -71,
  -19, -13,   1,  17,  16,   7, -37, -26,
};

static const int16_t eg_rook_table[64] = {
  13, 10, 18, 15, 12,  12,   8,   5,
  11, 13, 13, 11, -3,   3,   8,   3,
   7,  7,  7,  5,  4,  -3,  -5,  -3,
   4,  3, 13,  1,  2,   1,  -1,   2,
   3,  5,  8,  4, -5,  -6,  -8, -11,
  -4,  0, -5, -1, -7, -12,  -8, -16,
  -6, -6,  0,  2, -9,  -9, -11,  -3,
  -9,  2,  3, -1, -5, -13,   4, -20,
};

static const int16_t mg_queen_table[64] = {
  -28,   0,  29,  12,  59,  44,  43,  45,
  -24, -39,  -5,   1, -16,  57,  28,  54,
  -13, -17,   7,   8,  29,  56,  47,  57,
  -27, -27, -16, -16,  -1,  17,  -2,   1,
   -9, -26,  -9, -10,  -2,  -4,   3,  -3,
  -14,   2, -11,  -2,  -5,   2,  14,   5,
  -35,  -8,  11,   2,   8,  15,  -3,   1,
   -1, -18,  -9,  10, -15, -25, -31, -50,
};

static const int16_t eg_queen_table[64] = {
   -9,  22,  22,  27,  27,  19,  10,  20,
  -17,  20,  32,  41,  58,  25,  30,   0,
  -20,   6,   9,  49,  47,  35,  19,   9,
    3,  22,  24,  45,  57,  40,  57,  36,
  -18,  28,  19,  47,  31,  34,  39,  18,
  -16, -27,  15,   6,   9,  17,  10,   5,
  -22, -23, -30, -16, -16, -23, -36, -32,
  -33, -28, -22, -43,  -5, -32, -20, -41,
};

static const int16_t mg_king_table[64] = {
  -65,  23,  16, -15, -56, -34,   2,  13,
   29,  -1, -20,  -7,  -8,  -4, -38, -29,
   -9,  24,   2, -16, -20,   6,  22, -22,
  -17, -20, -12, -27, -30, -25, -14, -36,
  -49,  -1, -27, -39, -46, -44, -33, -51,
  -14, -14, -22, -46, -44, -30, -15, -27,
    1,   7,  -8, -64, -43, -16,   9,   8,
  -15,  36,  12, -54,   8, -28,  24,  14,
};

static const int16_t eg_king_table[64] = {
  -74, -35, -18, -18, -11,  15,   4, -17,
  -12,  17,  14,  17,  17,  38,  23,  11,
   10,  17,  23,  15,  20,  45,  44,  13,
   -8,  22,  24,  27,  26,  33,  26,   3,
  -18,  -4,  21,  24,  27,  23,   9, -11,
  -19,  -3,  11,  21,  23,  16,   7,  -9,
  -27, -11,   4,  13,  14,   4,  -5, -17,
  -53, -34, -21, -11, -28, -14, -24, -43,
};

// Precomputed Piece-Square tables signed for White (+) and Black (-)
static int16_t psq_mg[13][64];
static int16_t psq_eg[13][64];

// Current Search Engine State
static Position current_pos;
static Move best_move_found;
static int best_score_found = 0;
static int nodes_visited = 0;
static int search_depth_reached = 0;
static int search_start_time = 0;
static int search_time_limit = 0;
static int search_aborted = 0;
static int tt_hits_count = 0;

// Transposition Table
static TTEntry tt[TT_SIZE];

// Move Ordering Heuristics
static Move killer_moves[MAX_PLY][2];
static Move counter_moves[64][64];
static int32_t history_table[2][64][64];

#define PV_MAX 32
static Move pv_line[PV_MAX];
static int pv_length = 0;

// Platform time wrapper (for wasm / native)
#if defined(__wasm__)
extern int js_get_time_ms(void);
static inline int get_time_ms(void) { return js_get_time_ms(); }
#elif defined(__EMSCRIPTEN__)
#include <emscripten.h>
static inline int get_time_ms(void) { return (int)emscripten_get_now(); }
#elif defined(_WIN32)
#include <windows.h>
static inline int get_time_ms(void) { return (int)GetTickCount(); }
#else
#include <time.h>
static inline int get_time_ms(void) {
  struct timespec ts;
  clock_gettime(CLOCK_MONOTONIC, &ts);
  return (int)(ts.tv_sec * 1000 + ts.tv_nsec / 1000000);
}
#endif

// Zobrist Randoms
static uint64_t z_pieces[64][13];
static uint64_t z_turn;
static uint64_t z_castling[16];
static uint64_t z_ep[9]; // 0..7 files, 8 = none

static uint64_t zobrist_seed = 0x123456789ULL;
static inline uint64_t rand64(void) {
  zobrist_seed ^= zobrist_seed << 13;
  zobrist_seed ^= zobrist_seed >> 7;
  zobrist_seed ^= zobrist_seed << 17;
  return zobrist_seed;
}

// Precompute tables
void engine_init(void) {
  zobrist_seed = 0x987654321ULL;
  for (int sq = 0; sq < 64; sq++) {
    for (int p = 0; p < 13; p++) {
      z_pieces[sq][p] = rand64();
    }
  }
  z_turn = rand64();
  for (int i = 0; i < 16; i++) {
    z_castling[i] = rand64();
  }
  for (int i = 0; i < 9; i++) {
    z_ep[i] = rand64();
  }

  // Precompute PSQ signed tables
  for (int p = 0; p < 13; p++) {
    for (int sq = 0; sq < 64; sq++) {
      psq_mg[p][sq] = 0;
      psq_eg[p][sq] = 0;
    }
  }

  for (int p = 1; p <= 12; p++) {
    int c = COLOR(p);
    uint8_t t = TYPE(p);
    for (int sq = 0; sq < 64; sq++) {
      int psq = (c == WHITE) ? sq : (sq ^ 56);
      int16_t mg_val = piece_val_mg[t];
      int16_t eg_val = piece_val_eg[t];

      switch (t) {
        case W_P: mg_val += mg_pawn_table[psq]; eg_val += eg_pawn_table[psq]; break;
        case W_N: mg_val += mg_knight_table[psq]; eg_val += eg_knight_table[psq]; break;
        case W_B: mg_val += mg_bishop_table[psq]; eg_val += eg_bishop_table[psq]; break;
        case W_R: mg_val += mg_rook_table[psq]; eg_val += eg_rook_table[psq]; break;
        case W_Q: mg_val += mg_queen_table[psq]; eg_val += eg_queen_table[psq]; break;
        case W_K: mg_val += mg_king_table[psq]; eg_val += eg_king_table[psq]; break;
      }

      if (c == WHITE) {
        psq_mg[p][sq] = mg_val;
        psq_eg[p][sq] = eg_val;
      } else {
        psq_mg[p][sq] = -mg_val;
        psq_eg[p][sq] = -eg_val;
      }
    }
  }

  engine_reset();
}

void engine_reset(void) {
  memset(tt, 0, sizeof(tt));
  tt_hits_count = 0;
  memset(killer_moves, 0, sizeof(killer_moves));
  memset(history_table, 0, sizeof(history_table));
  memset(counter_moves, 0, sizeof(counter_moves));
}

// Move Generator Vectors
static const int knight_dirs[8] = { -17, -15, -10, -6, 6, 10, 15, 17 };
static const int bishop_dirs[4] = { -9, -7, 7, 9 };
static const int rook_dirs[4]   = { -8, -1, 1, 8 };
static const int king_dirs[8]   = { -9, -8, -7, -1, 1, 7, 8, 9 };

int is_in_check(const Position* pos, int color) {
  int king_sq = -1;
  uint8_t king_target = (color == WHITE) ? W_K : B_K;

  for (int sq = 0; sq < 64; sq++) {
    if (pos->board[sq] == king_target) {
      king_sq = sq;
      break;
    }
  }
  if (king_sq == -1) return 0;

  int kr = king_sq / 8;
  int kc = king_sq % 8;
  int enemy_color = (color == WHITE) ? BLACK : WHITE;

  // 1. Enemy Pawns
  if (color == WHITE) {
    if (kr > 0) {
      if (kc > 0 && pos->board[king_sq - 9] == B_P) return 1;
      if (kc < 7 && pos->board[king_sq - 7] == B_P) return 1;
    }
  } else {
    if (kr < 7) {
      if (kc > 0 && pos->board[king_sq + 7] == W_P) return 1;
      if (kc < 7 && pos->board[king_sq + 9] == W_P) return 1;
    }
  }

  // 2. Enemy Knights
  for (int i = 0; i < 8; i++) {
    int to = king_sq + knight_dirs[i];
    if (to >= 0 && to < 64) {
      int tr = to / 8;
      int tc = to % 8;
      if ((kr - tr) * (kr - tr) + (kc - tc) * (kc - tc) == 5) {
        uint8_t p = pos->board[to];
        if (p != EMPTY && COLOR(p) == enemy_color && TYPE(p) == W_N) {
          return 1;
        }
      }
    }
  }

  // 3. Bishops & Queens
  for (int d = 0; d < 4; d++) {
    int dir = bishop_dirs[d];
    int cur = king_sq;
    while (1) {
      int prev_r = cur / 8;
      int prev_c = cur % 8;
      cur += dir;
      if (cur < 0 || cur >= 64) break;
      int next_r = cur / 8;
      int next_c = cur % 8;
      if (next_c - prev_c != 1 && next_c - prev_c != -1) break;
      uint8_t p = pos->board[cur];
      if (p != EMPTY) {
        if (COLOR(p) == enemy_color && (TYPE(p) == W_B || TYPE(p) == W_Q)) {
          return 1;
        }
        break;
      }
    }
  }

  // 4. Rooks & Queens
  for (int d = 0; d < 4; d++) {
    int dir = rook_dirs[d];
    int cur = king_sq;
    while (1) {
      int prev_r = cur / 8;
      int prev_c = cur % 8;
      cur += dir;
      if (cur < 0 || cur >= 64) break;
      int next_r = cur / 8;
      int next_c = cur % 8;
      if (dir == 1 || dir == -1) {
        if (next_r != prev_r) break;
      } else {
        if (next_c != prev_c) break;
      }
      uint8_t p = pos->board[cur];
      if (p != EMPTY) {
        if (COLOR(p) == enemy_color && (TYPE(p) == W_R || TYPE(p) == W_Q)) {
          return 1;
        }
        break;
      }
    }
  }

  // 5. Enemy King
  for (int i = 0; i < 8; i++) {
    int to = king_sq + king_dirs[i];
    if (to >= 0 && to < 64) {
      int tr = to / 8;
      int tc = to % 8;
      if (kr - tr >= -1 && kr - tr <= 1 && kc - tc >= -1 && kc - tc <= 1) {
        uint8_t p = pos->board[to];
        if (p != EMPTY && COLOR(p) == enemy_color && TYPE(p) == W_K) {
          return 1;
        }
      }
    }
  }

  return 0;
}

// Initial position score calculation (only called in engine_set_fen)
static void init_position_scores(Position* pos) {
  pos->mg_score = 0;
  pos->eg_score = 0;
  pos->game_phase = 0;
  pos->white_bishops = 0;
  pos->black_bishops = 0;
  pos->key = 0;

  for (int sq = 0; sq < 64; sq++) {
    uint8_t p = pos->board[sq];
    if (p != EMPTY) {
      pos->mg_score += psq_mg[p][sq];
      pos->eg_score += psq_eg[p][sq];
      pos->game_phase += piece_phase[TYPE(p)];
      pos->key ^= z_pieces[sq][p];
      if (p == W_B) pos->white_bishops++;
      if (p == B_B) pos->black_bishops++;
    }
  }

  if (pos->turn == BLACK) {
    pos->key ^= z_turn;
  }
  pos->key ^= z_castling[pos->castling & 15];
  int ep_col = (pos->en_passant >= 0) ? (pos->en_passant % 8) : 8;
  pos->key ^= z_ep[ep_col];
}

// Incremental Make Move (Maintains board, score, phase, bishops, and Zobrist key)
void make_move(Position* next, const Position* pos, const Move* move) {
  for (int i = 0; i < 64; i++) {
    next->board[i] = pos->board[i];
  }
  next->turn = (pos->turn == WHITE) ? BLACK : WHITE;
  next->castling = pos->castling;
  next->en_passant = -1;
  next->halfmove_clock = pos->halfmove_clock + 1;
  next->fullmove_number = pos->fullmove_number + (pos->turn == BLACK ? 1 : 0);

  next->mg_score = pos->mg_score;
  next->eg_score = pos->eg_score;
  next->game_phase = pos->game_phase;
  next->white_bishops = pos->white_bishops;
  next->black_bishops = pos->black_bishops;
  next->key = pos->key;

  int from = move->from;
  int to = move->to;
  uint8_t piece = move->piece;
  uint8_t captured = move->captured;

  if (TYPE(piece) == W_P || captured != EMPTY || (move->flags & FLAG_EP)) {
    next->halfmove_clock = 0;
  }

  // 1. Remove moving piece from 'from'
  next->board[from] = EMPTY;
  next->mg_score -= psq_mg[piece][from];
  next->eg_score -= psq_eg[piece][from];
  next->key ^= z_pieces[from][piece];

  // 2. Remove standard captured piece from 'to'
  if (captured != EMPTY && !(move->flags & FLAG_EP)) {
    next->mg_score -= psq_mg[captured][to];
    next->eg_score -= psq_eg[captured][to];
    next->game_phase -= piece_phase[TYPE(captured)];
    next->key ^= z_pieces[to][captured];
    if (captured == W_B) next->white_bishops--;
    if (captured == B_B) next->black_bishops--;
  }

  // 3. En passant capture
  if (move->flags & FLAG_EP) {
    int cap_sq = (pos->turn == WHITE) ? to + 8 : to - 8;
    uint8_t ep_pawn = (pos->turn == WHITE) ? B_P : W_P;
    next->board[cap_sq] = EMPTY;
    next->mg_score -= psq_mg[ep_pawn][cap_sq];
    next->eg_score -= psq_eg[ep_pawn][cap_sq];
    next->game_phase -= piece_phase[W_P];
    next->key ^= z_pieces[cap_sq][ep_pawn];
  }

  // 4. Place piece at 'to' (or promotion piece)
  if (move->promotion) {
    uint8_t promo_piece = (pos->turn == WHITE) ? move->promotion : (move->promotion + 6);
    next->board[to] = promo_piece;
    next->mg_score += psq_mg[promo_piece][to];
    next->eg_score += psq_eg[promo_piece][to];
    next->game_phase += piece_phase[move->promotion];
    next->key ^= z_pieces[to][promo_piece];
    if (promo_piece == W_B) next->white_bishops++;
    if (promo_piece == B_B) next->black_bishops++;
  } else {
    next->board[to] = piece;
    next->mg_score += psq_mg[piece][to];
    next->eg_score += psq_eg[piece][to];
    next->key ^= z_pieces[to][piece];
  }

  // 5. Castling rook move
  if (move->flags & FLAG_CASTLE) {
    int r_from = -1, r_to = -1;
    uint8_t r_piece = EMPTY;
    if (to == 62) { r_from = 63; r_to = 61; r_piece = W_R; }
    else if (to == 58) { r_from = 56; r_to = 59; r_piece = W_R; }
    else if (to == 6) { r_from = 7; r_to = 5; r_piece = B_R; }
    else if (to == 2) { r_from = 0; r_to = 3; r_piece = B_R; }

    if (r_from != -1) {
      next->board[r_from] = EMPTY;
      next->board[r_to] = r_piece;
      next->mg_score += psq_mg[r_piece][r_to] - psq_mg[r_piece][r_from];
      next->eg_score += psq_eg[r_piece][r_to] - psq_eg[r_piece][r_from];
      next->key ^= z_pieces[r_from][r_piece] ^ z_pieces[r_to][r_piece];
    }
  }

  // 6. Double pawn push sets en passant target
  if (TYPE(piece) == W_P) {
    if (from - to == 16) {
      next->en_passant = from - 8;
    } else if (to - from == 16) {
      next->en_passant = from + 8;
    }
  }

  // 7. Update castling rights
  if (piece == W_K) {
    next->castling &= ~(CASTLE_WK | CASTLE_WQ);
  } else if (piece == B_K) {
    next->castling &= ~(CASTLE_BK | CASTLE_BQ);
  }

  if (from == 63 || to == 63) next->castling &= ~CASTLE_WK;
  if (from == 56 || to == 56) next->castling &= ~CASTLE_WQ;
  if (from == 7  || to == 7)  next->castling &= ~CASTLE_BK;
  if (from == 0  || to == 0)  next->castling &= ~CASTLE_BQ;

  // 8. Turn toggle in Zobrist
  next->key ^= z_turn;

  // 9. Castling rights update in Zobrist
  next->key ^= z_castling[pos->castling & 15] ^ z_castling[next->castling & 15];

  // 10. En passant hash key update
  int old_ep = (pos->en_passant >= 0) ? (pos->en_passant % 8) : 8;
  int new_ep = (next->en_passant >= 0) ? (next->en_passant % 8) : 8;
  next->key ^= z_ep[old_ep] ^ z_ep[new_ep];
}

static inline void add_pawn_move(Move* moves, int* count, int from, int to, uint8_t piece, uint8_t cap, uint8_t flags) {
  int rank = to / 8;
  if (rank == 0 || rank == 7) {
    static const uint8_t promos[4] = { W_Q, W_R, W_B, W_N };
    for (int i = 0; i < 4; i++) {
      moves[*count].from = from;
      moves[*count].to = to;
      moves[*count].piece = piece;
      moves[*count].captured = cap;
      moves[*count].promotion = promos[i];
      moves[*count].flags = flags;
      (*count)++;
    }
  } else {
    moves[*count].from = from;
    moves[*count].to = to;
    moves[*count].piece = piece;
    moves[*count].captured = cap;
    moves[*count].promotion = 0;
    moves[*count].flags = flags;
    (*count)++;
  }
}

// Pseudo-legal move generator (Fast, no check-testing in generator)
int generate_pseudo_moves(const Position* pos, Move* moves, int captures_only) {
  int count = 0;
  int us = pos->turn;
  int them = (us == WHITE) ? BLACK : WHITE;

  for (int sq = 0; sq < 64; sq++) {
    uint8_t p = pos->board[sq];
    if (p == EMPTY || COLOR(p) != us) continue;

    uint8_t type = TYPE(p);
    int r = sq / 8;
    int c = sq % 8;

    if (type == W_P) {
      int forward = (us == WHITE) ? -8 : 8;
      int start_rank = (us == WHITE) ? 6 : 1;

      // Single step forward
      int one_step = sq + forward;
      if (one_step >= 0 && one_step < 64 && pos->board[one_step] == EMPTY) {
        if (!captures_only) {
          add_pawn_move(moves, &count, sq, one_step, p, EMPTY, 0);
        }
        // Double step forward
        int two_step = sq + forward * 2;
        if (r == start_rank && pos->board[two_step] == EMPTY && !captures_only) {
          moves[count++] = (Move){ sq, two_step, p, EMPTY, 0, 0 };
        }
      }

      // Diagonal captures
      int cap_offsets[2] = { forward - 1, forward + 1 };
      for (int i = 0; i < 2; i++) {
        int to = sq + cap_offsets[i];
        if (to >= 0 && to < 64) {
          int tc = to % 8;
          if (c - tc == 1 || c - tc == -1) {
            uint8_t target = pos->board[to];
            if (target != EMPTY && COLOR(target) == them) {
              add_pawn_move(moves, &count, sq, to, p, target, 0);
            } else if (to == pos->en_passant) {
              // En passant capture
              moves[count++] = (Move){ sq, to, p, (us == WHITE ? B_P : W_P), 0, FLAG_EP };
            }
          }
        }
      }
    } else if (type == W_N) {
      for (int i = 0; i < 8; i++) {
        int to = sq + knight_dirs[i];
        if (to >= 0 && to < 64) {
          int tr = to / 8;
          int tc = to % 8;
          if ((r - tr) * (r - tr) + (c - tc) * (c - tc) == 5) {
            uint8_t tgt = pos->board[to];
            if (tgt == EMPTY) {
              if (!captures_only) moves[count++] = (Move){ sq, to, p, EMPTY, 0, 0 };
            } else if (COLOR(tgt) == them) {
              moves[count++] = (Move){ sq, to, p, tgt, 0, 0 };
            }
          }
        }
      }
    } else if (type == W_B || type == W_R || type == W_Q) {
      int dir_count = (type == W_Q) ? 8 : 4;
      const int* dirs = (type == W_R) ? rook_dirs : (type == W_B) ? bishop_dirs : 0;
      static const int queen_dirs[8] = { -9, -8, -7, -1, 1, 7, 8, 9 };
      if (type == W_Q) dirs = queen_dirs;

      for (int d = 0; d < dir_count; d++) {
        int dir = dirs[d];
        int cur = sq;
        while (1) {
          int prev_r = cur / 8;
          int prev_c = cur % 8;
          cur += dir;
          if (cur < 0 || cur >= 64) break;

          int next_r = cur / 8;
          int next_c = cur % 8;

          if (dir == 1 || dir == -1) {
            if (next_r != prev_r) break;
          } else if (dir == 8 || dir == -8) {
            if (next_c != prev_c) break;
          } else {
            if (next_c - prev_c != 1 && next_c - prev_c != -1) break;
          }

          uint8_t tgt = pos->board[cur];
          if (tgt == EMPTY) {
            if (!captures_only) moves[count++] = (Move){ sq, cur, p, EMPTY, 0, 0 };
          } else {
            if (COLOR(tgt) == them) moves[count++] = (Move){ sq, cur, p, tgt, 0, 0 };
            break;
          }
        }
      }
    } else if (type == W_K) {
      for (int i = 0; i < 8; i++) {
        int to = sq + king_dirs[i];
        if (to >= 0 && to < 64) {
          int tr = to / 8;
          int tc = to % 8;
          if (r - tr >= -1 && r - tr <= 1 && c - tc >= -1 && c - tc <= 1) {
            uint8_t tgt = pos->board[to];
            if (tgt == EMPTY) {
              if (!captures_only) moves[count++] = (Move){ sq, to, p, EMPTY, 0, 0 };
            } else if (COLOR(tgt) == them) {
              moves[count++] = (Move){ sq, to, p, tgt, 0, 0 };
            }
          }
        }
      }

      // Castling
      if (!captures_only && !is_in_check(pos, us)) {
        if (us == WHITE) {
          if ((pos->castling & CASTLE_WK) && pos->board[61] == EMPTY && pos->board[62] == EMPTY) {
            Position test_pos;
            Move step = { 60, 61, W_K, EMPTY, 0, 0 };
            make_move(&test_pos, pos, &step);
            if (!is_in_check(&test_pos, WHITE)) {
              moves[count++] = (Move){ 60, 62, W_K, EMPTY, 0, FLAG_CASTLE };
            }
          }
          if ((pos->castling & CASTLE_WQ) && pos->board[59] == EMPTY && pos->board[58] == EMPTY && pos->board[57] == EMPTY) {
            Position test_pos;
            Move step = { 60, 59, W_K, EMPTY, 0, 0 };
            make_move(&test_pos, pos, &step);
            if (!is_in_check(&test_pos, WHITE)) {
              moves[count++] = (Move){ 60, 58, W_K, EMPTY, 0, FLAG_CASTLE };
            }
          }
        } else {
          if ((pos->castling & CASTLE_BK) && pos->board[5] == EMPTY && pos->board[6] == EMPTY) {
            Position test_pos;
            Move step = { 4, 5, B_K, EMPTY, 0, 0 };
            make_move(&test_pos, pos, &step);
            if (!is_in_check(&test_pos, BLACK)) {
              moves[count++] = (Move){ 4, 6, B_K, EMPTY, 0, FLAG_CASTLE };
            }
          }
          if ((pos->castling & CASTLE_BQ) && pos->board[3] == EMPTY && pos->board[2] == EMPTY && pos->board[1] == EMPTY) {
            Position test_pos;
            Move step = { 4, 3, B_K, EMPTY, 0, 0 };
            make_move(&test_pos, pos, &step);
            if (!is_in_check(&test_pos, BLACK)) {
              moves[count++] = (Move){ 4, 2, B_K, EMPTY, 0, FLAG_CASTLE };
            }
          }
        }
      }
    }
  }

  return count;
}

// Generate legal moves by filtering pseudo moves (used when complete legal move list is required)
int generate_legal_moves(const Position* pos, Move* moves, int captures_only) {
  Move pseudo[MAX_MOVES];
  int p_count = generate_pseudo_moves(pos, pseudo, captures_only);
  int count = 0;
  int us = pos->turn;

  for (int i = 0; i < p_count; i++) {
    Position next;
    make_move(&next, pos, &pseudo[i]);
    if (!is_in_check(&next, us)) {
      moves[count++] = pseudo[i];
    }
  }
  return count;
}

// Detailed Handcrafted Evaluation (HCE) with positional rules
int evaluate(const Position* pos) {
  int phase = pos->game_phase;
  if (phase > 24) phase = 24;
  if (phase < 0) phase = 0;

  int mg = pos->mg_score;
  int eg = pos->eg_score;

  // 1. Bishop Pair
  if (pos->white_bishops >= 2) { mg += 40; eg += 50; }
  if (pos->black_bishops >= 2) { mg -= 40; eg -= 50; }

  // 2. Track pawns by file and position for structural evaluation
  uint8_t w_pawns_file[8] = {0};
  uint8_t b_pawns_file[8] = {0};
  int8_t w_pawn_sqs[16];
  int8_t b_pawn_sqs[16];
  int w_pawn_cnt = 0;
  int b_pawn_cnt = 0;

  int w_king_sq = 60;
  int b_king_sq = 4;

  for (int sq = 0; sq < 64; sq++) {
    uint8_t p = pos->board[sq];
    if (p == EMPTY) continue;
    int f = sq % 8;
    int r = sq / 8;

    if (p == W_P) {
      w_pawns_file[f]++;
      if (w_pawn_cnt < 16) w_pawn_sqs[w_pawn_cnt++] = sq;
    } else if (p == B_P) {
      b_pawns_file[f]++;
      if (b_pawn_cnt < 16) b_pawn_sqs[b_pawn_cnt++] = sq;
    } else if (p == W_K) {
      w_king_sq = sq;
    } else if (p == B_K) {
      b_king_sq = sq;
    } else if (p == W_R) {
      // Rook on open / semi-open file
      if (w_pawns_file[f] == 0) {
        if (b_pawns_file[f] == 0) { mg += 28; eg += 20; }
        else { mg += 14; eg += 10; }
      }
      if (r == 1) { mg += 35; eg += 45; } // Rook on 7th rank
    } else if (p == B_R) {
      if (b_pawns_file[f] == 0) {
        if (w_pawns_file[f] == 0) { mg -= 28; eg -= 20; }
        else { mg -= 14; eg -= 10; }
      }
      if (r == 6) { mg -= 35; eg -= 45; } // Rook on 2nd rank
    } else if (p == W_N) {
      if (f == 0 || f == 7) { mg -= 14; eg -= 16; } // Rim knight
      if (r >= 2 && r <= 4 && f >= 2 && f <= 5) { mg += 18; eg += 14; } // Outpost
    } else if (p == B_N) {
      if (f == 0 || f == 7) { mg += 14; eg += 16; }
      if (r >= 3 && r <= 5 && f >= 2 && f <= 5) { mg -= 18; eg -= 14; }
    }
  }

  // 3. Pawn Structure: Doubled and Isolated Pawns
  for (int f = 0; f < 8; f++) {
    if (w_pawns_file[f] > 1) {
      int pen = (w_pawns_file[f] - 1) * 16;
      mg -= pen; eg -= pen + 4;
    }
    if (b_pawns_file[f] > 1) {
      int pen = (b_pawns_file[f] - 1) * 16;
      mg += pen; eg += pen + 4;
    }

    int w_has_neighbor = (f > 0 && w_pawns_file[f - 1] > 0) || (f < 7 && w_pawns_file[f + 1] > 0);
    if (w_pawns_file[f] > 0 && !w_has_neighbor) {
      mg -= 18; eg -= 22;
    }
    int b_has_neighbor = (f > 0 && b_pawns_file[f - 1] > 0) || (f < 7 && b_pawns_file[f + 1] > 0);
    if (b_pawns_file[f] > 0 && !b_has_neighbor) {
      mg += 18; eg += 22;
    }
  }

  // 4. Passed Pawns
  for (int i = 0; i < w_pawn_cnt; i++) {
    int sq = w_pawn_sqs[i];
    int f = sq % 8;
    int r = sq / 8;
    int is_passed = 1;
    for (int cf = (f > 0 ? f - 1 : 0); cf <= (f < 7 ? f + 1 : 7); cf++) {
      for (int cr = 0; cr < r; cr++) {
        if (pos->board[cr * 8 + cf] == B_P) {
          is_passed = 0;
          break;
        }
      }
      if (!is_passed) break;
    }
    if (is_passed) {
      int advance = 7 - r;
      int bonus = advance * advance * 4;
      mg += bonus;
      eg += bonus + (advance * 6);
    }
  }

  for (int i = 0; i < b_pawn_cnt; i++) {
    int sq = b_pawn_sqs[i];
    int f = sq % 8;
    int r = sq / 8;
    int is_passed = 1;
    for (int cf = (f > 0 ? f - 1 : 0); cf <= (f < 7 ? f + 1 : 7); cf++) {
      for (int cr = r + 1; cr < 8; cr++) {
        if (pos->board[cr * 8 + cf] == W_P) {
          is_passed = 0;
          break;
        }
      }
      if (!is_passed) break;
    }
    if (is_passed) {
      int advance = r;
      int bonus = advance * advance * 4;
      mg -= bonus;
      eg -= (bonus + (advance * 6));
    }
  }

  // 5. King Safety Pawn Shield (Midgame)
  if (phase > 6) {
    int wkf = w_king_sq % 8;
    int wkr = w_king_sq / 8;
    if (wkr >= 6) {
      int shield = 0;
      for (int f = (wkf > 0 ? wkf - 1 : 0); f <= (wkf < 7 ? wkf + 1 : 7); f++) {
        if (w_pawns_file[f] > 0) shield += 12;
        else shield -= 16;
      }
      mg += shield;
    }

    int bkf = b_king_sq % 8;
    int bkr = b_king_sq / 8;
    if (bkr <= 1) {
      int shield = 0;
      for (int f = (bkf > 0 ? bkf - 1 : 0); f <= (bkf < 7 ? bkf + 1 : 7); f++) {
        if (b_pawns_file[f] > 0) shield += 12;
        else shield -= 16;
      }
      mg -= shield;
    }
  }

  int total = ((mg * phase) + (eg * (24 - phase))) / 24;
  return (pos->turn == WHITE) ? total : -total;
}

// Move Scoring for Staged Ordering
static inline void score_moves(
    const Position* pos,
    Move* moves,
    int* scores,
    int count,
    const Move* tt_move,
    int ply,
    int prev_from,
    int prev_to
) {
  Move killer0 = (ply < MAX_PLY) ? killer_moves[ply][0] : (Move){0,0,0,0,0,0};
  Move killer1 = (ply < MAX_PLY) ? killer_moves[ply][1] : (Move){0,0,0,0,0,0};
  Move cm = (prev_from >= 0 && prev_to >= 0) ? counter_moves[prev_from][prev_to] : (Move){0,0,0,0,0,0};
  int us = pos->turn;

  for (int i = 0; i < count; i++) {
    // 1. TT Best Move
    if (tt_move && moves[i].from == tt_move->from && moves[i].to == tt_move->to && moves[i].promotion == tt_move->promotion) {
      scores[i] = 20000000;
      continue;
    }

    // 2. Captures (MVV-LVA)
    if (moves[i].captured != EMPTY || (moves[i].flags & FLAG_EP)) {
      uint8_t victim = (moves[i].flags & FLAG_EP) ? W_P : TYPE(moves[i].captured);
      uint8_t attacker = TYPE(moves[i].piece);
      scores[i] = 10000000 + (piece_val_mg[victim] * 16) - piece_val_mg[attacker];
      if (moves[i].promotion) {
        scores[i] += 500000 + piece_val_mg[moves[i].promotion];
      }
      continue;
    }

    // 3. Queen Promotions
    if (moves[i].promotion == W_Q) {
      scores[i] = 9000000;
      continue;
    }

    // 4. Killer Moves
    if (moves[i].from == killer0.from && moves[i].to == killer0.to) {
      scores[i] = 8000000;
      continue;
    }
    if (moves[i].from == killer1.from && moves[i].to == killer1.to) {
      scores[i] = 7000000;
      continue;
    }

    // 5. Counter Move
    if (cm.from != 0 && moves[i].from == cm.from && moves[i].to == cm.to) {
      scores[i] = 6000000;
      continue;
    }

    // 6. History Table
    scores[i] = history_table[us][moves[i].from][moves[i].to];
  }
}

// On-Demand Selection Sort
static inline void pick_best_move(Move* moves, int* scores, int start_idx, int count) {
  int best_idx = start_idx;
  int best_score = scores[start_idx];
  for (int j = start_idx + 1; j < count; j++) {
    if (scores[j] > best_score) {
      best_score = scores[j];
      best_idx = j;
    }
  }
  if (best_idx != start_idx) {
    Move tmp_m = moves[start_idx];
    moves[start_idx] = moves[best_idx];
    moves[best_idx] = tmp_m;
    int tmp_s = scores[start_idx];
    scores[start_idx] = scores[best_idx];
    scores[best_idx] = tmp_s;
  }
}

// Quiescence Search with Check Detection, Legal Evasions, and Delta Pruning
static int quiescence(const Position* pos, int alpha, int beta, int ply) {
  nodes_visited++;
  if ((nodes_visited & 4095) == 0) {
    if (search_time_limit > 0 && (get_time_ms() - search_start_time) >= search_time_limit) {
      search_aborted = 1;
      return 0;
    }
  }

  if (ply >= MAX_PLY - 1) return evaluate(pos);

  int us = pos->turn;
  int in_check = is_in_check(pos, us);

  int stand_pat = -MATE_SCORE;
  if (!in_check) {
    stand_pat = evaluate(pos);
    if (stand_pat >= beta) return beta;
    if (stand_pat > alpha) alpha = stand_pat;

    // Delta Pruning (only when not in check)
    if (stand_pat < alpha - 1050) return alpha;
  }

  Move moves[MAX_MOVES];
  int count = generate_pseudo_moves(pos, moves, in_check ? 0 : 1);
  if (count == 0) {
    return in_check ? (-MATE_SCORE + ply) : stand_pat;
  }

  int scores[MAX_MOVES];
  score_moves(pos, moves, scores, count, 0, ply, -1, -1);

  int legal_moves = 0;
  for (int i = 0; i < count; i++) {
    pick_best_move(moves, scores, i, count);

    // Bad capture pruning (only when not in check)
    if (!in_check) {
      uint8_t victim = (moves[i].flags & FLAG_EP) ? W_P : TYPE(moves[i].captured);
      if (!moves[i].promotion && stand_pat + piece_val_mg[victim] + 200 < alpha) {
        continue;
      }
    }

    Position next;
    make_move(&next, pos, &moves[i]);
    if (is_in_check(&next, us)) continue; // illegal move

    legal_moves++;

    int score = -quiescence(&next, -beta, -alpha, ply + 1);
    if (search_aborted) return 0;

    if (score >= beta) return beta;
    if (score > alpha) alpha = score;
  }

  if (in_check && legal_moves == 0) {
    return -MATE_SCORE + ply; // Checkmate in quiescence!
  }

  return alpha;
}

// Alpha-Beta Search with PVS, LMR, Null-Move, Killers, Countermove, and TT
static int alpha_beta(
    const Position* pos,
    int depth,
    int alpha,
    int beta,
    int ply,
    int use_quiescence,
    Move* out_pv,
    int* out_pv_len,
    int can_null,
    int prev_from,
    int prev_to
) {
  nodes_visited++;
  if ((nodes_visited & 4095) == 0) {
    if (search_time_limit > 0 && (get_time_ms() - search_start_time) >= search_time_limit) {
      search_aborted = 1;
      return 0;
    }
  }

  int original_alpha = alpha;
  uint64_t key = pos->key;
  int tt_idx = key & TT_MASK;
  TTEntry* entry = &tt[tt_idx];

  // 1. Probe Transposition Table
  if (entry->key == key && entry->depth >= depth && ply > 0) {
    tt_hits_count++;
    if (entry->flag == TT_EXACT) {
      if (entry->best_move.from != 0 || entry->best_move.to != 0) {
        out_pv[0] = entry->best_move;
        *out_pv_len = 1;
      }
      return entry->score;
    } else if (entry->flag == TT_LOWERBOUND) {
      if (entry->score > alpha) alpha = entry->score;
    } else if (entry->flag == TT_UPPERBOUND) {
      if (entry->score < beta) beta = entry->score;
    }
    if (alpha >= beta) {
      if (entry->best_move.from != 0 || entry->best_move.to != 0) {
        out_pv[0] = entry->best_move;
        *out_pv_len = 1;
      }
      return entry->score;
    }
  }

  int us = pos->turn;
  int in_check = is_in_check(pos, us);
  if (in_check && depth > 0) {
    depth++; // Check extension
  }

  // 2. Leaf evaluation / Quiescence
  if (depth <= 0) {
    *out_pv_len = 0;
    if (use_quiescence) {
      return quiescence(pos, alpha, beta, ply);
    }
    return evaluate(pos);
  }

  // 50-move rule
  if (ply > 0 && pos->halfmove_clock >= 100) {
    *out_pv_len = 0;
    return 0;
  }

  // 3. Null Move Pruning (Only if not in check, depth >= 3, and side to move has non-pawn material)
  int has_non_pawn_pieces = 0;
  for (int s = 0; s < 64; s++) {
    uint8_t pc = pos->board[s];
    if (pc != EMPTY && COLOR(pc) == us && TYPE(pc) != W_P && TYPE(pc) != W_K) {
      has_non_pawn_pieces = 1;
      break;
    }
  }

  if (can_null && !in_check && has_non_pawn_pieces && depth >= 3 && ply > 0) {
    int static_eval = evaluate(pos);
    if (static_eval >= beta) {
      Position null_pos;
      for (int i = 0; i < 64; i++) null_pos.board[i] = pos->board[i];
      null_pos.turn = (us == WHITE) ? BLACK : WHITE;
      null_pos.castling = pos->castling;
      null_pos.en_passant = -1;
      null_pos.halfmove_clock = pos->halfmove_clock + 1;
      null_pos.fullmove_number = pos->fullmove_number;
      null_pos.mg_score = pos->mg_score;
      null_pos.eg_score = pos->eg_score;
      null_pos.game_phase = pos->game_phase;
      null_pos.white_bishops = pos->white_bishops;
      null_pos.black_bishops = pos->black_bishops;
      null_pos.key = pos->key ^ z_turn;
      int old_ep = (pos->en_passant >= 0) ? (pos->en_passant % 8) : 8;
      null_pos.key ^= z_ep[old_ep] ^ z_ep[8];

      Move dummy_pv[PV_MAX];
      int dummy_len = 0;
      int null_score = -alpha_beta(&null_pos, depth - 1 - 2, -beta, -beta + 1, ply + 1, use_quiescence, dummy_pv, &dummy_len, 0, -1, -1);
      if (search_aborted) return 0;
      if (null_score >= beta) return beta;
    }
  }

  // 4. Generate Pseudo Moves
  Move moves[MAX_MOVES];
  int count = generate_pseudo_moves(pos, moves, 0);

  // Score moves
  Move tt_move = { 0, 0, 0, 0, 0, 0 };
  if (entry->key == key) {
    tt_move = entry->best_move;
  }
  int scores[MAX_MOVES];
  score_moves(pos, moves, scores, count, &tt_move, ply, prev_from, prev_to);

  int legal_moves = 0;
  int best_score = -MATE_SCORE * 2;
  Move best_move = { 0, 0, 0, 0, 0, 0 };
  Move child_pv[PV_MAX];
  int child_pv_len = 0;

  for (int i = 0; i < count; i++) {
    // Pick next highest scored move on-demand (Selection sort)
    pick_best_move(moves, scores, i, count);

    Position next;
    make_move(&next, pos, &moves[i]);
    if (is_in_check(&next, us)) continue; // Illegal move!

    legal_moves++;

    int score;
    int child_len = 0;
    Move cur_child_pv[PV_MAX];

    // Principal Variation Search (PVS) + Late Move Reductions (LMR)
    if (legal_moves == 1) {
      // PV move: search with full window
      score = -alpha_beta(&next, depth - 1, -beta, -alpha, ply + 1, use_quiescence, cur_child_pv, &child_len, 1, moves[i].from, moves[i].to);
    } else {
      int is_killer = (ply < MAX_PLY && (
        (moves[i].from == killer_moves[ply][0].from && moves[i].to == killer_moves[ply][0].to) ||
        (moves[i].from == killer_moves[ply][1].from && moves[i].to == killer_moves[ply][1].to)
      ));

      int reduction = 0;
      if (depth >= 3 && legal_moves >= 4 && moves[i].captured == EMPTY && !moves[i].promotion && !in_check && !is_killer) {
        reduction = (legal_moves >= 8) ? 2 : 1;
      }

      // Null window search
      score = -alpha_beta(&next, depth - 1 - reduction, -alpha - 1, -alpha, ply + 1, use_quiescence, cur_child_pv, &child_len, 1, moves[i].from, moves[i].to);

      // Re-search if reduced move beat alpha
      if (reduction > 0 && score > alpha) {
        score = -alpha_beta(&next, depth - 1, -alpha - 1, -alpha, ply + 1, use_quiescence, cur_child_pv, &child_len, 1, moves[i].from, moves[i].to);
      }

      // Full window re-search if null window search beat alpha
      if (score > alpha && score < beta) {
        score = -alpha_beta(&next, depth - 1, -beta, -alpha, ply + 1, use_quiescence, cur_child_pv, &child_len, 1, moves[i].from, moves[i].to);
      }
    }

    if (search_aborted) return 0;

    if (score > best_score) {
      best_score = score;
      best_move = moves[i];
      child_pv_len = child_len;
      for (int k = 0; k < child_len && k < PV_MAX - 1; k++) {
        child_pv[k] = cur_child_pv[k];
      }
    }

    if (score > alpha) {
      alpha = score;
      if (alpha >= beta) {
        // Beta Cutoff
        if (moves[i].captured == EMPTY && !(moves[i].flags & FLAG_EP)) {
          if (ply < MAX_PLY) {
            killer_moves[ply][1] = killer_moves[ply][0];
            killer_moves[ply][0] = moves[i];
          }
          if (prev_from >= 0 && prev_to >= 0) {
            counter_moves[prev_from][prev_to] = moves[i];
          }
          history_table[us][moves[i].from][moves[i].to] += depth * depth;
        }
        break; // Cutoff: no need to check legality or evaluate remaining moves!
      }
    }
  }

  // No legal moves
  if (legal_moves == 0) {
    *out_pv_len = 0;
    if (in_check) return -MATE_SCORE + ply; // Checkmate
    return 0; // Stalemate
  }

  // 5. Store in Transposition Table
  uint8_t flag = TT_EXACT;
  if (best_score <= original_alpha) flag = TT_UPPERBOUND;
  else if (best_score >= beta) flag = TT_LOWERBOUND;

  if (entry->key == 0 || entry->depth <= depth) {
    entry->key = key;
    entry->depth = (int16_t)depth;
    entry->score = (int32_t)best_score;
    entry->flag = flag;
    entry->best_move = best_move;
  }

  out_pv[0] = best_move;
  *out_pv_len = 1 + child_pv_len;
  if (*out_pv_len > PV_MAX) *out_pv_len = PV_MAX;
  for (int k = 0; k < child_pv_len && (k + 1) < PV_MAX; k++) {
    out_pv[k + 1] = child_pv[k];
  }

  return best_score;
}

// Engine Search API with Iterative Deepening and Aspiration Windows
void engine_search(int max_depth, int time_limit_ms, int use_quiescence) {
  nodes_visited = 0;
  search_aborted = 0;
  tt_hits_count = 0;
  search_start_time = get_time_ms();
  search_time_limit = time_limit_ms;
  search_depth_reached = 0;
  pv_length = 0;

  Position root_pos = current_pos;

  int current_score = 0;
  Move root_pv[PV_MAX];
  int root_pv_len = 0;

  for (int d = 1; d <= max_depth; d++) {
    int alpha = -MATE_SCORE;
    int beta = MATE_SCORE;
    int delta = 35;

    // Aspiration Windows for depth >= 4
    if (d >= 4 && current_score > -MATE_SCORE + 1000 && current_score < MATE_SCORE - 1000) {
      alpha = current_score - delta;
      beta = current_score + delta;
    }

    while (1) {
      int score = alpha_beta(&root_pos, d, alpha, beta, 0, use_quiescence, root_pv, &root_pv_len, 0, -1, -1);
      if (search_aborted) break;

      if (score <= alpha) {
        alpha = -MATE_SCORE; // Fail low: widen negative window
      } else if (score >= beta) {
        beta = MATE_SCORE;  // Fail high: widen positive window
      } else {
        current_score = score;
        break;
      }
    }

    if (search_aborted) break;

    search_depth_reached = d;
    best_score_found = current_score;
    if (root_pv_len > 0) {
      best_move_found = root_pv[0];
      pv_length = root_pv_len;
      for (int i = 0; i < root_pv_len; i++) {
        pv_line[i] = root_pv[i];
      }
    }

    // Stop if mate is found
    if (current_score >= MATE_SCORE - 100 || current_score <= -MATE_SCORE + 100) {
      break;
    }

    // Time budget check
    if (time_limit_ms > 0) {
      int elapsed = get_time_ms() - search_start_time;
      if (elapsed >= (time_limit_ms * 6) / 10) {
        break; // don't start next iteration if more than 60% time used
      }
    }
  }
}

void engine_stop(void) {
  search_aborted = 1;
}

// FEN Parser
int engine_set_fen(const char* fen) {
  for (int i = 0; i < 64; i++) current_pos.board[i] = EMPTY;
  current_pos.turn = WHITE;
  current_pos.castling = 0;
  current_pos.en_passant = -1;
  current_pos.halfmove_clock = 0;
  current_pos.fullmove_number = 1;

  int sq = 0;
  const char* p = fen;

  // 1. Piece placement
  while (*p && *p != ' ') {
    if (*p == '/') {
      p++;
      continue;
    }
    if (*p >= '1' && *p <= '8') {
      sq += (*p - '0');
    } else {
      uint8_t piece = EMPTY;
      switch (*p) {
        case 'P': piece = W_P; break;
        case 'N': piece = W_N; break;
        case 'B': piece = W_B; break;
        case 'R': piece = W_R; break;
        case 'Q': piece = W_Q; break;
        case 'K': piece = W_K; break;
        case 'p': piece = B_P; break;
        case 'n': piece = B_N; break;
        case 'b': piece = B_B; break;
        case 'r': piece = B_R; break;
        case 'q': piece = B_Q; break;
        case 'k': piece = B_K; break;
      }
      if (sq < 64) current_pos.board[sq++] = piece;
    }
    p++;
  }

  // 2. Turn
  if (*p == ' ') p++;
  if (*p == 'b') current_pos.turn = BLACK;
  else current_pos.turn = WHITE;
  if (*p) p++;

  // 3. Castling rights
  if (*p == ' ') p++;
  while (*p && *p != ' ') {
    if (*p == 'K') current_pos.castling |= CASTLE_WK;
    else if (*p == 'Q') current_pos.castling |= CASTLE_WQ;
    else if (*p == 'k') current_pos.castling |= CASTLE_BK;
    else if (*p == 'q') current_pos.castling |= CASTLE_BQ;
    p++;
  }

  // 4. En passant
  if (*p == ' ') p++;
  if (*p != '-' && *p >= 'a' && *p <= 'h') {
    int file = *p - 'a';
    p++;
    if (*p >= '1' && *p <= '8') {
      int rank = 8 - (*p - '0');
      current_pos.en_passant = rank * 8 + file;
      p++;
    }
  }

  // Initial full scoring
  init_position_scores(&current_pos);
  return 1;
}

void engine_get_fen(char* out_fen) {
  int idx = 0;
  for (int r = 0; r < 8; r++) {
    int empty_run = 0;
    for (int c = 0; c < 8; c++) {
      uint8_t p = current_pos.board[r * 8 + c];
      if (p == EMPTY) {
        empty_run++;
      } else {
        if (empty_run > 0) {
          out_fen[idx++] = '0' + empty_run;
          empty_run = 0;
        }
        static const char p_chars[13] = " PNBRQKpnbrqk";
        out_fen[idx++] = p_chars[p];
      }
    }
    if (empty_run > 0) out_fen[idx++] = '0' + empty_run;
    if (r < 7) out_fen[idx++] = '/';
  }

  out_fen[idx++] = ' ';
  out_fen[idx++] = (current_pos.turn == WHITE) ? 'w' : 'b';
  out_fen[idx++] = ' ';

  if (current_pos.castling == 0) {
    out_fen[idx++] = '-';
  } else {
    if (current_pos.castling & CASTLE_WK) out_fen[idx++] = 'K';
    if (current_pos.castling & CASTLE_WQ) out_fen[idx++] = 'Q';
    if (current_pos.castling & CASTLE_BK) out_fen[idx++] = 'k';
    if (current_pos.castling & CASTLE_BQ) out_fen[idx++] = 'q';
  }

  out_fen[idx++] = ' ';
  if (current_pos.en_passant == -1) {
    out_fen[idx++] = '-';
  } else {
    out_fen[idx++] = 'a' + (current_pos.en_passant % 8);
    out_fen[idx++] = '8' - (current_pos.en_passant / 8);
  }
  out_fen[idx] = '\0';
}

// Result Getters
int engine_get_best_from(void)      { return best_move_found.from; }
int engine_get_best_to(void)        { return best_move_found.to; }
int engine_get_best_piece(void)     { return best_move_found.piece; }
int engine_get_best_captured(void)  { return best_move_found.captured; }
int engine_get_best_promotion(void) { return best_move_found.promotion; }
int engine_get_best_flags(void)     { return best_move_found.flags; }
int engine_get_score(void)          { return best_score_found; }
int engine_get_nodes(void)          { return nodes_visited; }
int engine_get_depth(void)          { return search_depth_reached; }
int engine_get_tt_hits(void)        { return tt_hits_count; }

int engine_get_time_ms(void) {
  int elapsed = get_time_ms() - search_start_time;
  return elapsed <= 0 ? 1 : elapsed;
}

int engine_get_nps(void) {
  int ms = engine_get_time_ms();
  return (int)(((int64_t)nodes_visited * 1000) / ms);
}

int engine_get_pv_length(void) {
  return pv_length;
}

void engine_get_pv_move(int index, int* out_from, int* out_to, int* out_promo) {
  if (index >= 0 && index < pv_length) {
    *out_from = pv_line[index].from;
    *out_to = pv_line[index].to;
    *out_promo = pv_line[index].promotion;
  } else {
    *out_from = 0;
    *out_to = 0;
    *out_promo = 0;
  }
}

int engine_evaluate_current(void) {
  return evaluate(&current_pos);
}

// Dedicated safe scratch buffers for WASM / JS interop (no overlapping memory corruption!)
static char fen_input_buffer[512];
static int pv_scratch_buffer[8];

char* engine_get_fen_buffer(void) {
  return fen_input_buffer;
}

int* engine_get_scratch_buffer(void) {
  return pv_scratch_buffer;
}

int engine_load_fen_buffer(void) {
  return engine_set_fen(fen_input_buffer);
}

