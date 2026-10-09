#include <stdio.h>
#include <stdlib.h>
#include "engine.h"

static const char* start_fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
static const char* kiwipete_fen = "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1";
static const char* endgame_fen = "8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1";

static void run_test(const char* name, const char* fen, int depth) {
  printf("============================================================\n");
  printf("TEST: %s (Depth %d)\n", name, depth);
  printf("FEN: %s\n", fen);
  
  engine_reset();
  engine_set_fen(fen);

  engine_search(depth, 0, 1);

  int nodes = engine_get_nodes();
  int time_ms = engine_get_time_ms();
  int nps = engine_get_nps();
  int score = engine_get_score();
  int tt_hits = engine_get_tt_hits();
  int from = engine_get_best_from();
  int to = engine_get_best_to();
  int promo = engine_get_best_promotion();

  char promo_c = ' ';
  if (promo == W_Q) promo_c = 'q';
  else if (promo == W_R) promo_c = 'r';
  else if (promo == W_B) promo_c = 'b';
  else if (promo == W_N) promo_c = 'n';

  char best_uci[6];
  best_uci[0] = 'a' + (from % 8);
  best_uci[1] = '8' - (from / 8);
  best_uci[2] = 'a' + (to % 8);
  best_uci[3] = '8' - (to / 8);
  if (promo_c != ' ') {
    best_uci[4] = promo_c;
    best_uci[5] = '\0';
  } else {
    best_uci[4] = '\0';
  }

  printf("Best Move (UCI): %s\n", best_uci);
  printf("Score:           %d cp\n", score);
  printf("Nodes:           %d\n", nodes);
  printf("Time:            %d ms\n", time_ms);
  printf("Speed (NPS):     %d NPS (%0.2f M nodes/sec)\n", nps, (double)nps / 1000000.0);
  printf("TT Hits:         %d\n", tt_hits);
  printf("PV Line:         ");
  int pv_len = engine_get_pv_length();
  for (int i = 0; i < pv_len && i < 8; i++) {
    int pf, pt, pp;
    engine_get_pv_move(i, &pf, &pt, &pp);
    printf("%c%c%c%c ", 'a' + (pf % 8), '8' - (pf / 8), 'a' + (pt % 8), '8' - (pt / 8));
  }
  printf("\n");
}

int main(void) {
  printf("############################################################\n");
  printf("#           C CHESS ENGINE BENCHMARK (NATIVE -O3)          #\n");
  printf("############################################################\n\n");

  engine_init();

  run_test("1. Starting Position", start_fen, 6);
  run_test("2. Tactical Kiwipete", kiwipete_fen, 5);
  run_test("3. Rook Endgame", endgame_fen, 6);

  printf("\nBenchmark complete.\n");
  return 0;
}
