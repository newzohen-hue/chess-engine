/**
 * Exact Neural Network Specification & Training Metadata for the NNUE model.
 *
 * Ground truth from Kaggle training and serialization logs:
 * - Dataset: T80.oct2022.bestmove.binpack (linrock)
 * - Architecture: HalfKAv2_hm^ (L1: 1024, L2: 15, L3: 32)
 * - Epochs: 13 trained (100,000,000 positions/epoch in nnue-pytorch)
 * - Total training volume: 1,300,000,000 (1.3B) positions
 */

export interface NnueModelMetadata {
  modelName: string;
  features: string;
  inputFeaturesCount: number;
  l1: number;
  l2: number;
  l3: number;
  outputBuckets: number;
  dataset: string;
  datasetShort: string;
  batchSize: number;
  trainedEpochs: number;
  maxEpochs: number;
  positionsPerEpoch: number;
  totalPositionsSeen: number;
  totalPositionsFormatted: string;
  trainCommand: string;
  serializeCommand: string;
}

export const NNUE_MODEL_INFO: NnueModelMetadata = {
  modelName: 'final_model.nnue',
  features: 'HalfKAv2_hm^',
  inputFeaturesCount: 22528,
  l1: 1024,
  l2: 15,
  l3: 32,
  outputBuckets: 8,
  dataset: '/kaggle/input/datasets/linrock/nn-335a9b2d8a80-t80-oct2022-bestmove/T80.oct2022.bestmove.binpack',
  datasetShort: 'T80.oct2022.bestmove.binpack (linrock)',
  batchSize: 16384,
  trainedEpochs: 13,
  maxEpochs: 20,
  positionsPerEpoch: 100_000_000,
  totalPositionsSeen: 1_300_000_000,
  totalPositionsFormatted: '1.3 млрд (1,300,000,000) позиций',
  trainCommand: `!python train.py \\
  /kaggle/input/datasets/linrock/nn-335a9b2d8a80-t80-oct2022-bestmove/T80.oct2022.bestmove.binpack \\
  --features "HalfKAv2_hm^" \\
  --l1 1024 \\
  --l2 15 \\
  --l3 32 \\
  --batch-size 16384 \\
  --max-epochs 20 \\
  --default-root-dir /kaggle/working/nnue_output`,
  serializeCommand: `!python serialize.py \\
  /kaggle/working/nnue_output/lightning_logs/version_1/checkpoints/last.ckpt \\
  /kaggle/working/final_model.nnue \\
  --features "HalfKAv2_hm^" \\
  --l1 1024 \\
  --l2 15 \\
  --l3 32`,
};
