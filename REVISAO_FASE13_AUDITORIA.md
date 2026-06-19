# Auditoria de Revisão — Fase 13 (Tabuleiro de Campanha / Infinite Canvas)

**Data:** 2026-06-19 · **Branch:** `sandbox` · **Escopo:** revisão fatia-a-fatia das 5 fatias da Fase 13.
**Método:** verificação contra o código real (`node -c`, grep de conformidade, fiação de handlers, órfãos). **Nada foi executado contra Postgres/browser reais.**
**Objetivo:** servir de base para futuros consertos.

> **TL;DR:** As 5 fatias estão **funcionalmente completas e fiadas**, sem dead code real nem hex hardcoded, com anti-IDOR e queries parametrizadas corretos. **Não há quebra de sintaxe.** Os riscos reais são **de runtime não testado** (SVG via `innerHTML`, popover dentro de `overflow:hidden`) e alguns **itens menores** (perf de N-requests, desvios leves da Regra 2.5 já presentes no projeto). Há também **1 dívida pré-existente** fora da Fase 13 (XSS latente em `<option>` de núcleos).

---

## 1. Revisão por fatia

### Fatia 1 — Backend `world_boards` (CRUD + sync) — ✅ COMPLETA
- CRUD (`listarBoards/buscarBoard/criarBoard/atualizarBoard/deletarBoard`), rotas `/cronicas/:cronicaId/boards[...]`, schemas Zod, cliente API. `node -c` OK.
- **Sync engine** (`buscarBoard`): `SELECT id FROM world_nodes WHERE cronica_id=$1 AND id = ANY($2::uuid[])` → remove nós/overrides órfãos, flag `atualizado_automaticamente`. Não grava no GET (Regra 2.7).
- **Conformidade:** 4.1 (DML-only ✅), 4.3 (UUID ✅), 3.3.1 (`cronica_id` em todo WHERE ✅), 6.2 (parametrizado, `= ANY($2::uuid[])` ✅), 3.1 (Zod ✅).
- **Risco (R1):** se `dados.nodes[].id` contiver um valor **não-UUID** (JSONB corrompido/legado), o cast `$2::uuid[]` lança erro → **500**. Hoje só inserimos UUIDs válidos (via `getNodes`), mas falta blindagem defensiva (Regra 4.2 — resiliência a dados corrompidos). **Baixo risco / corrigir por robustez.**

### Fatia 2 — Infra do canvas (Pan/Zoom, boards, +Entidade) — ✅ COMPLETA
- Toolbar topo, Pan (arrastar fundo) + Zoom (wheel→cursor) via `transform`, +Entidade, Salvar/Carregar + Toast de sync. Mesa node-rooted (Fase 12) **removida por completo** (naming `war-*`/`mesa*` retirado; varredura limpa).
- **Conformidade:** Vanilla JS puro ✅; `transform`/`left`/`top` são layout dinâmico (uso permitido pela 2.5) ✅; salvamento manual (2.7) ✅.
- Sem dead code; todos os handlers do HTML existem no JS.

### Fatia 3 — Zonas/Shapes — ✅ COMPLETA
- "+Zona", retângulos arrastáveis/redimensionáveis, rótulo na borda (legend), em `boardState.shapes`. Schema faz round-trip e rejeita shape sem `id`.
- `stopPropagation` evita Pan acidental ao interagir com a zona. Coords em mundo (delta/zoom).

### Fatia 4 — Linhas + edição visual — ✅ COMPLETA (com riscos de runtime)
- Linhas Bézier lendo `world_links` reais (`atualizarLinksBoard` reusa `listarLinks` + dedupe por id), seguem o arrasto. Popover de estilo de linha (Aliado=verde `--link-aliado`, Inimigo=vermelho `--link-inimigo`, Neutro=cinza · sólida/pontilhada) → `overrides_linhas` por chave canônica (`chaveLinha` = par ordenado, consistente com o split do sync). Popover de duplo-clique no nó: paleta de cores (tokens) + ícones de worldbuilding.
- **Conformidade:** cor/`stroke-dasharray` inline são data-driven (exceção 2.5) ✅; cores via vars (sem hex) ✅; `escapeHTML` em nome/tipo/label ✅.
- **Risco (R2) — ALTO p/ verificar:** o desenho usa `svg.innerHTML = paths`. Setar `innerHTML` num elemento **SVG** é suportado só em browsers modernos; como **nada foi testado em browser**, há chance de as linhas não renderizarem se o ambiente-alvo for antigo. (O projeto já usa `color-mix`, o que sugere browser moderno — risco provavelmente baixo, mas **não confirmado**.)
- **Risco (R3) — MÉDIO:** popovers (`.board-popover`) são filhos de `.board-canvas`, que tem `overflow:hidden`. Se um popover exceder a margem do clamp (~224×220px), é **recortado**. Hoje cabe, mas é frágil — ideal ancorar ao `body` (fixed) ou medir e reposicionar.
- **Risco (R4) — MÉDIO/perf:** `atualizarLinksBoard` faz **1 chamada `listarLinks` por nó** do tabuleiro. Aceitável no MVP; com boards grandes vira gargalo (API spam). Sugere endpoint backend "links entre N nós".
- **Nit (R5) — BAIXO:** popovers não fecham ao clicar fora nem ao trocar de tabuleiro (ficam "presos" até Fechar/ação). UX menor.

