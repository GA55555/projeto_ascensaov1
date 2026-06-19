# Relatório de Operação — Fase 13: O Tabuleiro de Campanha (Infinite Canvas 2.0)

**Data:** 2026-06-19 · **Branch:** `sandbox` · **Modelo:** Claude (Opus 4.8)
**Estado:** 🟡 **PLANEJAMENTO** — análise + contrato de dados + plano. **Nenhum código implementado ainda** (aguardando decisões de layout do utilizador).
**Lei dourada:** `ARQUITETURA.md`. Tabela base fornecida pelo DBA: `public.world_boards`.

---

## 1. Objetivo
Evoluir a **Mesa de Guerra** (Fase 12, node-rooted, auto-gerada de um nó-raiz) para um **Infinite Canvas livre** estilo Excalidraw/Miro, com **múltiplos layouts persistidos** (`world_boards`), Pan & Zoom, Shapes (zonas), edição visual de nós/linhas e um **motor de sincronização** que reconcilia o snapshot salvo com o estado real do banco.

**Critério de sucesso do MVP (conforme prompt):** infraestrutura `world_boards` + persistência provada com Pan/Zoom e Shapes básicos.

---

## 2. Verificação de premissas (contra o código real)
Método do projeto: validar `file:line` antes de implementar (premissas de prompts costumam divergir do real).

| Premissa / item | Realidade verificada | Ação |
|---|---|---|
| Tabela `world_boards` | **Não referenciada** em nenhum controller/rota/JS (feature nova) | Criar CRUD do zero |
| DDL da tabela | Já criada pelo DBA (PK uuid, FK cascade, índice) | App faz **só DML** (Regra 4.1) ✅ |
| "Mesa de Guerra" a evoluir | Existe (`selecionarRaizMesa/renderMesa/.war-table-*`), node-rooted | **Refatorar** para multi-board livre |
| Posições hoje | Fase 12 grava `x/y/icone/cargo` em `world_links.dados` | **Migram** para `world_boards.dados.nodes` (ver §6, dívida) |
| Padrão de CRUD | `sessoes`/`automacoes`: `verificarToken → checarAcessoCronica → apenasNarrador → validate(schema)` | Espelhar |
| Query `IN (...)` parametrizada | Não há precedente no projeto | Usar `= ANY($2::uuid[])` (Regra 6.2) |

---

## 3. Contrato de dados — `world_boards.dados` (JSONB)
```jsonc
{
  "camera": { "x": 0, "y": 0, "zoom": 1 },
  "nodes":  [ { "id": "<world_nodes.id>", "x": 120, "y": -40, "cor": "<var/sem-hex>", "icone": "castle" } ],
  "shapes": [ { "id": "<uuid-local>", "x": 0, "y": 0, "w": 300, "h": 200, "label": "Reino do Norte", "cor": "<var>" } ],
  "overrides_linhas": { "<idA>_<idB>": { "cor": "aliado|inimigo|neutro", "stroke": "solid|dashed" } }
}
```
- **Chave de linha** canónica: par de IDs **ordenado** (`min_max`) — `world_links` é bidirecional num único registo (Regra 4.4), então a chave não pode depender da ordem origem/destino.
- **Linhas** são derivadas dos `world_links` **reais** entre nós presentes no tabuleiro; `overrides_linhas` apenas customiza cor/estilo.
- **Cores**: nunca hex hardcoded — paleta de **variáveis CSS** (ex.: `--roxo-mago`, `--link-aliado/inimigo`, ou novas `--zona-*`) + `color-mix` (Regra 2.5).

---

## 4. Plano de Backend (`mundoController.js`, `mundoRoutes.js`, `mundoValidator.js`, `mundoApi.js`)
CRUD completo, **escopado por `cronica_id`** (anti-IDOR, Regra 3.3.1):

| Rota | Método | Guarda |
|---|---|---|
| `/cronicas/:cronicaId/boards` | GET listar | token + acessoCronica |
| `/cronicas/:cronicaId/boards/:boardId` | GET buscar (**+sync**) | idem + board ∈ crónica (404) |
| `/cronicas/:cronicaId/boards` | POST criar | + `apenasNarrador` + Zod |
| `/cronicas/:cronicaId/boards/:boardId` | PUT atualizar (`nome`/`dados`) | idem |
| `/cronicas/:cronicaId/boards/:boardId` | DELETE | idem |

