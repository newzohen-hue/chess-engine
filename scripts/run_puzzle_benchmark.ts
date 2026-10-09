/**
 * Comprehensive Benchmark Suite: Our Chess Engine vs Stockfish 19
 * Evaluates tactical strength on official Lichess puzzles under identical time controls.
 */

import fs from 'fs';
import { spawn } from 'child_process';
import { parseFEN, makeMove, toFEN } from '../src/engine/chessRules';
import { WasmChessSearchEngine } from '../src/engine/wasmEngine';
import { uciStringToMove, moveToUciString } from '../src/engine/openingBook';

interface Puzzle {
  id: string;
  fen: string;
  setupMove: string;
  targetMove: string;
  allMoves: string[];
  rating: number;
  themes: string;
}

class StockfishRunner {
  private proc: any;
  private resolveMove: ((m: string) => void) | null = null;
  private buffer = '';

  constructor(private binPath: string) {}

  public async init(): Promise<void> {
    this.proc = spawn(this.binPath);
    this.proc.stdout.on('data', (chunk: Buffer) => {
      this.buffer += chunk.toString();
      const lines = this.buffer.split('\n');
      this.buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('bestmove ')) {
          const move = line.split(' ')[1];
          if (this.resolveMove) {
            const cb = this.resolveMove;
            this.resolveMove = null;
            cb(move);
          }
        }
      }
    });

    await this.sendReady();
  }

  private sendReady(): Promise<void> {
    return new Promise((res) => {
      const onData = (data: Buffer) => {
        if (data.toString().includes('readyok')) {
          this.proc.stdout.off('data', onData);
          res();
        }
      };
      this.proc.stdout.on('data', onData);
      this.proc.stdin.write('uci\nisready\n');
    });
  }

  public query(fen: string, movetimeMs: number): Promise<string> {
    return new Promise((resolve) => {
      this.resolveMove = resolve;
      this.proc.stdin.write(`position fen ${fen}\ngo movetime ${movetimeMs}\n`);
    });
  }

  public stop(): void {
    if (this.proc) {
      try {
        this.proc.stdin.write('quit\n');
        this.proc.kill();
      } catch {
        // ignore
      }
    }
  }
}

