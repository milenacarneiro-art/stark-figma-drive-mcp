import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import {
  FIGMA_API_BASE,
  DEFAULT_OUTPUT,
  DEFAULT_SCALE,
  DEFAULT_BATCH_SIZE,
} from '../utils/constants.js';

export interface ExportedFile {
  name: string;
  path: string;
  nodeId: string;
  sizeKb: number;
}

export interface ExportResult {
  prefix: string;
  outputDir: string;
  totalRequested: number;
  totalDownloaded: number;
  files: ExportedFile[];
}

interface FigmaImagesResponse {
  err: string | null;
  images: Record<string, string | null>;
}

function getToken(): string {
  const token = process.env.FIGMA_TOKEN;
  if (!token) {
    throw new Error(
      'FIGMA_TOKEN nao encontrado. Defina como variavel de ambiente. ' +
      'Gere em: Figma > Settings > Personal Access Tokens'
    );
  }
  return token;
}

async function exportNodesBatch(
  token: string,
  fileKey: string,
  nodeIds: string[],
  scale: number,
): Promise<Record<string, string | null> | null> {
  const idsParam = nodeIds.join(',');
  const url = new URL(`${FIGMA_API_BASE}/images/${fileKey}`);
  url.searchParams.set('ids', idsParam);
  url.searchParams.set('format', 'png');
  url.searchParams.set('scale', String(scale));

  const resp = await fetch(url.toString(), {
    headers: { 'X-Figma-Token': token },
  });

  if (!resp.ok) {
    const errorText = await resp.text();
    if (errorText.toLowerCase().includes('timeout') || resp.status === 400) {
      return null; // signal to retry with smaller batch
    }
    throw new Error(`Figma API retornou ${resp.status}: ${errorText}`);
  }

  const data = (await resp.json()) as FigmaImagesResponse;
  if (data.err) {
    if (String(data.err).toLowerCase().includes('timeout')) {
      return null;
    }
    throw new Error(`Figma API erro: ${data.err}`);
  }

  return data.images;
}

async function exportNodes(
  token: string,
  fileKey: string,
  nodeIds: string[],
  scale: number,
  batchSize: number,
): Promise<Record<string, string | null>> {
  const allImages: Record<string, string | null> = {};

  if (nodeIds.length <= batchSize) {
    const images = await exportNodesBatch(token, fileKey, nodeIds, scale);
    if (images !== null) return images;

    // Timeout — try one by one
    for (const nodeId of nodeIds) {
      const single = await exportNodesBatch(token, fileKey, [nodeId], scale);
      if (single) Object.assign(allImages, single);
    }
    return allImages;
  }

  // Split into batches
  const numBatches = Math.ceil(nodeIds.length / batchSize);
  for (let i = 0; i < numBatches; i++) {
    const batch = nodeIds.slice(i * batchSize, (i + 1) * batchSize);
    const images = await exportNodesBatch(token, fileKey, batch, scale);
    if (images !== null) {
      Object.assign(allImages, images);
    } else {
      // Timeout on batch — try one by one
      for (const nodeId of batch) {
        const single = await exportNodesBatch(token, fileKey, [nodeId], scale);
        if (single) Object.assign(allImages, single);
      }
    }
  }

  return allImages;
}

async function downloadImage(url: string, outputPath: string): Promise<number> {
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`Erro ao baixar imagem: HTTP ${resp.status}`);
  }
  const buffer = Buffer.from(await resp.arrayBuffer());
  await writeFile(outputPath, buffer);
  return buffer.length;
}

export async function exportFigmaFrames(params: {
  fileKey: string;
  nodeIds: string[];
  prefix: string;
  scale?: number;
  outputDir?: string;
  batchSize?: number;
}): Promise<ExportResult> {
  const {
    fileKey,
    nodeIds,
    prefix,
    scale = DEFAULT_SCALE,
    outputDir = DEFAULT_OUTPUT,
    batchSize = DEFAULT_BATCH_SIZE,
  } = params;

  const token = getToken();

  await mkdir(outputDir, { recursive: true });

  const imageUrls = await exportNodes(token, fileKey, nodeIds, scale, batchSize);

  const downloaded: ExportedFile[] = [];
  const total = nodeIds.length;

  for (let i = 0; i < nodeIds.length; i++) {
    const nodeId = nodeIds[i];
    const url = imageUrls[nodeId];
    if (!url) continue;

    const filename = total === 1
      ? `${prefix}.png`
      : `${prefix}-card-${String(i + 1).padStart(2, '0')}.png`;

    const outputPath = join(outputDir, filename);
    const sizeBytes = await downloadImage(url, outputPath);

    downloaded.push({
      name: filename,
      path: outputPath,
      nodeId,
      sizeKb: Math.round((sizeBytes / 1024) * 10) / 10,
    });
  }

  return {
    prefix,
    outputDir,
    totalRequested: total,
    totalDownloaded: downloaded.length,
    files: downloaded,
  };
}