### 4.1 Motor de Sincronização (`buscarBoard`) — CRÍTICO
1. Lê o board (`WHERE id=$1 AND cronica_id=$2` → 404 se não pertence).
2. Extrai os `node.id` do JSONB.
3. `SELECT id FROM world_nodes WHERE cronica_id=$1 AND id = ANY($2::uuid[])` — **parametrizado** (Regra 6.2) e **escopado por crónica** (um id de outro tenant não "existe" para este board).
4. Remove de `dados.nodes` (e linhas/overrides órfãos) os IDs ausentes.
5. Se removeu algo → devolve `atualizado_automaticamente: true`.
6. Frontend exibe Toast: *"Aviso: Entidades ausentes foram removidas do tabuleiro"*.

> **Persistência do sync:** o backend **não** grava a versão limpa automaticamente no GET (evita escrita em leitura). A limpeza é devolvida ao cliente; o estado limpo persiste no próximo "Salvar Layout" explícito (coerente com Regra 2.7 — salvamento manual).

### 4.2 Conformidade arquitetural
- **4.1 DML-only** (DDL é do DBA) · **4.3 UUID** (PK `gen_random_uuid`; Zod `.uuid()`) · **3.3.1** `cronica_id` em todo WHERE · **6.2** queries parametrizadas (`$n`, `= ANY($n::uuid[])`) · **3.1** Zod em POST/PUT/DELETE; `dados` validado (camera/nodes/shapes/overrides) com `.strip()` e limites de tamanho de array; JSONB gravado via `JSON.stringify(...) + ::jsonb`.

---

## 5. Plano de Frontend (`controle_mundo.js`, `controle_mundo.html`, `global_ui.css`) — Vanilla JS
- **Reaproveita** da Mesa de Guerra: `.war-table-canvas`, `.war-table-card`, motor de arrasto (Pointer Events), padrão de popover, `classeTipoLink`, vars `--link-*`, `MundoApi.getNodes/listarLinks`.
- **Pan & Zoom:** camada interna `.board-world` com `transform: translate(x,y) scale(z)` (o `transform` dinâmico é uso permitido pela Regra 2.5); `wheel` ajusta `zoom`. O outer faz `overflow: hidden`.
- **Toolbar flutuante** no canvas: dropdown de tabuleiros, Novo, Salvar, Adicionar Zona, Adicionar Entidade (modal de seleção).
- **Shapes (zonas):** retângulos `<div>`/`<rect>` com rótulo na borda, arrastáveis/redimensionáveis.
- **Linhas:** `<svg>` com `<path>` por `world_link` entre nós no board; clique na linha → mini-popover (cor Aliado/Inimigo/Neutro + `stroke-dasharray`) → grava em `overrides_linhas`.
- **Edição de nó:** popover de duplo-clique evoluído — paleta de cores (fundo/borda, via vars) + ícones de worldbuilding Lucide (`castle, coins, map, mountain, tent, swords`).
- **Salvar:** botão **explícito** (Regra 2.7) → PUT `dados` completo (`camera+nodes+shapes+overrides`).
- **Regras:** Vanilla puro (sem React/Vue/lib de canvas), `escapeHTML` em nomes/labels (6.1), zero cor hex hardcoded (2.5), ícones Lucide + `lucide.createIcons()` após injeção (2.3).

---

## 6. Riscos, dívida técnica e decisões em aberto
- 🔶 **Dívida da Fase 12:** com posições agora no board JSONB, os campos `x/y/icone/cargo` em `dadosLinkSchema` (`world_links.dados`) ficam **legados/mortos**. **Recomendação:** ao concluir a Fase 13, removê-los do schema e da UI da Mesa antiga (que será substituída) — senão acumula contrato morto. *(A faceta `tags/limite` da Panela de Pressão permanece.)*
- 🔶 **Substituição da Mesa node-rooted:** `selecionarRaizMesa/renderMesa/cardHTML/desenharLinhas/persistirPosicao/abrirEditorCard` serão **refatorados/removidos** — limpeza obrigatória para não duplicar dois motores de canvas.
- 🔶 **Chave de linha bidirecional:** usar par ordenado de IDs (não origem/destino) para casar com `world_links` (Regra 4.4).
- 🔶 **Zoom + arrasto:** as coordenadas do arrasto precisam dividir pelo `zoom` para não "fugir" do cursor.
- 🟢 **Salvar manual** (não auto-save) já é o pedido — alinhado à Regra 2.7.

