# ⭐ Reputação — Fama/Infâmia global da entidade (escala bipolar −10..+10)

> **Lei dourada:** `ARQUITETURA.md`. Nada aqui pode violá-la. Este é o **guia** desta feature (decisões
> travadas + roadmap + decisões em aberto), no mesmo espírito do `reta_relacao.md` e do `oraculo.md`.
> Cada premissa foi validada contra o **código real** (file:line). **Status: PLANO — nada implementado.**

---

## 0. Conceito (e o que NÃO é)

**Reputação** = como o **mundo** percebe uma entidade — a sua **fama (+) ou infâmia (−)** GLOBAL. É um
**terceiro eixo**, distinto do que já existe:
- **Reta de Relação** (`world_links.dados`, [[reta_relacao]]): afinidade entre **duas** entidades.
- **Diplomacia** (`nucleo_diplomacia`): relação entre **facções**.
- **Relevância** (derivada em `constelacao.js`): centralidade (grau + papel) que dita o **raio** no astrolábio.

A reputação é **do indivíduo, perante o mundo** (não por facção, não do grupo) — decisão do Narrador.

---

## 1. Decisões travadas (aprovadas pelo Narrador)

1. **Sujeito↔plateia: da entidade, GLOBAL.** Um único valor de fama/infâmia por `world_node`, válido no
   mundo todo (não é uma matriz entidade→facção).
2. **Escala: reta bipolar −10..+10**, reusando o modelo **event-sourced** da Reta (a posição é **derivada**
   da soma de eventos assinados, saturando em ±10 — *lossless*).
3. **Dinâmica: ledger manual com motivo.** O Narrador **adiciona/remove** eventos de reputação assinados
   (ex.: `+1 "Salvou a vila de Pedravale"`, `−1 "Traiu a Coroa"`). Remover um evento traz a agulha de volta.
4. **Peso por evento = ±1 por enquanto** (gancho futuro p/ pesos variáveis — marcador `PESO_REP`, espelhando
   o `PESO_TAG` da Reta).
5. **Tiers de reputação (magnitude → tier; sinal → fama/infâmia):**

   | \|posição\| | tier | Fama (+) | Infâmia (−) |
   |---|---|---|---|
   | 0 | `neutro` | Desconhecido | Desconhecido |
   | 1–3 | `leve` | Conhecido | Malvisto |
   | 4–7 | `moderado` | Respeitado | Temido |
   | 8–10 | `extremo` | Reverenciado | Odiado |

6. **Utilidade (4 frentes aprovadas):**
   - **(a) Contexto pro Oráculo/IA** — a IA sabe como o mundo vê o personagem.
   - **(b) Eixo visual no astrolábio** — fama/infâmia vira uma camada visual no orbe (ver §5, decisão aberta).
   - **(c) Gatilho narrativo** — referência pro Narrador (facções reagem); sem automação dura nesta versão.
   - **(d) Influencia a INTENSIDADE das alianças/inimizades da facção da entidade** — a reputação agregada
     dos membros amplifica/atenua a força (|tensão|) dos laços diplomáticos do núcleo (ver §4 Fatia 4).

---

## 2. Premissas validadas (× código real)

- **Sem DDL (Regra 4.1):** estado vive em `world_nodes.dados.reputacao` (JSONB) — mesmo lugar de
  `avatar_url`/`historia`/`tarot`. Mutação é DML (`UPDATE dados` com MERGE, igual a `salvarHistoriaNode`
  `controllers/mundoController.js`).
- **Núcleo numérico REUSÁVEL:** `services/relacaoEscala.js:58` exporta `POS_MIN/POS_MAX` (±10), `clamp`,
  `tier`, `passoDaTag`. A reputação reusa isso; só os **rótulos** (tabela §1.5) e a leitura por `eventos`
  (em vez de `tags`+`tipoVinculo`) são próprios → fino wrapper `services/reputacaoEscala.js` (+ espelho
  `public/js/reputacaoEscala.js`, como o par da Reta).
- **RAG já tem o ponto de entrada:** `services/oraculoTexto.js:52 textoDoNode` é onde entra um
  `descreverReputacao(dados)` (ao lado de `descreverTarot`/`descreverContrato`). Reindex já é fire-and-forget.
