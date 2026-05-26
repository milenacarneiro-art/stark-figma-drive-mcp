import { google, drive_v3 } from 'googleapis';
import { GoogleAuth } from 'google-auth-library';
import { createReadStream, statSync, existsSync, renameSync } from 'node:fs';
import { basename } from 'node:path';
import { MESES, CONTENT_FOLDER_NAMES, DRIVE_SCOPES, normalizeDate } from '../utils/constants.js';

export interface UploadedFile {
  name: string;
  id: string;
  link: string;
}

export interface UploadResult {
  folderId: string;
  folderLink: string;
  created: boolean;
  files: UploadedFile[];
}

interface DriveFolder {
  id: string;
  name: string;
  webViewLink?: string;
}

function resolveCredentialsPath(credentialsPath?: string): string {
  const keyFile = credentialsPath || process.env.GOOGLE_CREDENTIALS_PATH;
  if (!keyFile) {
    throw new Error(
      'Credenciais Google nao encontradas. Defina GOOGLE_CREDENTIALS_PATH ' +
      'ou passe credentialsPath.'
    );
  }

  if (existsSync(keyFile)) return keyFile;

  // Auto-corrige dupla extensão: credentials.json.json → credentials.json
  if (keyFile.endsWith('.json.json')) {
    const fixed = keyFile.slice(0, -5);
    if (existsSync(fixed)) return fixed;
    // Tenta renomear para corrigir permanentemente
    try {
      renameSync(keyFile, fixed);
      return fixed;
    } catch { /* ignora se não conseguir renomear */ }
  }

  throw new Error(
    `Arquivo de credenciais nao encontrado: ${keyFile}. ` +
    'Verifique se o credentials.json existe no diretório do MCP.'
  );
}

function getDriveService(credentialsPath?: string): drive_v3.Drive {
  const keyFile = resolveCredentialsPath(credentialsPath);

  const auth = new GoogleAuth({
    keyFile,
    scopes: DRIVE_SCOPES,
  });

  return google.drive({ version: 'v3', auth });
}

async function findSharedDrive(
  drive: drive_v3.Drive,
  name: string,
): Promise<{ id: string; name: string } | null> {
  const res = await drive.drives.list({ pageSize: 50 });
  const drives = res.data.drives || [];
  const match = drives.find(
    (d) => d.name?.trim().toLowerCase() === name.trim().toLowerCase(),
  );
  return match ? { id: match.id!, name: match.name! } : null;
}

async function findFolder(
  drive: drive_v3.Drive,
  name: string,
  parentId: string,
  driveId?: string,
): Promise<DriveFolder | null> {
  const safeName = name.replace(/'/g, "\\'");
  let q = `name = '${safeName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false and '${parentId}' in parents`;

  const params: drive_v3.Params$Resource$Files$List = {
    q,
    fields: 'files(id, name, webViewLink)',
    pageSize: 5,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  };
  if (driveId) {
    params.driveId = driveId;
    params.corpora = 'drive';
  }

  const res = await drive.files.list(params);
  const files = res.data.files || [];
  if (files.length === 0) return null;
  return {
    id: files[0].id!,
    name: files[0].name!,
    webViewLink: files[0].webViewLink || undefined,
  };
}

async function findFolderContains(
  drive: drive_v3.Drive,
  searchText: string,
  parentId: string,
  driveId?: string,
): Promise<DriveFolder | null> {
  const safeText = searchText.replace(/'/g, "\\'");
  let q = `name contains '${safeText}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false and '${parentId}' in parents`;

  const params: drive_v3.Params$Resource$Files$List = {
    q,
    fields: 'files(id, name, webViewLink)',
    pageSize: 10,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  };
  if (driveId) {
    params.driveId = driveId;
    params.corpora = 'drive';
  }

  const res = await drive.files.list(params);
  const files = res.data.files || [];
  if (files.length === 0) return null;
  return {
    id: files[0].id!,
    name: files[0].name!,
    webViewLink: files[0].webViewLink || undefined,
  };
}

async function findContentFolder(
  drive: drive_v3.Drive,
  parentId: string,
  driveId?: string,
): Promise<DriveFolder | null> {
  for (const name of CONTENT_FOLDER_NAMES) {
    const folder = await findFolder(drive, name, parentId, driveId);
    if (folder) return folder;
  }
  for (const name of CONTENT_FOLDER_NAMES) {
    const folder = await findFolderContains(drive, name, parentId, driveId);
    if (folder) return folder;
  }
  return null;
}

async function createFolder(
  drive: drive_v3.Drive,
  name: string,
  parentId: string,
): Promise<DriveFolder> {
  const res = await drive.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    },
    fields: 'id, name, webViewLink',
    supportsAllDrives: true,
  });
  return {
    id: res.data.id!,
    name: res.data.name!,
    webViewLink: res.data.webViewLink || undefined,
  };
}

