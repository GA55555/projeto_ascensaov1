# 🔗 Reta de Relação — Conexões como escala bipolar (−10..+10)

> **Lei dourada:** `ARQUITETURA.md`. Nada aqui pode violá-la. Este documento é o **guia** desta mudança
> (decisões travadas + roadmap + diário), no mesmo espírito do `oraculo.md`. Cada decisão foi validada
> contra o **código real** (file:line).

---

## 0. Origem da mudança (onde começou)
A feature de **conexões** entre entidades já existia como **"Contrato de Relação"**: cada sinapse
(`world_links`) guardava no JSONB `dados` um conjunto de `tags` (incidentes/motivos) que enchiam um
**termômetro de pressão** (`pressão = nº de tags`, `limite` configurável, "MASSA CRÍTICA" ao encher).
Isso foi inclusive levado ao RAG (`oraculo.md`, commit `90d7383b` — `descreverContrato`/`textoDoNode`).

**A mudança:** trocar o termômetro unidirecional por uma **reta numérica bipolar de −10 a +10**. As tags
passam a ser **positivas ou negativas**; cada tag é **um passo** (positiva avança rumo a +10, negativa
recua rumo a −10). A **posição é derivada** da soma dos passos (fonte única = o log de tags), limitada
a ±10. É, em termos de indústria, um **medidor de afinidade bipolar event-sourced** (estilo "social
links"/reputação de RPG): guarda-se o log de eventos assinados e deriva-se a posição.

---

## 1. Decisões travadas (todas aprovadas pelo Narrador)

1. **Faixas/Tiers da reta (aprovado).** 4 tiers de intensidade pela **magnitude** da posição; o **sinal**
   dá o lado (aliado +, inimigo −). Esta tabela é **fonte única** (alimenta UI e RAG):

   | Faixa (\|posição\|) | Tier | Lado Aliado (+) | Lado Inimigo (−) |
   |---|---|---|---|
   | 0 | `neutro` | Neutro | Neutro |
   | 1–3 | `leve` | Cordial | Tenso |
   | 4–7 | `moderado` | Amistoso | Rival |
   | 8–10 | `extremo` | Aliado leal | Inimigo mortal |

2. **`tipo_vinculo` mantém-se** (rótulo da natureza: `associado`/`aliado`/`inimigo`; a reta dá a valência
   atual). UX da reta será apresentada na Fatia 2 para aprovação visual.
3. **Clamp em ±10** (aprovado): a soma satura nos extremos; tags além do limite seguem registradas
   (removê-las traz a agulha de volta) — lossless.
4. **Peso por tag = ±1 por enquanto** (aprovado), com **gancho futuro explícito** para passos variáveis:
   o cálculo já lê um `peso` opcional (default 1). Marcador no código: **`PESO_TAG`**.
5. **Polaridade de tags legadas** (string, sem sinal) inferida do `tipo_vinculo` (aprovado):
   `inimigo`→negativa, `aliado`→positiva, **`associado`/neutro/desconhecido → sem sinal (0, não move a
   agulha)**, editável depois na nova UI. **Sem `UPDATE` destrutivo em massa** (Regra 4.2).

---

## 2. Premissas validadas (prompt × código real)
- **Sem DDL (Regra 4.1):** estado vive em `world_links.dados` (JSONB) → mudança é DML (`UPDATE dados`).
- **Zod é o contrato (Regra 3.1):** `validators/mundoValidator.js → dadosLinkSchema` valida `dados`.
  `tags: z.array(z.string())` precisa virar **tolerante** (string legada **ou** `{texto, sinal, peso?}`).
- **`dados` hoje é só `{tags, limite}`** — os campos x/y/icone/cargo (Mesa de Guerra) saíram p/
  `world_boards.dados` na Fase 13. `limite` torna-se **obsoleto** (reta fixa ±10).
- **Re-index do RAG já coberto:** `mundoController.atualizarLink` re-indexa **ambos** os nós ao mudar o
  `dados` (Regra 4.2); `criarLink` indexa na criação. Nós antigos pegam o texto novo no próximo Big Bang.
- **Tipos de vínculo reais** (`controle_mundo.js`): select oferece `associado`, `aliado`, `inimigo`
  (+`localizacao` p/ links estruturais de local).

## 3. Conformidade com a `ARQUITETURA.md`
- 4.1 (DDL): nenhum — JSONB. · 3.1 (Zod): `dadosLinkSchema` tolerante. · 4.2 (resiliência): leitura
  tolerante de legado, sem migração destrutiva. · 1/2.5/2.6 (front, Fatia 2): reta **vanilla**, cores por
  **tokens** (positivo/negativo nunca hardcoded), geometria sóbria, contraste de estados. · 6.1 (XSS):
  `escapeHTML` no texto da tag. · 5.2 (slicing): API/contrato → frontend.

---

## 4. Roadmap (fatiado)

### 🍕 Fatia 1 — Modelo + Contrato (Zod) + RAG  ⟵ **ESTA**
- **`services/relacaoEscala.js` (novo, fonte única da lógica):** constantes `POS_MIN/POS_MAX` (±10),
  `clamp`, `tier(posicao)` (tabela da decisão 1), `normalizarTags(tags, tipoVinculo)` (tolerante a string
  legada — decisão 5), `passoDaTag` (com gancho `PESO_TAG`), `lerRelacao(dados, tipoVinculo)` → `{posicao,
  tier, tags, min, max}`.
- **`validators/mundoValidator.js`:** `dadosLinkSchema.tags` aceita **string (legado) OU `{texto, sinal:
  1|−1|0, peso?}`**; `limite` vira `.optional()` (obsoleto, tolerado p/ não quebrar gravações da UI atual).
- **`services/oraculoTexto.js`:** `descreverContrato(dados, tipoVinculo)` reescrito p/ a reta (incidentes
  assinados + posição/lado), via `relacaoEscala`. Call site passa `r.tipo_vinculo`.
- **Segurança da fatia:** contrato **tolerante** → a UI antiga (que grava strings) continua funcionando;
  só o RAG passa a falar em "reta". Estado interino consciente: UI mostra termômetro, RAG fala reta —
  alinhado na Fatia 2.
- **Teste:** estático (node --check) + unit do helper/describer (sem browser/Postgres aqui).

### 🍕 Fatia 2 — Frontend (a reta numérica)
- Componente **reta −10..+10** com marcador na posição; tags com **toggle de sinal** (+/−); pills por
  token; substitui `barraPressaoHTML`/badge/`corpoContratoHTML`; cor da linha da sinapse no Tabuleiro pela
  valência. Mirror do `relacaoEscala` no browser (sem build → manter em sync, documentado aqui).
- Enviar ao Narrador **opções de UX** (mockups) antes de fechar (decisão 2).

### 🍕 Fatia 3 — Limpeza/migração (opcional)
- Utilitário p/ assinar tags legadas em massa (opt-in) e aposentar `limite`/CSS do termômetro.

---

## 5. Riscos / débitos
- **Dados legados:** resolvidos por leitura tolerante; sem migração destrutiva.
- **Substituição visível:** o termômetro/massa-crítica do RAG (commit `90d7383b`) é **substituído** —
  evolução esperada.
- **Sync Node↔browser** do `relacaoEscala` é manual (sem build) — a tabela de tiers (§1.1) é a canônica.
- **Smoke ao vivo** fica com o Narrador (sem Postgres/browser no dev).

---

## 6. 🛠️ Diário de Implementação
> Reflete o **código real** (sobrepõe-se ao §1–§5 em divergência). Branch `sandbox`; deploy = git pull +
> pm2 restart (Node `mochila`, Python `oraculo`).

### Sessão de abertura (decisões + Fatia 1)
- Decisões 1–5 travadas (§1). Guia criado.
- **Fatia 1 — Modelo + Contrato + RAG (✅ feito, validado estaticamente):**
  - `services/relacaoEscala.js` (novo) — fonte única: `POS_MIN/MAX` (±10), `clamp`, `tier` (tabela §1.1),
    `passoDaTag` (gancho `PESO_TAG`), `normalizarTags` (tolerante a string legada — decisão 5),
    `lerRelacao(dados, tipoVinculo)`.
  - `validators/mundoValidator.js` — `dadosLinkSchema.tags` agora aceita **string legada OU `{texto,
    sinal:1|−1|0, peso?}`** (contrato tolerante); `limite` → `.optional()` (obsoleto).
  - `services/oraculoTexto.js` — `descreverContrato(dados, tipoVinculo)` reescrito p/ a reta (fatores de
    aproximação/afastamento + posição/lado); call site passa `r.tipo_vinculo`.
  - **Testes (node):** misto, extremo, clamp ±10, legado inimigo/aliado/associado(neutro), `PESO_TAG`,
    null/sujo — todos corretos. **Smoke ao vivo PENDENTE** (sem Postgres/browser no dev).
  - **Estado interino consciente:** UI ainda mostra o termômetro; o RAG já fala em "reta". Alinha na
    Fatia 2. A UI antiga continua funcionando (grava string → contrato tolerante a aceita).
- **PRÓXIMO:** Fatia 2 (frontend da reta) — enviar opções de UX ao Narrador (decisão 2) antes de codar.