- **Intensidade no astrolábio = `tensão`:** `public/js/constelacaoCalc.js:64` monta `tensao = clamp(dip +
  ajusteReta, …)`. A utilidade (d) entra como um **fator de reputação agregada** do núcleo multiplicando a
  magnitude — mas o snapshot precisa passar a reputação por entidade (`listarConstelacao`).
- **Feixe já existe** como anfitrião da UI (`abrirFeixe` em `constelacao.js`): a seção de reputação mora lá,
  reusando o padrão visual das tags da Reta (`controle_mundo.js`).

---

## 3. Conformidade com a `ARQUITETURA.md`
- **4.1** (DDL): nenhum — JSONB. · **3.1** (Zod): schemas de add/remove evento. · **3.3.1/6.2** (anti-IDOR):
  toda mutação amarra `WHERE id = $1 AND cronica_id = $2`; 404 se de outra crônica. · **4.2** (resiliência):
  leitura tolerante de `dados.reputacao` ausente/legado (sem migração destrutiva). · **2.5** (tokens): aura
  por `--dourado` (fama) / `--link-inimigo`|`--erro` (infâmia), nunca hardcoded. · **6.1** (XSS): `escapeHTML`
  no texto do evento. · **2.3** (lazy): ledger buscado só ao abrir a seção no feixe. · Sync Node↔browser do
  `reputacaoEscala` é manual (sem build) — a tabela §1.5 é a canônica.

---

## 4. Roadmap (fatiado)

### 🍕 Fatia 1 — Modelo + contrato + endpoints + RAG  ✅ **FEITA** (ver §7)
- `services/reputacaoEscala.js` (novo, fonte única): reusa `relacaoEscala` (clamp/tier/passoDaTag);
  `lerReputacao(dados)` → `{ posicao, tier, rotulo, eventos, min, max }` (posição = Σ `sinal*peso`, clamp ±10);
  `rotuloReputacao(posicao)` (tabela §1.5). Espelho browser `public/js/reputacaoEscala.js`.
- `validators/mundoValidator.js`: `addReputacaoSchema` (`{ texto: max 200, sinal: 1|−1, peso?: default 1 }`),
  `removerReputacaoSchema` (param `:eventoId`). Cada evento ganha um `id` estável (gerado no add) p/ remoção.
- `controllers/mundoController.js`: `obterReputacaoNode` (GET, lazy 2.3) · `adicionarReputacaoNode` (POST,
  append em `dados.reputacao.eventos`, anti-IDOR, **reindex Oráculo**) · `removerReputacaoNode` (DELETE por
  `eventoId`, lossless, anti-IDOR, reindex).
- Rotas `GET/POST /nodes/:id/reputacao` + `DELETE /nodes/:id/reputacao/:eventoId`.
- `services/oraculoTexto.js`: `descreverReputacao(dados)` → "Reputação: Reverenciado (+9) — fatos: …".
- **Teste:** estático (`node --check` + boot) + unit do `reputacaoEscala` (soma/clamp/tier/rótulo).

### 🍕 Fatia 2 — Frontend no feixe (o ledger)  ✅ **FEITA** (ver §7)
- Seção "Reputação" no painel do feixe: **barra divergente + agulha** + tier/rótulo (reusa a estética de
  `barraRetaHTML` da Reta), **lista de eventos** (texto + selo +/− + `×` p/ remover) e form de **adicionar**
  (texto + botões **+Fama / −Infâmia**, Enter = +). Lazy GET ao abrir; mutações fora do `onMutacao` que
  recarrega o disco (igual ao skip de `/historia`) — exceto quando a posição muda o **visual** (Fatia 3),
  aí refrescar é desejável (decidir o gatilho mínimo).

### 🍕 Fatia 3 — Eixo visual no astrolábio  ✅ **FEITA** (ver §7) — decisão §5.2 fechada: AURA
- Reputação vira uma camada no orbe **independente** do raio (relevância) e da cor do anel (afinidade).
  Recomendado: **AURA** — `drop-shadow`/halo cuja intensidade ∝ |posição| e a cor pelo sinal (fama dourada /
  infâmia avermelhada). `listarConstelacao` passa `reputacao` (posição derivada) por entidade.

