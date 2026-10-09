#ifndef CHESS_ENGINE_H
#define CHESS_ENGINE_H

#include <stdint.h>

#define WHITE 0
#define BLACK 1

#define EMPTY 0
#define W_P 1
#define W_N 2
#define W_B 3
#define W_R 4
#define W_Q 5
#define W_K 6

#define B_P 7
#define B_N 8
#define B_B 9
#define B_R 10
#define B_Q 11
#define B_K 12

#define COLOR(p) ((p) > 6 ? BLACK : WHITE)
#define TYPE(p)  ((p) > 6 ? (p) - 6 : (p))

#define CASTLE_WK 1
#define CASTLE_WQ 2
#define CASTLE_BK 4
#define CASTLE_BQ 8

#define FLAG_EP 1
#define FLAG_CASTLE 2

#define MAX_MOVES 256
#define MAX_PLY 64
#define MATE_SCORE 100000

typedef struct {
  uint8_t from;
  uint8_t to;
  uint8_t piece;
  uint8_t captured;
  uint8_t promotion;
  uint8_t flags;
} Move;

typedef struct {
  uint8_t board[64];
  uint8_t turn;
  uint8_t castling;
  int8_t en_passant;
  uint16_t halfmove_clock;
  uint16_t fullmove_number;
  uint64_t key;
  int32_t mg_score;
  int32_t eg_score;
  int8_t game_phase;
  uint8_t white_bishops;
  uint8_t black_bishops;
} Position;

typedef struct {
  uint64_t key;
  int16_t depth;
  int32_t score;
  uint8_t flag;
  Move best_move;
} TTEntry;

#define TT_EXACT 0
#define TT_LOWERBOUND 1
#define TT_UPPERBOUND 2

#define TT_SIZE (1 << 18) // 262,144 entries (~6.3 MB)
#define TT_MASK (TT_SIZE - 1)

// Engine API
void engine_init(void);
void engine_reset(void);
int engine_set_fen(const char* fen);
void engine_get_fen(char* out_fen);
char* engine_get_fen_buffer(void);
int* engine_get_scratch_buffer(void);
int engine_load_fen_buffer(void);
void engine_search(int max_depth, int time_limit_ms, int use_quiescence);
void engine_stop(void);

// Result getters
int engine_get_best_from(void);
int engine_get_best_to(void);
int engine_get_best_piece(void);
int engine_get_best_captured(void);
int engine_get_best_promotion(void);
int engine_get_best_flags(void);
int engine_get_score(void);
int engine_get_nodes(void);
int engine_get_time_ms(void);
int engine_get_nps(void);
int engine_get_depth(void);
int engine_get_tt_hits(void);
int engine_get_pv_length(void);
void engine_get_pv_move(int index, int* out_from, int* out_to, int* out_promo);
int engine_evaluate_current(void);

// Internal functions
int generate_pseudo_moves(const Position* pos, Move* moves, int captures_only);
int generate_legal_moves(const Position* pos, Move* moves, int captures_only);
int is_in_check(const Position* pos, int color);
void make_move(Position* next, const Position* pos, const Move* move);
int evaluate(const Position* pos);

#endif // CHESS_ENGINE_H
