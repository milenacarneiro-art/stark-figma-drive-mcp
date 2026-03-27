import { z } from 'zod';
import { exportFigmaFrames } from '../services/figma-api.js';
import { uploadToDrive } from '../services/drive-api.js';

export const fullPipelineSchema = z.object({
  fileKey: z.string().describe('File key do Figma'),
  nodeIds: z.array(z.string()).describe('Node IDs para exportar'),
  frameName: z.string().describe('Nome do frame no formato "[DATA] - [NOME]" (ex: "2026-03-17 - Stark")'),
  scale: z.number().optional().default(2).describe('Escala do export (default: 2)'),
  credentialsPath: z.string().optional().describe('Caminho para o arquivo credentials.json do Google'),
});

export type FullPipelineInput = z.infer<typeof fullPipelineSchema>;

function parseFrameName(frameName: string): { date: string; clientName: string } {
  const sepIndex = frameName.indexOf(' - ');
  if (sepIndex === -1) {
    throw new Error(
      `Nome do frame nao segue o padrao "[DATA] - [NOME]": "${frameName}". ` +
      'Exemplo valido: "2026-03-17 - Stark"'
    );
  }
  const date = frameName.substring(0, sepIndex).trim();
  const clientName = frameName.substring(sepIndex + 3).trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`Data invalida no nome do frame: "${date}". Use formato YYYY-MM-DD.`);
  }

  return { date, clientName };
}

export async function handleFullPipeline(input: FullPipelineInput) {
  const { date, clientName } = parseFrameName(input.frameName);
  const prefix = `${date}-${clientName}`;

  // Step 1: Export from Figma
  const exportResult = await exportFigmaFrames({
    fileKey: input.fileKey,
    nodeIds: input.nodeIds,
    prefix,
    scale: input.scale,
  });

  if (exportResult.totalDownloaded === 0) {
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            error: 'Nenhum frame exportado do Figma.',
            export: exportResult,
          }, null, 2),
        },
      ],
    };
  }

  // Step 2: Upload to Drive
  const filePaths = exportResult.files.map((f) => f.path);
  const uploadResult = await uploadToDrive({
    clientName,
    date,
    files: filePaths,
    credentialsPath: input.credentialsPath,
  });

  const result = {
    frameName: input.frameName,
    date,
    clientName,
    export: exportResult,
    upload: uploadResult,
  };

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}