### 🍕 Fatia 4 — Utilidade (d): intensidade das alianças/inimizades da facção  ✅ **FEITA** (ver §7)
- `constelacaoCalc.js`: agrega a reputação dos membros de cada núcleo → `fatorReputacao(núcleo)` que
  **multiplica a |tensão|** dos laços diplomáticos desse núcleo (alianças mais fortes / inimizades mais
  intensas quando há membros reverenciados/odiados). Mantém clamp em ±10. Precisa do snapshot da Fatia 3.

---

## 5. Decisões AINDA em aberto (resolver no início de cada fatia)
1. **Rótulos dos tiers (§1.5):** confirmar o vocabulário (Desconhecido/Conhecido/Respeitado/Reverenciado ↔
   Malvisto/Temido/Odiado) ou ajustar ao tom Dark Fantasy.
2. ~~**Fatia 3 — canal visual.**~~ ✅ **RESOLVIDO: AURA** (Narrador escolheu). Reputação = halo do orbe
   (fama dourada radiante / infâmia vermelha sombria, ∝ |posição|); a **afinidade migrou para SÓ o anel**
   (liberou o orbe, sem colisão de cor).
3. ~~**Fatia 4 — fórmula da amplificação.**~~ ✅ **RESOLVIDO:** notoriedade = **média da |reputação| de
   TODOS os membros**; multiplica a |tensão| por `1+REP_FATOR*notorMédia/10` (`REP_FATOR=0.6`). Calibrar no smoke.
4. **Peso por evento:** ±1 fixo agora (`PESO_REP`), pesos variáveis no futuro.

---

## 6. Riscos / débitos
- **Dupla fonte de "intensidade":** a Reta já afina a tensão (`RETA_FATOR`); somar reputação (Fatia 4) pode
  empilhar efeitos — definir a ordem/composição com cuidado e testar ao vivo.
- **Sobrecarga visual** no orbe (raio + cor + aura) — a Fatia 3 deve ser sóbria.
- **Sync Node↔browser** do `reputacaoEscala` é manual (sem build).
- **Smoke ao vivo** (sem Postgres/browser no dev) fica com o Narrador a cada fatia.

---

## 7. 🛠️ Diário de Implementação

### 🍕 Fatia 1 — Modelo + contrato + endpoints + RAG (✅ feito, validado estaticamente)
- **`services/reputacaoEscala.js` (novo, fonte única):** reusa `relacaoEscala` (`clamp`/`passoDaTag`,
  POS_MIN/MAX ±10); `tierReputacao` (tabela §1.5 — fama: Conhecido/Respeitado/Reverenciado × infâmia:
  Malvisto/Temido/Odiado; neutro=Desconhecido); `normalizarEventos` (tolerante a jsonb sujo, `PESO_REP`);
  `lerReputacao(dados)` → `{posicao, tier, eventos, min, max}` (posição = Σ `sinal*peso`, clamp ±10).
- **`public/js/reputacaoEscala.js` (espelho browser):** `window.ReputacaoEscala`, reusa `window.RelacaoEscala`
  (carregado antes). Registrado no `controle_mundo.html` após `relacaoEscala.js`.
- **`validators/mundoValidator.js`:** `adicionarReputacaoSchema` (`texto≤200`, `sinal: 1|−1`, `peso?` 1–10
  default 1) + `removerReputacaoSchema` (`params.eventoId` uuid).
- **`controllers/mundoController.js`:** `obterReputacaoNode` (GET lazy), `adicionarReputacaoNode` (append
  evento `{id:uuid, texto, sinal, peso}` ao ledger, MERGE sem clobber, anti-IDOR, reindex), `removerReputacaoNode`
  (filtra por `eventoId`, lossless, anti-IDOR, reindex). Todos devolvem a leitura derivada.
- **Rotas:** `GET/POST /nodes/:id/reputacao` + `DELETE /nodes/:id/reputacao/:eventoId`.
- **RAG:** `oraculoTexto.descreverReputacao(dados)` → linha "Reputação: … (tier) posição N" no `textoDoNode`.
- **Testes:** `node --check` + boot ok; **unit do `reputacaoEscala`** (vazio→Desconhecido, +3→Conhecido,
  peso, clamp +10→Reverenciado, −9→Odiado, jsonb sujo) — todos passaram. **Smoke ao vivo PENDENTE** (Narrador).

