#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { exportFigmaSchema, handleExportFigma } from './tools/export-figma.js';
import { uploadDriveSchema, handleUploadDrive } from './tools/upload-drive.js';
import { fullPipelineSchema, handleFullPipeline } from './tools/full-pipeline.js';

const server = new McpServer({
  name: 'stark-figma-drive',
  version: '1.0.0',
});

server.tool(
  'export_figma_frames',
  'Exporta frames do Figma como PNG em alta qualidade. Usa a API REST do Figma com batching automatico para evitar timeouts.',
  exportFigmaSchema.shape,
  async (input) => handleExportFigma(input as any),
);

server.tool(
  'upload_to_drive',
  'Faz upload de arquivos para o Google Drive do cliente. Navega automaticamente a hierarquia: Clientes > [cliente] > Cronograma de Conteudo > Artes > [ano] > [mes] > [data]. Cria pastas inexistentes.',
  uploadDriveSchema.shape,
  async (input) => handleUploadDrive(input as any),
);

server.tool(
  'figma_to_drive',
  'Pipeline completo: exporta frames do Figma e faz upload para o Google Drive. Parse automatico do nome do frame no formato "[DATA] - [NOME]" para determinar cliente e data.',
  fullPipelineSchema.shape,
  async (input) => handleFullPipeline(input as any),
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error('Erro fatal no MCP server:', err);
  process.exit(1);
});
