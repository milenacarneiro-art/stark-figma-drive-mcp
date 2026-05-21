# stark-figma-drive-mcp

Claude Code Plugin que exporta frames do Figma e faz upload automatico para o Google Drive. Criado para o time de design da Stark.

## Instalacao (Claude Code Plugin)

### 1. Clonar o repositorio

```bash
git clone https://github.com/angelostark/stark-figma-drive-mcp.git
cd stark-figma-drive-mcp
npm install && npm run build
```

### 2. Configurar credenciais

As variaveis de ambiente devem ser definidas **no nivel do sistema ou do shell** antes de subir o MCP server — o `plugin.json` nao injeta valores para nao expor tokens no git.

| Variavel | Descricao |
|----------|-----------|
| `FIGMA_TOKEN` | Personal Access Token do Figma ([gerar aqui](https://www.figma.com/settings)) |
| `GOOGLE_CREDENTIALS_PATH` | Caminho absoluto para o `credentials.json` do Service Account do Google |

**Windows (PowerShell — permanente por usuario):**
```powershell
[System.Environment]::SetEnvironmentVariable("FIGMA_TOKEN", "seu-token-aqui", "User")
[System.Environment]::SetEnvironmentVariable("GOOGLE_CREDENTIALS_PATH", "C:\caminho\credentials.json", "User")
```

> ⚠️ Reinicie o Claude Code apos definir as variaveis para que o MCP server as herde.

### 3. Instalar o plugin no Claude Code

Aponte o Claude Code para a pasta do repositorio clonado. O arquivo `.claude-plugin/plugin.json` sera detectado automaticamente, registrando:

- **MCP Server** `figma-drive` — tools de export e upload
- **Skill** `/figma-export-para-drive` — orquestra o fluxo completo (Figma + Drive + ClickUp)

### 4. Verificar

No Claude Code, a skill `/figma-export-para-drive` deve aparecer na lista de skills disponiveis e as tools `export_figma_frames`, `upload_to_drive` e `figma_to_drive` devem estar acessiveis.

## Tools disponiveis

| Tool | Descricao |
|------|-----------|
| `export_figma_frames` | Exporta frames do Figma como PNG em alta qualidade |
| `upload_to_drive` | Upload para o Google Drive com navegacao automatica de pastas |
| `figma_to_drive` | Pipeline completo: Figma export + Drive upload |

## Uso

### Via skill (recomendado)

```
/figma-export-para-drive
```

Cole o link do Figma quando solicitado. A skill cuida de tudo: export, upload, comentario no ClickUp e notificacao do responsavel.

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
  files: ["C:\\Users\\...\\AppData\\Local\\Temp\\figma_exports\\2026-03-17-Stark-card-01.png"]
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

## Estrutura do plugin

```
stark-figma-drive-mcp/
├── .claude-plugin/
│   └── plugin.json            # Metadata + MCP server config
├── skills/
│   └── figma-export-para-drive/
│       └── SKILL.md           # Skill de orquestracao
├── src/                       # MCP server source
├── dist/                      # Compilado
├── package.json
└── tsconfig.json
```

## Build

```bash
npm install
npm run build
```

## Requisitos

- Node.js 18+
- Token do Figma (Personal Access Token)
- Credenciais do Google (Service Account com acesso ao Drive)
