# stark-figma-drive-mcp

MCP Server para exportar frames do Figma e fazer upload automatico para o Google Drive. Criado para o time de design da Stark.

## Tools disponiveis

| Tool | Descricao |
|------|-----------|
| `export_figma_frames` | Exporta frames do Figma como PNG em alta qualidade |
| `upload_to_drive` | Upload para o Google Drive com navegacao automatica de pastas |
| `figma_to_drive` | Pipeline completo: Figma export + Drive upload |

## Setup

### 1. Gerar Token do Figma

1. Acesse [Figma Settings](https://www.figma.com/settings) > **Personal Access Tokens**
2. Crie um token com permissao de leitura
3. Guarde o token (formato: `figd_...`)

### 2. Credenciais do Google Drive

1. Acesse o [Google Cloud Console](https://console.cloud.google.com/)
2. Crie um Service Account com acesso ao Drive API
3. Baixe o arquivo `credentials.json`
4. Compartilhe o Shared Drive "Clientes" com o email do service account

### 3. Configurar no Claude Code

Adicione no `~/.claude.json` ou no `.claude/settings.json` do projeto:

```json
{
  "mcpServers": {
    "figma-drive": {
      "command": "node",
      "args": ["/caminho/para/stark-figma-drive-mcp/dist/index.js"],
      "env": {
        "FIGMA_TOKEN": "figd_...",
        "GOOGLE_CREDENTIALS_PATH": "/caminho/para/credentials.json"
      }
    }
  }
}
```

**Via GitHub (quando publicado):**

```json
{
  "mcpServers": {
    "figma-drive": {
      "command": "npx",
      "args": ["github:angelostark/stark-figma-drive-mcp"],
      "env": {
        "FIGMA_TOKEN": "figd_...",
        "GOOGLE_CREDENTIALS_PATH": "/caminho/para/credentials.json"
      }
    }
  }
}
```

### 4. Copiar a Skill (opcional)

Copie `commands/figma-export-para-drive.md` para `.claude/commands/` do seu projeto. Isso permite usar `/figma-export-para-drive` no Claude Code para orquestrar o fluxo completo (Figma + Drive + ClickUp).

## Build

```bash
npm install
npm run build
```

## Uso

### Via Claude Code (com skill)

```
/figma-export-para-drive
```

Cole o link do Figma quando solicitado.

### Via MCP tools diretamente

**Exportar frames:**
```
export_figma_frames({
  fileKey: "042FZHjPyx1TWMO4kzx1ai",
  nodeIds: ["1038:6", "1038:16"],
  prefix: "2026-03-17-Stark"
})
```

**Upload para Drive:**
```
upload_to_drive({
  clientName: "Stark",
  date: "2026-03-17",
  files: ["/tmp/figma_exports/2026-03-17-Stark-card-01.png"]
})
```

**Pipeline completo:**
```
figma_to_drive({
  fileKey: "042FZHjPyx1TWMO4kzx1ai",
  nodeIds: ["1038:6"],
  frameName: "2026-03-17 - Stark"
})
```

## Hierarquia de pastas no Drive

O upload navega automaticamente:
```
Clientes / [cliente] / Cronograma de Conteudo / Artes / [ano] / [mes] / [data]
```

Pastas inexistentes sao criadas automaticamente.

## Requisitos

- Node.js 18+
- Token do Figma (Personal Access Token)
- Credenciais do Google (Service Account com acesso ao Drive)
