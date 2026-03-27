---
name: figma-export-para-drive
description: >
  Exporta frames do Figma como PNG, faz upload automatico para a pasta do
  cliente no Google Drive (criando subpasta com a data do nome do frame),
  busca a SUBTAREFA correspondente no ClickUp pelo nome do frame, adiciona
  um comentario com o LINK DA PASTA no Drive e notifica (@menciona) o
  responsavel da TAREFA MAE.

  Use SEMPRE que o usuario pedir: "exportar do Figma para o Drive",
  "jogar [arquivo] no Drive", "exportar design para o cliente",
  "enviar Figma para Drive", "fazer upload do Figma", "mandar [nome] pro Drive",
  "exportar [nome] e comentar no ClickUp", "jogar no drive e comentar",
  ou qualquer variacao de mover, exportar ou enviar frames do Figma para o
  Google Drive e notificar via ClickUp.
---

# Figma → Drive → ClickUp

Essa skill automatiza o fluxo completo de entrega de design:
1. Exporta o frame do Figma como PNG (via MCP tool `export_figma_frames`)
2. Faz upload automatico para a pasta correta no Google Drive (via MCP tool `upload_to_drive`)
3. Busca a **subtarefa** no ClickUp, posta o link da **pasta** do Drive como comentario e notifica o responsavel da **tarefa mae**

---

## Pre-requisitos

- MCP Server `stark-figma-drive` configurado no Claude Code (com `FIGMA_TOKEN` e `GOOGLE_CREDENTIALS_PATH`)
- MCP Server ClickUp configurado no Claude Code
- Pasta "Clientes" do Drive compartilhada com o email do service account

---

## Convencao de nomenclatura dos frames

Os frames no Figma seguem este padrao:
```
[DATA] - [NOME DO DRIVE]
```
Exemplos:
- `2026-03-17 - Stark`
- `2026-03-20 - Nike Brasil`
- `2026-03-15 - Clinica Saude`

A **data** (antes do ` - `) define a subpasta no Drive.
O **nome do Drive** (depois do ` - `) e o nome exato da pasta do cliente no Google Drive.

---

## O que o usuario precisa fornecer

- **Link do Figma** (URL do arquivo/frame) ou o nome do frame
- Opcionalmente: qual frame especifico exportar (se nao informar, pergunte)

---

## Passo a passo de execucao

### ETAPA 1 — Localizar o frame no Figma

Se o usuario forneceu um link (ex.: `https://figma.com/design/XYZABC/Nome?node-id=1-2`):
- Extraia o `fileKey` da URL (segmento apos `/design/`)
- Extraia o `nodeId` do parametro `node-id` convertendo `-` para `:` (ex.: `1-2` → `1:2`)

Use `mcp__claude_ai_Figma__get_metadata` com `fileKey` e `nodeId` para confirmar o nome do frame e listar frames filhos.

Se nao tiver URL, peca ao usuario que copie o link via "Copy link to selection" no Figma.

### ETAPA 2 — Extrair data e nome do Drive a partir do nome do frame

Parse o nome do frame no padrao `[DATA] - [NOME DO DRIVE]`:
- **data** = tudo antes do primeiro ` - ` (formato `YYYY-MM-DD`)
- **nome_drive** = tudo depois do primeiro ` - ` (texto exato)

Se o nome do frame nao tiver o padrao `[DATA] - [NOME]`, pergunte ao usuario antes de prosseguir.

### ETAPA 3 — Identificar tipo de post e exportar

Use `mcp__claude_ai_Figma__get_metadata` no frame principal para verificar frames filhos.

#### Estatico (sem frames filhos)
Use a MCP tool `export_figma_frames` com:
```json
{
  "fileKey": "[FILE_KEY]",
  "nodeIds": ["[NODE_ID]"],
  "prefix": "[DATA]-[NOME_DRIVE]"
}
```

#### Carrossel (com frames filhos = cards)
Cada filho e um card/slide. Use `export_figma_frames` com todos os nodeIds dos filhos:
```json
{
  "fileKey": "[FILE_KEY]",
  "nodeIds": ["[NODE_ID_1]", "[NODE_ID_2]", "[NODE_ID_3]"],
  "prefix": "[DATA]-[NOME_DRIVE]"
}
```

### ETAPA 4 — Upload automatico para o Google Drive

Use a MCP tool `upload_to_drive` com:
```json
{
  "clientName": "[NOME_DRIVE]",
  "date": "[DATA]",
  "files": ["/tmp/figma_exports/[DATA]-[NOME_DRIVE]-card-01.png", "..."]
}
```

