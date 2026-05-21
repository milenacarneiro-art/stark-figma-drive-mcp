import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const FIGMA_API_BASE = 'https://api.figma.com/v1';

/**
 * Normaliza formatos de data do nome do frame para YYYY-MM-DD.
 *
 * Formatos suportados:
 *   DD-MM          ex: "27-05"       → "2026-05-27"  (ano corrente)
 *   DD-MM-AA       ex: "27-05-26"    → "2026-05-27"  (século 20XX)
 *   YYYY-MM-DD     ex: "2026-05-27"  → "2026-05-27"  (sem alteração)
 */
export function normalizeDate(input: string): string {
  const trimmed = input.trim();

  // YYYY-MM-DD — já no formato correto
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  // DD-MM-AA — ex: 27-05-26
  if (/^\d{2}-\d{2}-\d{2}$/.test(trimmed)) {
    const [day, month, yy] = trimmed.split('-');
    return `20${yy}-${month}-${day}`;
  }

  // DD-MM — ex: 27-05 (assume ano corrente)
  if (/^\d{2}-\d{2}$/.test(trimmed)) {
    const [day, month] = trimmed.split('-');
    const year = new Date().getFullYear();
    return `${year}-${month}-${day}`;
  }

  throw new Error(
    `Formato de data nao reconhecido: "${input}". ` +
    'Use DD-MM, DD-MM-AA ou YYYY-MM-DD. Ex: "27-05", "27-05-26", "2026-05-27".'
  );
}
export const DEFAULT_OUTPUT = join(tmpdir(), 'figma_exports');
export const DEFAULT_SCALE = 2;
export const DEFAULT_BATCH_SIZE = 5;

export const MESES: Record<number, string> = {
  1: 'Janeiro',
  2: 'Fevereiro',
  3: 'Março',
  4: 'Abril',
  5: 'Maio',
  6: 'Junho',
  7: 'Julho',
  8: 'Agosto',
  9: 'Setembro',
  10: 'Outubro',
  11: 'Novembro',
  12: 'Dezembro',
};

export const CONTENT_FOLDER_NAMES = [
  'Cronograma de Conteúdo',
  'C. Conteúdo',
  'Cronograma de Conteudo',
  'C. Conteudo',
];

export const DRIVE_SCOPES = [
  'https://www.googleapis.com/auth/drive',
];