### Decisões de layout (confirmadas pelo utilizador)
| Parte | Escolha | Implicação |
|---|---|---|
| **Toolbar** | Faixa flutuante no **topo** (horizontal) | Barra acima do grid com: dropdown de tabuleiros, Novo, Salvar, Adicionar Zona, Adicionar Entidade |
| **Pan** | **Arrastar área vazia** do canvas | `pointerdown` no fundo (sem card/shape) → Pan; em card/shape → move o elemento. Sem teclas. *(Limitação aceite: não há pan "por cima" de um card.)* |
| **Troca de tabuleiros** | **Dropdown** na toolbar | `<select>` que carrega o board ao mudar; escala com muitos saves |
| **Zonas** | Rótulo **na borda** (estilo `<fieldset>`/legend) | Texto recortado na borda superior do retângulo |

---

## 7. Faseamento da implementação (slicing — Regra 5.2)
1. ✅ **Backend (CONCLUÍDO):** schemas Zod (`criarBoardSchema`/`atualizarBoardSchema`/`boardIdParamsSchema` + `dadosBoardSchema` com cores como tokens) + CRUD `world_boards` (`listarBoards/buscarBoard/criarBoard/atualizarBoard/deletarBoard`) + **sync engine** no `buscarBoard` (`= ANY($2::uuid[])` escopo crônica, remove nós/overrides órfãos, flag `atualizado_automaticamente`) + cliente `MundoApi.*Board`. Validado: `node -c` OK; schema aceita estrutura completa, **rejeita cor hex** (enum), nome vazio e boardId inválido; lógica de limpeza testada isolada. *(Não testado contra Postgres real.)*
2. ✅ **Frontend infra (CONCLUÍDO):** Mesa node-rooted **removida por completo** (JS+CSS+HTML, naming `war-table`/`mesa*` retirado). Novo engine `board-*`: toolbar no topo (dropdown de boards, Novo, Salvar, +Entidade, Excluir), **Pan** (arrastar fundo) + **Zoom** (wheel→cursor) via `transform` num `.board-world`, modal "+ Entidade", cards arrastáveis (delta/zoom), remover do board, **Salvar/Carregar** + **Toast de sync** (`atualizado_automaticamente`). Cores como tokens (`.board-cor-*` → vars). Validado: `node -c` OK; zero resíduo; handlers fiados. *(Não testado em browser.)*
3. ✅ **Shapes/Zonas (CONCLUÍDO):** botão "+ Zona"; retângulos arrastáveis + redimensionáveis (handle no canto), **rótulo na borda** (legend) editável por duplo-clique, remover no hover; persistem em `boardState.shapes`. Coords em mundo (delta/zoom); `stopPropagation` impede Pan acidental. Validado: `node -c` OK; schema faz round-trip do shape (rejeita sem `id`). **➡️ Critério de sucesso do prompt atingido: infra `world_boards` + Pan/Zoom + Shapes básicos persistem.** *(Não testado em browser.)*
4. ✅ **Edição visual (CONCLUÍDO):** linhas Bézier lendo os `world_links` reais entre os nós do board (`atualizarLinksBoard` reusa `listarLinks` + dedupe; caminho duplo hit+visível), que seguem o arrasto; clique na linha → popover (Aliado/Inimigo/Neutro · Sólida/Pontilhada → `overrides_linhas` por chave canônica). Duplo-clique no nó → popover com paleta de cores (tokens) + ícones de worldbuilding. Cor/dash data-driven via vars (Regra 2.5). Validado: `node -c` OK; handlers inline fiados. *(Não testado em browser.)*
5. ✅ **Limpeza final (CONCLUÍDO):** removidos `x/y/icone/cargo` (+ `ICONES_HIERARQUIA`) do `dadosLinkSchema` — voltou a ser só Panela de Pressão (tags/limite). Links antigos com esses campos são limpos no próximo save (strip do Zod). Testado: tags/limite validam, legados descartados.

**➡️ Fase 13 COMPLETA (fatias 1–5). Pendência única: validação ao vivo (browser + Postgres).**

---

## 8. Ressalvas honestas
- Este documento é **plano**, não implementação — nada foi escrito em código nesta operação.
- Como em todas as fases anteriores, **nada será validado contra Postgres/browser reais** apenas com `node -c` + Zod; exigirá **reiniciar o servidor** e teste ao vivo após implementar.
- A implementação só começa **após as decisões de layout** do utilizador.