### 🍕 Fatia 2 — Ledger no feixe (✅ feito, validado estaticamente)
- **`public/js/constelacao.js`:** nova ação "Reputação" no feixe → `feixeReputacao(wrap,id)` (lazy GET) +
  `renderReputacao(box,data)` + `barraReputHTML(posicao)`. Barra+agulha **reusa** `.reta-barra/.reta-*`;
  eventos = pills `.tag.tag--fama|infamia` com `×` (remove por `data-rep-del=eventoId`); add via input +
  botões **+Fama**/**−Infâmia** (`data-rep-act=1|−1`, Enter = +Fama). Listeners DELEGADOS no `box` (sobrevivem
  ao re-render do innerHTML). Cada add/remove re-renderiza no lugar a partir do **retorno do endpoint** —
  **sem fechar o feixe** (`/reputacao` adicionado ao SKIP do `onMutacao`, como `/historia`).
- **`public/css/global_ui.css`:** bloco `.reput-*` — só os tokens de **fama (`--dourado`)** / **infâmia
  (`--link-inimigo`)** (fills, pills `.tag--fama/--infamia`, botões `.btn-fama/.btn-infamia` com inversão de
  contraste no hover — Regra 2.6); reusa `.reta-barra/.tag/.tag-lista` (DRY, Regra 3).
- **`controle_mundo.html`:** `reputacaoEscala.js` carregado após `relacaoEscala.js`; cache `constelacao.js?v=21`,
  `global_ui.css?v=25`. node --check + CSS balanceado ok. **Smoke testado ao vivo pelo Narrador: OK.**

### 🍕 Fatia 3 — Eixo visual: AURA no orbe (✅ feito, validado estaticamente)
- **Backend (`mundoController.listarConstelacao`):** entidades passam a trazer `reputacao` (posição derivada
  −10..+10), lendo só `dados->'reputacao'` (não infla o snapshot com a história).
- **Frontend (`constelacao.js montarAstrolabio`):** a partir de `e.reputacao`, inline `--rep-cor`
  (`--dourado` fama / `--link-inimigo` infâmia), `--rep-blur` (∝ |pos|, 4..22px) e `--rep-bright` (fama >1
  radiante / infâmia <1 sombria) no `.astro-orbe`. Sem reputação → sem aura.
- **CSS (`global_ui.css`):** removidas as regras de tint de afinidade no orbe (`.astro-orbita.astro--* .astro-orbe`);
  **afinidade agora SÓ no anel** (`.astro-anel.astro--*`). Aura = 2º `drop-shadow(--rep-blur --rep-cor)` +
  `brightness(--rep-bright)` no `.astro-orbe .orbe-esfera` (e no hover, p/ não sumir ao passar o mouse).
- **3 canais limpos:** raio=relevância · anel=afinidade · aura=reputação. Cache `constelacao.js?v=22`,
  `global_ui.css?v=26`. node --check + boot + CSS balanceado ok. **Smoke ao vivo PENDENTE** (Narrador).

### 🍕 Fatia 4 — Intensidade da facção pela reputação (✅ feito, validado estaticamente)
- **`public/js/constelacaoCalc.js`:** `REP_FATOR=0.6` + `notoriedade(núcleo)` = média da |reputação| dos
  membros (0..10, lê `snapshot.entidades[].reputacao` da F3). A `tensão` de cada par de facções é multiplicada
  por `1 + REP_FATOR*((notor(a)+notor(b))/2)/10` → facções de membros reverenciados/odiados projetam alianças
  e inimizades **mais intensas** (×1..×1.6), ainda clampada em ±10.
- **Decisão §5.3 fechada:** a **magnitude** da reputação (fama OU infâmia) amplifica AMBOS os lados (alinha com
  "intensidade das alianças e dos inimigos"); agregação = **média** dos membros; `REP_FATOR` calibrável.
- **Cache:** `constelacaoCalc.js?v=2` (não tinha cache-buster). Unit da fórmula + node --check ok.
- **REPUTAÇÃO COMPLETA (F1–F4).** Resta só o smoke ao vivo + calibração. **Consonância:** ver
  `constelacao_soberana.md` (próxima fase — Constelação substitui a Grelha).
