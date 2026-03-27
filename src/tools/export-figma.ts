import { z } from 'zod';
import { exportFigmaFrames } from '../services/figma-api.js';

export const exportFigmaSchema = z.object({
  fileKey: z.string().describe('File key do Figma (segmento apos /design/ na URL)'),
  nodeIds: z.array(z.string()).describe('Node IDs para exportar (ex: ["1038:6", "1038:16"])'),
  prefix: z.string().describe('Prefixo dos arquivos exportados (ex: "2026-03-17-Stark")'),
  scale: z.number().optional().default(2).describe('Escala do export (default: 2)'),
  outputDir: z.string().optional().default('/tmp/figma_exports').describe('Diretorio de saida'),
});

export type ExportFigmaInput = z.infer<typeof exportFigmaSchema>;

export async function handleExportFigma(input: ExportFigmaInput) {
  const result = await exportFigmaFrames({
    fileKey: input.fileKey,
    nodeIds: input.nodeIds,
    prefix: input.prefix,
    scale: input.scale,
    outputDir: input.outputDir,
  });

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}
