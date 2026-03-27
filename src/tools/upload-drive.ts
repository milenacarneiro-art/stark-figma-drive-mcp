import { z } from 'zod';
import { uploadToDrive } from '../services/drive-api.js';

export const uploadDriveSchema = z.object({
  clientName: z.string().describe('Nome da pasta do cliente no Drive (ex: "Stark")'),
  date: z.string().describe('Data no formato YYYY-MM-DD (ex: "2026-03-17")'),
  files: z.array(z.string()).optional().default([]).describe('Caminhos dos arquivos PNG para upload'),
  dryRun: z.boolean().optional().default(false).describe('Se true, apenas navega as pastas sem fazer upload'),
  credentialsPath: z.string().optional().describe('Caminho para o arquivo credentials.json do Google'),
});

export type UploadDriveInput = z.infer<typeof uploadDriveSchema>;

export async function handleUploadDrive(input: UploadDriveInput) {
  const result = await uploadToDrive({
    clientName: input.clientName,
    date: input.date,
    files: input.files,
    dryRun: input.dryRun,
    credentialsPath: input.credentialsPath,
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
