#!/bin/bash
set -e

echo "=== Building C Chess Engine ==="

# 1. Native Binary with -O3 -march=native
clang -O3 -Wall -Wextra -Werror ./src/engine/c_engine/engine.c ./src/engine/c_engine/benchmark.c -o ./src/engine/c_engine/c_benchmark
echo "✓ Native C binary compiled: ./src/engine/c_engine/c_benchmark"

# 2. WebAssembly Module with -O3 -flto
clang --target=wasm32 -O3 -flto -nostdlib -Wl,--no-entry -Wl,--export-all -Wl,--allow-undefined -o ./public/chess_engine.wasm ./src/engine/c_engine/engine.c
echo "✓ WebAssembly module compiled: ./public/chess_engine.wasm ($(wc -c < ./public/chess_engine.wasm) bytes)"

echo "=== Build Complete ==="
