# Esboço & Análise de Viabilidade — "Constelação" (Graph View do Mundo)

> Análise de parceiro (não implementado). Avalia a ideia de um Graph View estilo Obsidian contra a arquitetura real do projeto. Premissas verificadas contra o código (file:line). Ambiente sem Postgres/browser — só validação estática. Ler junto: `ARQUITETURA.md`, memórias `project-zoom-double-scaling`, `project-estado-arquitetural`, `project-modais-utilitarios`.

## A ideia
"Constelação": um **Graph View read-only** de TODA a crônica (`world_nodes` + `world_links`), com física *force-directed* (proposto: `d3-force`) desenhada num `<canvas>` HTML5. Complementa o **Tabuleiro** (curadoria manual) com uma visão automática/orgânica do grafo inteiro. Decisões do Narrador: escopo Mundo Inteiro, Read-Only (não salva posições), motor d3-force via CDN só para a matemática + render em canvas.

**Conceito: sólido e desejável. Cabe no produto.**

## Compatibilidade arquitetural — pontos de atrito
1. **d3-force NÃO está na allowlist (Regra 1).** Só GridStack é permitido; lib nova "requer autorização explícita". Argumento "math-only, UI continua vanilla" é defensável, mas é decisão do usuário. Alternativa pura: hand-roll da física (~60–90 linhas Verlet + repulsão), sem dependência.
2. **CDN bloqueado pela CSP + contraria o padrão self-hosted.** `helmet` em `server.js:46` → `scriptSrc: ["'self'","'unsafe-inline'","https://static.cloudflareinsights.com", ...CORS]` — **jsdelivr não está lá** → o `<script src="cdn.jsdelivr...d3-force">` é **bloqueado**, `d3` fica `undefined`, `abrirConstelacao` quebra. Todas as libs são self-hosted (`controle_mundo.html:330-339`). **Correto: vendorizar `d3-force.min.js` em `/public/js/`.**
3. **Inline styles violam a Regra 2.5** (acabamos de limpar nas Slices 1–6). Overlay/canvas/botão (`style="position:fixed; inset:0; z-index:99999…"` etc.) → têm que virar **classes** (`.constelacao-overlay`, …) reusando tokens (`--bg-principal`).
4. **Canvas fura o Design System.** Cores/fontes do canvas não herdam CSS. Para coesão de cores (Regra 2.5, proibido hardcoded) e tipografia (Manrope/Cormorant), o render precisa **ler tokens** via `getComputedStyle(document.documentElement).getPropertyValue('--roxo-mago')` e setar `ctx.font`. O prompt só faz hand-wave.
5. **Armadilha `:root{zoom:1.33}`** (memória `project-zoom-double-scaling`). `canvas.width = window.innerWidth` + CSS `width:100%` sob zoom → backing-store e tamanho exibido **descasam**; `forceCenter(canvas.width/2)` centraliza errado. Precisa contabilizar o zoom (e `devicePixelRatio` p/ nitidez).
6. **Lucide:** o `<i data-lucide="x">` do botão Fechar exige `lucide.createIcons()` após exibir (Regra 2.3) — não mencionado.

## É possível? SIM
Canvas + force-directed é a escolha **certa** para performance com muitos nós (melhor que DOM/SVG). `sim.stop()` no fechar (já previsto no prompt) é importante p/ não deixar o rAF rodando. v1 read-only é simples.

## É viável? O furo central está nos DADOS
- **Nós:** trivial — já existe `nodesCache` (`controle_mundo.js:7`, populado por `carregarMundo` de `GET /cronicas/:id/nodes`). **Reusar o cache** (Regra 7: opera sobre o cache, não refaz fetch).
- **Links: NÃO existe endpoint "todos os links da crônica".** Só por nó (`mundoRoutes.js:56` → `listarLinks(cronicaId, nodeId)`). Para "Mundo Inteiro" precisa de todos. Duas saídas, ambas com custo ignorado pelo prompt:
  - **(a) N chamadas `listarLinks`** (uma por nó) + dedupe → **esbarra no rate limit de 100 req/min/IP** (`server.js:103`). Crônica >100 nós **estoura ao abrir**; burst feio mesmo abaixo disso.
  - **(b) Criar endpoint bulk** `GET /cronicas/:cronicaId/links` (1 query `SELECT … WHERE cronica_id=$1`, anti-IDOR Regra 3.3.1 + Zod + controller). **Caminho correto e barato no backend** — mas é **fatia de backend não prevista** no enquadramento "frontend-only".
  
  ➡️ **MAIOR LACUNA DE VIABILIDADE:** no escopo "Mundo Inteiro", a feature **exige um endpoint bulk de links que não existe.**

## Premissas falsas do prompt (corrigir antes de codar)
- `api.get('/api/mundo/chronicle/...')` → **não existe**. Real: `MundoApi` + `API.fetch('/cronicas/:cronicaId/...')`, **cookie-only** (sem `/api/`, sem Bearer).
- "estado global com todos os `world_links`" → **não existe**; só de nós (`nodesCache`).
- "à prova de falhas com muitos nós" → o canvas garante o **render** fluido, mas o **gargalo real** é o **fetch dos links** (rate limit), não o desenho.

## Veredito
Ideia boa e cabe no projeto, mas o prompt está **subdimensionado**. Pré-requisitos antes de uma linha de código:
1. **Decidir a dependência:** autorizar `d3-force` **vendorizado** (não-CDN) **ou** hand-roll da física.
2. **Adicionar o endpoint bulk de links** (fatia de backend pequena) — sem ele "Mundo Inteiro" não escala.
3. **Zero inline** (classes), canvas **lendo tokens CSS + fonte**, e **tratar o zoom 1.33**.
4. **(UX) Considerar pan/zoom** (wheel/drag via transform no ctx) — read-only sem navegação num grafo grande vira aglomerado ilegível.

## Plano de fatiamento sugerido (quando autorizado)
1. **Backend:** endpoint bulk `GET /cronicas/:cronicaId/links` (rota + Zod `cronicaId.uuid()` + controller com `WHERE cronica_id=$1`, anti-IDOR 3.3.1) + método `MundoApi.listarTodosLinks(cronicaId)`.
2. **Infra UI:** overlay + canvas + botão em **classes** (`global_ui.css`); vendor de `d3-force.min.js` em `/public/js/` (ou módulo de física hand-rolled).
3. **Dados:** `abrirConstelacao` → reusa `nodesCache` + `listarTodosLinks`; mapeia para `{nodes:[{id,nome,tipo}], links:[{source,target}]}`.
4. **Motor + render:** `forceSimulation` (link/charge/center + provável `forceCollide`); `renderFrame` no `tick` lendo tokens CSS (cor por `tipo`), fonte Manrope, tratando zoom/`devicePixelRatio`; `sim.stop()` no fechar.
5. **(Opcional) Navegação:** pan/zoom por wheel/drag; hover→destaque de vizinhos.

## Ponteiros
- `ARQUITETURA.md` (lei dourada). Memórias: `project-zoom-double-scaling`, `project-modais-utilitarios`, `project-estado-arquitetural`, `feedback-verificar-premissas-prompt`.
- Evidências: `server.js:46` (CSP), `server.js:103` (rate limit), `routes/mundoRoutes.js:56` (links por nó), `public/js/controle_mundo.js:7` (`nodesCache`), `public/js/api/mundoApi.js:116` (`listarLinks`).
