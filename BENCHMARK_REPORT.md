# Tactical Puzzle Benchmark Report: Our Engine vs Stockfish 19

**Date:** 2026-10-09T16:14:47.944Z
**Dataset:** Lichess Official Puzzle Database (100 Sampled Puzzles)
**Time Control:** 300 ms per puzzle

## Summary Table

| Metric | Our Chess Engine | Stockfish 19 |
| :--- | :--- | :--- |
| **Puzzles Solved** | **91 / 100** | **100 / 100** |
| **Tactical Accuracy** | **91.0%** | **100.0%** |
| **Avg Speed per Move** | 137 ms | 223 ms |

## Breakdown by Rating Tier

- **Easy (<1500 ELO):** Our Engine: 53/54 (98%) | SF 19: 54/54
- **Medium (1500-2000 ELO):** Our Engine: 24/26 (92%) | SF 19: 26/26
- **Hard (2000+ ELO):** Our Engine: 14/20 (70%) | SF 19: 20/20

## Sample Individual Puzzle Results

| # | Puzzle ID | Rating | Target Move | Our Engine | Result | Stockfish 19 | Result |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | 00008 | 1811 | `e6e7` | `e6e7` | ✓ | `e6e7` | ✓ |
| 2 | 0000D | 1529 | `f8d8` | `f8d8` | ✓ | `f8d8` | ✓ |
| 3 | 0000H | 1554 | `d5g2` | `d5g2` | ✓ | `d5g2` | ✓ |
| 4 | 0008Q | 1383 | `f5e5` | `f5e5` | ✓ | `f5e5` | ✓ |
| 5 | 0009B | 1084 | `e2g4` | `e2g4` | ✓ | `e2g4` | ✓ |
| 6 | 000Pw | 1530 | `d4e2` | `d4e2` | ✓ | `d4e2` | ✓ |
| 7 | 000Sa | 1476 | `e4c2` | `e4c2` | ✓ | `e4c2` | ✓ |
| 8 | 000VW | 2873 | `d5c5` | `d5f5` | ✗ | `d5c5` | ✓ |
| 9 | 000Vc | 1569 | `g6h5` | `g6h5` | ✓ | `g6h5` | ✓ |
| 10 | 000Zo | 1363 | `e8e1` | `e8e1` | ✓ | `e8e1` | ✓ |
| 11 | 000aY | 1412 | `a5c3` | `a5c3` | ✓ | `a5c3` | ✓ |
| 12 | 000c8 | 1478 | `h4e1` | `h4e1` | ✓ | `h4e1` | ✓ |
| 13 | 000h0 | 2048 | `f6f3` | `f6f3` | ✓ | `f6f3` | ✓ |
| 14 | 000hf | 1391 | `e2e6` | `e2e6` | ✓ | `e2e6` | ✓ |
| 15 | 000jr | 2152 | `f5d5` | `f5d5` | ✓ | `f5d5` | ✓ |
| 16 | 000lC | 1356 | `d7d6` | `d7d6` | ✓ | `d7d6` | ✓ |
| 17 | 000mr | 1943 | `f7f4` | `f7f4` | ✓ | `f7f4` | ✓ |
| 18 | 000o3 | 959 | `d3d4` | `d3d4` | ✓ | `d3d4` | ✓ |
| 19 | 000pA | 1162 | `f8b8` | `f8b8` | ✓ | `f8b8` | ✓ |
| 20 | 000qP | 2167 | `f4f3` | `f4f3` | ✓ | `f4f3` | ✓ |
| 21 | 000rO | 1110 | `e5c7` | `e5c7` | ✓ | `e5c7` | ✓ |
| 22 | 000rZ | 662 | `d6h2` | `d6h2` | ✓ | `d6h2` | ✓ |
| 23 | 00143 | 1797 | `d1h5` | `d1h5` | ✓ | `d1h5` | ✓ |
| 24 | 0017R | 1655 | `d3c4` | `d3c4` | ✓ | `d3c4` | ✓ |
| 25 | 0018P | 1903 | `f8e8` | `f8e8` | ✓ | `f8e8` | ✓ |
| 26 | 0018S | 2608 | `d4a1` | `d4a1` | ✓ | `d4a1` | ✓ |
| 27 | 001Fg | 1256 | `d4e2` | `d4e2` | ✓ | `d4e2` | ✓ |
| 28 | 001Hi | 2391 | `f4f6` | `f4d4` | ✗ | `f4f6` | ✓ |
| 29 | 001KR | 563 | `f1f8` | `d1d8` | ✗ | `f1f8` | ✓ |
| 30 | 001Oo | 2078 | `a2a4` | `a2a4` | ✓ | `a2a4` | ✓ |
