import { z } from 'zod';
import { exportFigmaFrames } from '../services/figma-api.js';
import { uploadToDrive } from '../services/drive-api.js';
import { normalizeDate } from '../utils/constants.js';

export const fullPipelineSchema = z.object({
  fileKey: z.string().describe('File key do Figma'),
  nodeIds: z.array(z.string()).describe('Node IDs para exportar'),
  frameName: z.string().describe(
    'Nome do frame no formato "[DATA] - [NOME]". ' +
    'Formatos de data aceitos: DD-MM (ex: "27-05 - Dr. Rodolfo"), ' +
    'DD-MM-AA (ex: "27-05-26 - Dr. Rodolfo") ou ' +
    'YYYY-MM-DD (ex: "2026-05-27 - Dr. Rodolfo").'
  ),
  scale: z.number().optional().default(2).describe('Escala do export (default: 2)'),
  credentialsPath: z.string().optional().describe('Caminho para o arquivo credentials.json do Google'),
});

export type FullPipelineInput = z.infer<typeof fullPipelineSchema>;

function parseFrameName(frameName: string): { date: string; clientName: string; rawDate: string } {
  const sepIndex = frameName.indexOf(' - ');
  if (sepIndex === -1) {
    throw new Error(
      `Nome do frame nao segue o padrao "[DATA] - [NOME]": "${frameName}". ` +
      'Exemplos validos: "27-05 - Dr. Rodolfo", "27-05-26 - Dr. Rodolfo", "2026-05-27 - Dr. Rodolfo".'
    );
  }
  const rawDate = frameName.substring(0, sepIndex).trim();
  const clientName = frameName.substring(sepIndex + 3).trim();

  // normalizeDate aceita DD-MM, DD-MM-AA e YYYY-MM-DD
  const date = normalizeDate(rawDate);

  return { date, clientName, rawDate };
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