async function runBenchmark() {
  const csvPath = 'lichess_db_puzzle_sampled.csv';
  if (!fs.existsSync(csvPath)) {
    console.error(`File ${csvPath} not found!`);
    process.exit(1);
  }

  const fileContent = fs.readFileSync(csvPath, 'utf8');
  const lines = fileContent.trim().split('\n').slice(1); // skip header

  const puzzles: Puzzle[] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    const parts = line.split(',');
    if (parts.length < 4) continue;

    const id = parts[0];
    const fen = parts[1];
    const moves = parts[2].trim().split(' ');
    const rating = parseInt(parts[3]) || 1500;
    const themes = parts[7] || '';

    if (moves.length >= 2) {
      puzzles.push({
        id,
        fen,
        setupMove: moves[0],
        targetMove: moves[1],
        allMoves: moves,
        rating,
        themes,
      });
    }
    if (puzzles.length >= 100) break;
  }

  console.log(`================================================================================`);
  console.log(`        CHESS ENGINE TACTICAL BENCHMARK: OUR ENGINE vs STOCKFISH 19            `);
  console.log(`================================================================================`);
  console.log(`Total Puzzles Loaded: ${puzzles.length}`);
  const avgRating = Math.round(puzzles.reduce((a, b) => a + b.rating, 0) / puzzles.length);
  console.log(`Average Puzzle Rating: ${avgRating} ELO`);
  const MOVETIME_MS = 300; // 300ms per puzzle for equal, deterministic comparison
  console.log(`Time Limit per Puzzle: ${MOVETIME_MS} ms\n`);

  // Initialize Engines
  const sfRunner = new StockfishRunner('./stockfish/stockfish-linux-x86-64-universal');
  await sfRunner.init();

  const ourEngine = new WasmChessSearchEngine();
  await ourEngine.init();

  let ourSolved = 0;
  let sfSolved = 0;
  let ourTotalTime = 0;
  let sfTotalTime = 0;
  let ourTotalNodes = 0;

  // Breakdown by rating tier (<1500, 1500-2000, 2000+)
  const tiers = {
    easy: { count: 0, ourSolved: 0, sfSolved: 0 },
    medium: { count: 0, ourSolved: 0, sfSolved: 0 },
    hard: { count: 0, ourSolved: 0, sfSolved: 0 },
  };

  const resultsTable: any[] = [];

  for (let i = 0; i < puzzles.length; i++) {
    const p = puzzles[i];
    const startState = parseFEN(p.fen);
    const m0 = uciStringToMove(startState, p.setupMove);
    if (!m0) continue;
    const puzzlePos = makeMove(startState, m0);
    const puzzleFen = toFEN(puzzlePos);

    // 1. Stockfish 19
    const sfStart = Date.now();
    const sfMove = await sfRunner.query(puzzleFen, MOVETIME_MS);
    const sfTime = Date.now() - sfStart;
    sfTotalTime += sfTime;
    const sfCorrect = sfMove === p.targetMove;
    if (sfCorrect) sfSolved++;

    // 2. Our Engine
    const ourStart = Date.now();
    ourEngine.clearTT();
    const ourRes = await ourEngine.search(puzzlePos, {
      maxDepth: 10,
      timeLimitMs: MOVETIME_MS,
      useQuiescence: true,
    });
    const ourTime = Date.now() - ourStart;
    ourTotalTime += ourTime;
    ourTotalNodes += ourRes.nodes;
    const ourMove = ourRes.bestMove ? moveToUciString(ourRes.bestMove) : '';
    const ourCorrect = ourMove === p.targetMove;
    if (ourCorrect) ourSolved++;

    // Tier tracking
    let tierKey: 'easy' | 'medium' | 'hard' = 'medium';
    if (p.rating < 1500) tierKey = 'easy';
    else if (p.rating >= 2000) tierKey = 'hard';

    tiers[tierKey].count++;
    if (ourCorrect) tiers[tierKey].ourSolved++;
    if (sfCorrect) tiers[tierKey].sfSolved++;

    resultsTable.push({
      idx: i + 1,
      id: p.id,
      rating: p.rating,
      target: p.targetMove,
      ourMove,
      ourOk: ourCorrect ? '✓' : '✗',
      sfMove,
      sfOk: sfCorrect ? '✓' : '✗',
    });

    if ((i + 1) % 10 === 0 || i === puzzles.length - 1) {
      process.stdout.write(`Processed ${i + 1}/${puzzles.length} puzzles... (Our: ${ourSolved} solved, SF: ${sfSolved} solved)\r`);
    }
  }

  sfRunner.stop();
  console.log('\n\n================================================================================');
  console.log('                            FINAL BENCHMARK RESULTS                             ');
  console.log('================================================================================\n');

  console.log(`METRIC                    | OUR CHESS ENGINE       | STOCKFISH 19 (BENCHMARK)`);
  console.log(`--------------------------+------------------------+-------------------------`);
  console.log(`Total Puzzles Tested      | ${puzzles.length.toString().padEnd(22)} | ${puzzles.length.toString().padEnd(23)}`);
  console.log(`Puzzles Solved            | ${ourSolved.toString().padEnd(22)} | ${sfSolved.toString().padEnd(23)}`);
  console.log(`Accuracy (%)              | ${((ourSolved / puzzles.length) * 100).toFixed(1)}%`.padEnd(27) + `| ${((sfSolved / puzzles.length) * 100).toFixed(1)}%`.padEnd(26));
  console.log(`Average Time per Puzzle   | ${(ourTotalTime / puzzles.length).toFixed(0)} ms`.padEnd(27) + `| ${(sfTotalTime / puzzles.length).toFixed(0)} ms`.padEnd(26));
  console.log(`Average Nodes per Puzzle  | ${(ourTotalNodes / puzzles.length).toFixed(0)} nodes`.padEnd(27) + `| N/A (UCI)`);

  console.log(`\nACCURACY BY RATING TIER:`);
  console.log(`- Easy (<1500 ELO):      Our: ${tiers.easy.ourSolved}/${tiers.easy.count} (${tiers.easy.count > 0 ? ((tiers.easy.ourSolved / tiers.easy.count) * 100).toFixed(0) : 0}%) | SF 19: ${tiers.easy.sfSolved}/${tiers.easy.count} (${tiers.easy.count > 0 ? ((tiers.easy.sfSolved / tiers.easy.count) * 100).toFixed(0) : 0}%)`);
  console.log(`- Medium (1500-2000 ELO): Our: ${tiers.medium.ourSolved}/${tiers.medium.count} (${tiers.medium.count > 0 ? ((tiers.medium.ourSolved / tiers.medium.count) * 100).toFixed(0) : 0}%) | SF 19: ${tiers.medium.sfSolved}/${tiers.medium.count} (${tiers.medium.count > 0 ? ((tiers.medium.sfSolved / tiers.medium.count) * 100).toFixed(0) : 0}%)`);
  console.log(`- Hard (2000+ ELO):       Our: ${tiers.hard.ourSolved}/${tiers.hard.count} (${tiers.hard.count > 0 ? ((tiers.hard.ourSolved / tiers.hard.count) * 100).toFixed(0) : 0}%) | SF 19: ${tiers.hard.sfSolved}/${tiers.hard.count} (${tiers.hard.count > 0 ? ((tiers.hard.sfSolved / tiers.hard.count) * 100).toFixed(0) : 0}%)`);

  // Write detailed markdown report
  let md = `# Tactical Puzzle Benchmark Report: Our Engine vs Stockfish 19\n\n`;
  md += `**Date:** ${new Date().toISOString()}\n`;
  md += `**Dataset:** Lichess Official Puzzle Database (100 Sampled Puzzles)\n`;
  md += `**Time Control:** ${MOVETIME_MS} ms per puzzle\n\n`;
  md += `## Summary Table\n\n`;
  md += `| Metric | Our Chess Engine | Stockfish 19 |\n`;
  md += `| :--- | :--- | :--- |\n`;
  md += `| **Puzzles Solved** | **${ourSolved} / ${puzzles.length}** | **${sfSolved} / ${puzzles.length}** |\n`;
  md += `| **Tactical Accuracy** | **${((ourSolved / puzzles.length) * 100).toFixed(1)}%** | **${((sfSolved / puzzles.length) * 100).toFixed(1)}%** |\n`;
  md += `| **Avg Speed per Move** | ${(ourTotalTime / puzzles.length).toFixed(0)} ms | ${(sfTotalTime / puzzles.length).toFixed(0)} ms |\n\n`;
  md += `## Breakdown by Rating Tier\n\n`;
  md += `- **Easy (<1500 ELO):** Our Engine: ${tiers.easy.ourSolved}/${tiers.easy.count} (${tiers.easy.count > 0 ? ((tiers.easy.ourSolved / tiers.easy.count) * 100).toFixed(0) : 0}%) | SF 19: ${tiers.easy.sfSolved}/${tiers.easy.count}\n`;
  md += `- **Medium (1500-2000 ELO):** Our Engine: ${tiers.medium.ourSolved}/${tiers.medium.count} (${tiers.medium.count > 0 ? ((tiers.medium.ourSolved / tiers.medium.count) * 100).toFixed(0) : 0}%) | SF 19: ${tiers.medium.sfSolved}/${tiers.medium.count}\n`;
  md += `- **Hard (2000+ ELO):** Our Engine: ${tiers.hard.ourSolved}/${tiers.hard.count} (${tiers.hard.count > 0 ? ((tiers.hard.ourSolved / tiers.hard.count) * 100).toFixed(0) : 0}%) | SF 19: ${tiers.hard.sfSolved}/${tiers.hard.count}\n\n`;
  md += `## Sample Individual Puzzle Results\n\n`;
  md += `| # | Puzzle ID | Rating | Target Move | Our Engine | Result | Stockfish 19 | Result |\n`;
  md += `| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n`;
  for (const r of resultsTable.slice(0, 30)) {
    md += `| ${r.idx} | ${r.id} | ${r.rating} | \`${r.target}\` | \`${r.ourMove}\` | ${r.ourOk} | \`${r.sfMove}\` | ${r.sfOk} |\n`;
  }

  fs.writeFileSync('BENCHMARK_REPORT.md', md, 'utf8');
  console.log(`\nDetailed report saved to: BENCHMARK_REPORT.md\n`);
}

runBenchmark().catch((err) => {
  console.error('Benchmark fatal error:', err);
  process.exit(1);
});