async function uploadFile(
  drive: drive_v3.Drive,
  filePath: string,
  parentId: string,
): Promise<UploadedFile> {
  const fileName = basename(filePath);
  const ext = fileName.toLowerCase().split('.').pop();
  const mimeType =
    ext === 'png'  ? 'image/png' :
    ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' :
    ext === 'mp4'  ? 'video/mp4' :
    ext === 'mov'  ? 'video/quicktime' :
    'application/octet-stream';

  const res = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [parentId],
    },
    media: {
      mimeType,
      body: createReadStream(filePath),
    },
    fields: 'id, name, webViewLink',
    supportsAllDrives: true,
  });

  return {
    name: res.data.name!,
    id: res.data.id!,
    link: res.data.webViewLink || '',
  };
}

interface NavigationResult {
  folderId: string;
  folderLink: string;
  created: boolean;
  steps: string[];
}

async function navigateToDateFolder(
  drive: drive_v3.Drive,
  clientName: string,
  dateStr: string,
  startFolderId?: string,
  folderSuffix?: string,
): Promise<NavigationResult> {
  // Aceita DD-MM, DD-MM-AA e YYYY-MM-DD — normaliza para YYYY-MM-DD
  const normalized = normalizeDate(dateStr);
  const parts = normalized.split('-');
  if (parts.length !== 3) {
    throw new Error(`Data invalida '${dateStr}'. Use formato DD-MM, DD-MM-AA ou YYYY-MM-DD.`);
  }
  dateStr = normalized;

  const mesNum = parseInt(parts[1], 10);
  const mesNome = MESES[mesNum];
  if (!mesNome) {
    throw new Error(`Mes invalido '${parts[1]}'.`);
  }

  const steps: string[] = [];

  // Modo override: startFolderId aponta diretamente para a pasta de ano do cliente.
  // Pula os níveis 1-5 (Clientes → cliente → conteudo → artes → ano).
  if (startFolderId) {
    steps.push(`[override] Usando startFolderId -> ${startFolderId} (${clientName})`);

    // Level 6: Month
    let pastaMes = await findFolder(drive, mesNome, startFolderId);
    if (!pastaMes) {
      pastaMes = await createFolder(drive, mesNome, startFolderId);
      steps.push(`[6/7] ${mesNome} — criado -> ${pastaMes.id}`);
    } else {
      steps.push(`[6/7] ${mesNome} -> ${pastaMes.id}`);
    }

    // Level 7: Date (with optional type suffix)
    const dateFolderName = folderSuffix ? `${dateStr} ${folderSuffix}` : dateStr;
    let pastaData = await findFolder(drive, dateFolderName, pastaMes.id);
    let created = false;
    if (!pastaData) {
      pastaData = await createFolder(drive, dateFolderName, pastaMes.id);
      created = true;
      steps.push(`[7/7] ${dateFolderName} — criado -> ${pastaData.id}`);
    } else {
      steps.push(`[7/7] ${dateFolderName} -> ${pastaData.id}`);
    }

    const folderLink = pastaData.webViewLink ||
      `https://drive.google.com/drive/folders/${pastaData.id}`;

    return { folderId: pastaData.id, folderLink, created, steps };
  }

  // Modo padrão: navega Clientes → cliente → conteudo → artes → ano → mês → data
  const ano = parts[0];
  let driveId: string | undefined;

  // Level 1: Shared Drive "Clientes"
  const sharedDrive = await findSharedDrive(drive, 'Clientes');
  let clientesId: string;

  if (sharedDrive) {
    clientesId = sharedDrive.id;
    driveId = sharedDrive.id;
    steps.push(`[1/7] Clientes (Shared Drive) -> ${clientesId}`);
  } else {
    const res = await drive.files.list({
      q: "name = 'Clientes' and mimeType = 'application/vnd.google-apps.folder' and trashed = false",
      fields: 'files(id, name)',
      pageSize: 5,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    const files = res.data.files || [];
    if (files.length === 0) {
      throw new Error("Pasta/Drive 'Clientes' nao encontrado. Verifique se foi compartilhado com o service account.");
    }
    clientesId = files[0].id!;
    steps.push(`[1/7] Clientes (pasta) -> ${clientesId}`);
  }

  // Level 2: Client folder
  let cliente = await findFolder(drive, clientName, clientesId, driveId);
  if (!cliente) {
    cliente = await findFolderContains(drive, clientName, clientesId, driveId);
  }
  if (!cliente) {
    throw new Error(`Pasta do cliente '${clientName}' nao encontrada dentro de 'Clientes'.`);
  }
  steps.push(`[2/7] ${cliente.name} -> ${cliente.id}`);

  // Level 3: Content folder
  const conteudo = await findContentFolder(drive, cliente.id, driveId);
  if (!conteudo) {
    throw new Error(`Pasta de conteudo nao encontrada (${CONTENT_FOLDER_NAMES.join(' / ')}).`);
  }
  steps.push(`[3/7] ${conteudo.name} -> ${conteudo.id}`);

  // Level 4-5: Artes + Year
  let pastaAno = await findFolder(drive, ano, conteudo.id, driveId);
  if (pastaAno) {
    steps.push(`[4/7] Artes — pulado (ano encontrado direto no Conteudo)`);
    steps.push(`[5/7] ${ano} -> ${pastaAno.id}`);
  } else {
    let artes = await findFolder(drive, 'Artes', conteudo.id, driveId);
    if (!artes) artes = await findFolderContains(drive, 'Artes', conteudo.id, driveId);
    if (!artes) artes = await findFolderContains(drive, 'ARTES', conteudo.id, driveId);
    if (!artes) {
      artes = await createFolder(drive, 'Artes', conteudo.id);
      steps.push(`[4/7] Artes — criado -> ${artes.id}`);
    } else {
      steps.push(`[4/7] ${artes.name} -> ${artes.id}`);
    }

    pastaAno = await findFolder(drive, ano, artes.id, driveId);
    if (!pastaAno) {
      pastaAno = await createFolder(drive, ano, artes.id);
      steps.push(`[5/7] ${ano} — criado -> ${pastaAno.id}`);
    } else {
      steps.push(`[5/7] ${ano} -> ${pastaAno.id}`);
    }
  }

  // Level 6: Month
  let pastaMes = await findFolder(drive, mesNome, pastaAno.id, driveId);
  if (!pastaMes) {
    pastaMes = await createFolder(drive, mesNome, pastaAno.id);
    steps.push(`[6/7] ${mesNome} — criado -> ${pastaMes.id}`);
  } else {
    steps.push(`[6/7] ${mesNome} -> ${pastaMes.id}`);
  }

  // Level 7: Date (with optional type suffix)
  const dateFolderName = folderSuffix ? `${dateStr} ${folderSuffix}` : dateStr;
  let pastaData = await findFolder(drive, dateFolderName, pastaMes.id, driveId);
  let created = false;
  if (!pastaData) {
    pastaData = await createFolder(drive, dateFolderName, pastaMes.id);
    created = true;
    steps.push(`[7/7] ${dateFolderName} — criado -> ${pastaData.id}`);
  } else {
    steps.push(`[7/7] ${dateFolderName} -> ${pastaData.id}`);
  }

  const folderLink = pastaData.webViewLink ||
    `https://drive.google.com/drive/folders/${pastaData.id}`;

  return { folderId: pastaData.id, folderLink, created, steps };
}

export async function uploadToDrive(params: {
  clientName: string;
  date: string;
  files?: string[];
  dryRun?: boolean;
  credentialsPath?: string;
  startFolderId?: string;
  folderSuffix?: string;
}): Promise<UploadResult> {
  const { clientName, date, files = [], dryRun = false, credentialsPath, startFolderId, folderSuffix } = params;

  const drive = getDriveService(credentialsPath);
  const nav = await navigateToDateFolder(drive, clientName, date, startFolderId, folderSuffix);

  if (dryRun) {
    return {
      folderId: nav.folderId,
      folderLink: nav.folderLink,
      created: nav.created,
      files: [],
    };
  }

  if (files.length === 0) {
    throw new Error('Nenhum arquivo fornecido para upload. Use dryRun para testar navegacao.');
  }

  // Validate files exist
  const validFiles: string[] = [];
  for (const f of files) {
    try {
      statSync(f);
      validFiles.push(f);
    } catch {
      // skip missing files
    }
  }

  if (validFiles.length === 0) {
    throw new Error('Nenhum arquivo valido encontrado para upload.');
  }

  const uploaded: UploadedFile[] = [];
  for (const filePath of validFiles) {
    const result = await uploadFile(drive, filePath, nav.folderId);
    uploaded.push(result);
  }

  return {
    folderId: nav.folderId,
    folderLink: nav.folderLink,
    created: nav.created,
    files: uploaded,
  };
}