O tool navega automaticamente a hierarquia:
```
Clientes / [nome_drive] / Cronograma de Conteudo / Artes / [ano] / [mes] / [data]
```

Capture o `folderLink` do resultado para usar no comentario do ClickUp.

#### FALLBACK — Se o upload falhar

1. Mostre o erro ao usuario
2. Informe o caminho completo onde os arquivos devem ir no Drive
3. Liste os PNGs locais em `/tmp/figma_exports/`
4. Pergunte:
> "O upload automatico falhou. Suba os PNGs manualmente na pasta acima e me mande o **link da pasta** no Drive pra continuar com o ClickUp."
5. Aguarde o `folderLink` do usuario antes de prosseguir.

### ETAPA 5 — Encontrar a subtarefa no ClickUp

Use `mcp__claude_ai_ClickUp__clickup_search` com o `nome_drive` como termo de busca.

**Regras de desambiguacao:**
- Se encontrar multiplas tarefas, priorize as com status ativo (nao concluido)
- Se ainda houver ambiguidade, mostre as opcoes ao usuario e peca confirmacao
- Se a tarefa encontrada nao tiver `parent`, pode ser a tarefa mae — confirme com o usuario

### ETAPA 6 — Encontrar o responsavel da tarefa mae

Com o ID da subtarefa:
1. Use `mcp__claude_ai_ClickUp__clickup_get_task` para obter detalhes e o campo `parent`
2. Use `mcp__claude_ai_ClickUp__clickup_get_task` novamente com o `parent` ID para obter a tarefa mae
3. Leia o campo `assignees` da tarefa mae — pegue todos os assignees

### ETAPA 7 — Postar comentario na subtarefa

Use `mcp__claude_ai_ClickUp__clickup_create_task_comment` na subtarefa com este formato:

```
📁 Arquivos exportados para o Google Drive:
• Pasta de entregas [DATA]: [FOLDER_LINK]

CC: @[Nome do Responsavel 1] @[Nome do Responsavel 2]
```

Use `assignee` com o ID do responsavel da tarefa mae e `notify_all: true`.

### ETAPA 7.1 — Atualizar status da subtarefa para "edicao concluida"

Use `mcp__claude_ai_ClickUp__clickup_update_task` na subtarefa:
```json
{
  "task_id": "[ID DA SUBTAREFA]",
  "status": "edição concluída"
}
```

### ETAPA 8 — Resumo final

```
✅ Exportacao concluida!

🎨 Frame: [DATA] - [NOME DO DRIVE]
📦 Tipo: [Estatico / Carrossel com N cards]

📁 Drive:
   └── Pasta: [NOME DO DRIVE] / [ANO] / [MES] / [DATA]
   └── Link: [folder_link]
   └── Arquivos: [lista dos PNGs]

🔗 ClickUp:
   └── Subtarefa: "[Nome da Subtarefa]"
   └── Status: edicao concluida ✅
   └── Comentario postado com link do Drive
   └── Responsavel notificado: @[Nome(s)] (tarefa mae: "[nome da tarefa mae]")
```

---

## Erros comuns e como lidar

| Situacao | Acao |
|----------|------|
| Nome do frame nao segue padrao `[DATA] - [NOME]` | Perguntar data e nome do cliente |
| Arquivo Figma nao encontrado | Pedir o link direto do Figma |
| FIGMA_TOKEN nao configurado | Orientar a configurar no MCP server |
| GOOGLE_CREDENTIALS_PATH nao configurado | Orientar a configurar no MCP server |
| Pasta do cliente nao existe no Drive | Mostrar erro e pedir que crie no Drive |
| Upload falhou | Usar fallback manual |
| Subtarefa ClickUp nao encontrada | Mostrar tarefas similares e pedir confirmacao |

---

## Dependencias

| Componente | Tipo | Via |
|------------|------|-----|
| Export Figma | MCP Tool | `stark-figma-drive` server → `export_figma_frames` |
| Upload Drive | MCP Tool | `stark-figma-drive` server → `upload_to_drive` |
| ClickUp Search | MCP Tool | ClickUp MCP → `clickup_search` |
| ClickUp Task | MCP Tool | ClickUp MCP → `clickup_get_task` |
| ClickUp Comment | MCP Tool | ClickUp MCP → `clickup_create_task_comment` |
| ClickUp Update | MCP Tool | ClickUp MCP → `clickup_update_task` |