### Fatia 5 — Limpeza — ✅ COMPLETA
- `x/y/icone/cargo` + `ICONES_HIERARQUIA` removidos do `dadosLinkSchema` (voltou a `{tags,limite}` da Panela). Testado: legados são descartados (strip). Sem referências remanescentes.

---

## 2. Achados transversais

### 2.1 Quebras de sintaxe / funcionais
- **Nenhuma.** `node -c` OK nas 5 camadas; todos os handlers `onclick/onchange` inline referenciam funções existentes; nenhuma função órfã.

### 2.2 Lixo / dead code
- **Nenhum real.** `.board-cor-*` parecem órfãos num grep ingênuo, mas são aplicados **dinamicamente** (`board-cor-${cor}`). `board-select`/`board-entidade` são **ids**, não classes. Naming antigo (`war-*`/`mesa*`) 100% removido.

### 2.3 Desvios da ARQUITETURA.md
- **(D1) Regra 2.5 — leve, pré-existente:** modais/popovers injetados usam `style="display:flex; gap; justify-content"` (layout) inline em vez de classe (ex.: botão do seletor de entidade, cabeçalhos de modal). É **layout**, não cor/fonte, e **segue o padrão já existente em todos os modais do projeto** — porém estritamente a 2.5 pede classes. Baixa prioridade; padronizar em refactor futuro.
- Sem outros desvios: cores por vars/tokens, UUID, anti-IDOR, parametrização, DML-only, salvamento manual, Vanilla puro, `escapeHTML` no conteúdo dinâmico do board — todos respeitados.

### 2.4 Dívida PRÉ-EXISTENTE (fora da Fase 13, mas registrada)
- **(P1) XSS latente:** `<option value="${n.id}">${n.nome}</option>` **sem `escapeHTML`** em selects de núcleos (`controle_mundo.js` ~linhas 123, 1407, 1658, 1664). Não foi introduzido pela Fase 13, mas viola a Regra 6.1 e deve entrar no backlog.

### 2.5 Partes do prompt não 100% literais
- **(S1)** Ícones de worldbuilding: incluí `castle, landmark, map, mountain, tent, coins, swords, shield, crown, flag, gem, user`. O prompt citou "estradas" — **não há um ícone literal de estrada** (usei `map`/`route`-like como aproximação). Ajuste cosmético se desejado.

---

## 3. Backlog priorizado de consertos (base para o futuro)
| ID | Prioridade | Item | Ação sugerida |
|----|-----------|------|---------------|
| R2 | 🔴 Alta (verificar) | Linhas via `svg.innerHTML` | **Testar em browser**; se falhar, montar paths via `createElementNS` |
| — | 🔴 Alta | Nada testado ao vivo | Reiniciar servidor (sem nodemon) + hard-refresh; rodar o roteiro do §4 |
| R3 | 🟡 Média | Popover recortado por `overflow:hidden` | Ancorar popover ao `body` (position fixed) e reposicionar |
| R4 | 🟡 Média | N chamadas `listarLinks` por board | Endpoint backend "links entre conjunto de nós" (1 query) |
| R1 | 🟢 Baixa | `$2::uuid[]` em id corrompido → 500 | Filtrar ids por regex UUID antes do cast (Regra 4.2) |
| P1 | 🟢 Baixa | XSS em `<option>` de núcleos (pré-existente) | `escapeHTML(n.nome)` nesses selects |
| R5 | 🟢 Baixa | Popover não fecha ao clicar fora | Listener de "click outside" / fechar no `abrirBoard` |
| D1 | 🟢 Baixa | `style=` de layout inline em modais | Migrar para classes utilitárias (refactor amplo) |
| S1 | ⚪ Cosmético | Ícone "estrada" ausente | Adicionar `route`/`milestone` à `ICONES_BOARD` |

---

## 4. Roteiro de validação ao vivo (obrigatório antes de confiar)
1. Reiniciar `node server.js` + hard-refresh (Ctrl+Shift+R).
2. Criar tabuleiro → **+ Entidade** (várias) → **+ Zona** (mover/redimensionar/renomear).
3. **Pan** (arrastar fundo) + **Zoom** (scroll) — confirmar que cards, zonas e **linhas** acompanham.
4. Conectar duas entidades (aba Mundo → Conexões) e confirmar que a **linha aparece** no tabuleiro (valida R2).
5. Clicar na linha → trocar cor/estilo; duplo-clique no nó → cor/ícone.
6. **Salvar** → trocar de tabuleiro → voltar: tudo deve persistir (camera/nodes/shapes/overrides).
7. Apagar uma entidade no banco e reabrir o board → **Toast de sincronização** + nó sumido.

---

## 5. Conclusão honesta
A Fase 13 está **íntegra no código** (sem quebras, sem lixo, aderente à arquitetura salvo o desvio leve D1 já endêmico). O que **não** posso afirmar é que *funciona* — toda a verificação foi estática (`node -c` + Zod + análise). O maior risco aberto é **R2 (SVG via innerHTML)**, justamente porque é central à fatia 4 e nunca rodou num browser. O backlog do §3 é a base para os consertos.
