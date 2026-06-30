# 👑 Constelação Soberana — a Constelação substitui a Grelha na gestão de entidades

> **Lei dourada:** `ARQUITETURA.md`. Nada aqui pode violá-la. Guia desta fase (decisões travadas + roadmap +
> decisões abertas), no espírito do `reta_relacao.md`/`reputacao.md`/`oraculo.md`. Premissas validadas contra
> o **código real** (file:line). **Status: PLANO — nada implementado.**

---

## 🔖 Retomada rápida (próxima sessão)

> **Onde paramos (código COMMITADO em `dbd0665a`, branch `sandbox`; F1b + esta nota estão por commitar):**
> - **Reputação — COMPLETA (F1–F4)** (guia `reputacao.md`): ledger no feixe, RAG, aura no orbe, amplifica a
>   facção. Só falta **smoke ao vivo + calibrar** constantes (`REP_FATOR=0.6`, `--rep-blur/-bright`, tiers).
> - **Constelação Soberana — F1 + F1b + F1c FEITAS (estático):** selos de marco no orbe + toggle (F1); gestão
>   no-code completa (F1b: sub-painel "Marcos" + popover de long-press); e o **Núcleo Holográfico Radial**
>   (F1c, §7) que **substitui o feixe retangular** — núcleo central + satélites (ações) num anel 360°
>   edge-aware; hover abre o holograma de conteúdo, clique fixa (pin). Resolve o "barulho" do painel antigo.
>   O orbe tem 4 camadas: raio=relevância · anel=afinidade · aura=reputação · **selos=marcos**.
> - **Ajustes do smoke da F1b aplicados:** long-press 380→**320ms**; **roda do mouse rola a lista** (antes
>   dava zoom no canvas); **setas ↑/↓ navegam os marcos** no sub-painel.
>
> **Aguardando do Narrador (smoke da F1c — o Núcleo Holográfico):** (1) o anel de satélites fica legível e
> bem posicionado (inclusive perto das bordas → vira arco)? (2) o hover abre o holograma certo e o clique
> fixa (pin) sem colapsar ao editar? (3) o "barulho" sumiu / está mais limpo? (4) clicar fora e Esc fecham
> como esperado? (5) densidade dos 7 satélites no anel está boa ou prefere reduzir/reagrupar?
>
> **Próximos passos, em ordem:**
> 1. **Soberana F2** — wiring marco→evento no feixe (`event_flag_weights`; vincular/pesar gatilhos). Próxima fatia.
> 2. **Soberana F3** — migrar foto/avatar + **busca que foca a entidade** (não haverá lista) e **remover a
>    Grelha** (`renderizarGridMundo`/`cardMundoHTML`/botão `data-view="grid"`); Constelação vira o padrão.
> 3. **Reputação** — fechar o smoke ao vivo + calibração (paralelo, quando o Narrador testar).
>
> **Decisões abertas a resolver no início das fatias:** densidade de selos (2ª fileira?); ergonomia do clique
> em orbe que orbita; busca sem lista; avatar no feixe; UI do peso de eventos no painel estreito (§5).
> **Deploy:** `git pull` + `pm2 restart` (Node `mochila`, Python `oraculo`).

---

## 0. Visão

A aba **Mundo** tem hoje 3 lentes (`view-toggle` em `controle_mundo.html`): **Grelha** (cards), **Constelação**
e **Direção de Cena**. A Grelha é a superfície densa de gestão de entidades (editar, foto, núcleo, deletar,
**marcos**, sinapses). A Constelação já absorveu quase tudo via **feixe holográfico** (História, Reputação,
Sinapses, Editar nome, Mudar núcleo, Deletar). Esta fase **aposenta a Grelha** e faz a Constelação ser a
**superfície soberana** — incluindo o que falta: **marcos** e a **relação com eventos**, de forma **no-code**.

---

## 1. Decisões travadas (aprovadas pelo Narrador)

1. **Grelha: REMOVER de vez.** A Constelação vira a única superfície de gestão; a lente Grelha
   (`renderizarGridMundo`/`cardMundoHTML`) e o botão do `view-toggle` saem. (Direção de Cena permanece.)
2. **Marcos = CAMADA VISUAL no orbe.** Os marcos (flags) viram selos/indicadores no próprio orbe
   (aceso=ligado / apagado=desligado); gestão no-code por **hover** (nome) + **clique** (toggle), com
   adicionar/renomear/apagar. Substitui a lista de marcos do card da Grelha.
3. **Eventos: WIRING COMPLETO marco→evento no feixe.** Do painel da entidade dá pra **vincular/desvincular e
   pesar** quais eventos um marco dispara — no-code total, sem ir à aba Eventos.

---

## 2. Premissas validadas (× código real)

- **Grelha a remover:** `renderizarGridMundo` (`controle_mundo.js:549`) + `cardMundoHTML` (`:499`) + o
  `view-toggle` (`controle_mundo.html`, `data-view="grid"`). `carregarMundo` (`:472`) busca `GET /nodes`
  (`listarNodes`, `mundoRoutes.js:54`) que **já traz as `flags`** de cada nó.
- **Marcos (flags):** API existente — `POST /nodes/:id/flags` (criar), `PUT /nodes/:id/flags` (toggle),
  `PUT /nodes/:id/flags/:flagKey` (renomear), `DELETE …/:flagKey` (`mundoRoutes.js:93-96`). **Não vêm no
  snapshot** da Constelação (`listarConstelacao`, `mundoController.js:782`, só `{id,nucleo_id,nome,tipo,reputacao}`).
  → F1 precisa levar as flags ao orbe (incluir no snapshot **ou** buscar por foco).
- **Marco→evento:** tabela `event_flag_weights (node_id, flag_key, event_id, peso)`. O front já faz o
  reverse-lookup `mapaDependenciasMarcos` (`controle_mundo.js:56`, montado em `:1482`) e há POST de gatilho
  `{node_id, flag_key, peso}` (`:1962`). A edição hoje mora na aba Eventos → F2 traz isso pro feixe.
- **O que só a Grelha faz hoje e precisa de casa nova:** **Foto/avatar** (`definirAvatarEntidade`, no feixe
  ainda não há), **busca/filtro por nome** (toolbar da Grelha), e a leitura rápida em lista. "Forjar Entidade"
  e criar-no-núcleo já existem (feixe/clica-segura/config de núcleo).

---

## 3. Conformidade com a `ARQUITETURA.md`
- **2.1/2.2/2.4** (não destruir o Core; API isolada): remover a Grelha não toca o Grid de Combate; reusar
  `MundoApi`. · **2.3** (lazy): flags/eventos buscados sob demanda (foco/feixe). · **2.5/2.6** (tokens,
  contraste): selos de marco e UI de eventos por token. · **3.1/3.3.1/6.2** (Zod, anti-IDOR, parametrizado):
  toda mutação de flag/gatilho amarra escopo (`world_flags`/`event_flag_weights` são tabelas-filhas → guard do
  pai `nodePertenceACronica`, já é o padrão da 3.3.1). · **4.1** (sem DDL): tudo nas tabelas existentes. ·
  **7.1/7.2** (drag nativo, divulgação progressiva): marcos no orbe = Hover Preview + ação no clique. · **6.1**
  (XSS): `escapeHTML` em nomes de marco/evento.

---

## 4. Roadmap (fatiado — construir os substitutos ANTES de remover a Grelha, Regra 5.2)

### 🍕 Fatia 1 — Marcos como camada visual no orbe (no-code)  ✅ **F1 (selos+toggle) + F1b (add/renomear/apagar) FEITAS (§7)**
- **Snapshot:** `listarConstelacao` passa a incluir `flags` por entidade (são leves: `{key,value}`). Alternativa
  lazy: buscar flags ao focar o núcleo. (Decidir em §5.)
- **Orbe:** render dos marcos como **selos** ao redor do orbe (aceso/apagado). **Hover** = nome do marco
  (Regra 7.2); **clique** = toggle (`PUT /nodes/:id/flags`). Um **+** abre input de novo marco; renomear/
  apagar por interação no selo. Marcos com **evento atrelado** (do `mapaDependenciasMarcos`) ganham um realce.
- **Débito:** UX de muitos marcos num orbe pequeno (anel de selos? satélites? overflow?) — §5.

### 🍕 Fatia 2 — Wiring marco→evento no feixe (no-code completo)  ✅ **FEITA (§7 F2)**
- Seção/painel ao clicar num marco: lista os **eventos** (EventosApi) e os gatilhos atuais daquele marco
  (`event_flag_weights`), permitindo **vincular/desvincular** e **ajustar o peso**. Reusa os endpoints de
  gatilho existentes (Fase 15). Mostra o reverse-lookup (`mapaDependenciasMarcos`) já no orbe (F1).
- **Débito:** caber a matriz marco×evento×peso num espaço enxuto; pré-visualizar o efeito na "pool" do evento.

### 🍕 Fatia 3 — Migrar o resto + aposentar a Grelha
- **Casa nova p/ o que falta:** **Foto/avatar** da entidade no feixe (reusar `definirAvatarEntidade`/upload,
  Regra 6.5); **busca** que encontra e **foca** a entidade na Constelação (substitui o filtro da Grelha, já
  que não haverá lista — §5); confirmar criar/forjar entidade acessível.
- **Remoção:** tirar a lente Grelha (`renderizarGridMundo`/`cardMundoHTML`/`marcoItemHTML` do caminho da aba),
  o botão `data-view="grid"` do `view-toggle`, e fazer a **Constelação o padrão** da aba Mundo. Limpar órfãos
  (grep) sem quebrar Direção de Cena nem o Tabuleiro.

---

## 5. Decisões AINDA em aberto (resolver no início de cada fatia)
1. ~~**Flags no snapshot vs. lazy.**~~ ✅ **RESOLVIDO: no snapshot** (`listarConstelacao` agrega as flags por
   entidade — leves).
2. ~~**UX dos selos de marco.**~~ ✅ **RESOLVIDO: ANEL DE SELOS** ao redor do orbe (aceso/vazado, hover=nome,
   clique=alterna). Pendência de smoke: como fica com 10+ marcos (segunda fileira/arco maior) e a ergonomia
   de clicar selo em orbe que orbita (mitigado pela rotação lenta + congelar no feixe).
3. **Busca sem lista** (F3): como achar uma entidade quando não há Grelha — campo que **foca o núcleo + acende
   a entidade** no astrolábio? Atalho/realce? (decisão 1 descartou a lista mínima.)
4. **Avatar no feixe** (F3): a foto da entidade volta como ação do feixe (sim, provável) e/ou como textura do orbe.
5. **UI do wiring de eventos** (F2): caber peso/vínculo no painel estreito do feixe vs. um drawer dedicado.

---

## 6. Riscos / débitos
- **Remover a Grelha é irreversível na UX** — só after F1+F2+F3 cobrirem 100% do que ela fazia (marcos, foto,
  busca). Não apagar antes (Regra 5.2).
- **Densidade visual no orbe** (marcos + aura de reputação + anel de afinidade + nome): risco de poluição —
  calibrar com sobriedade (Regra 2.5) e divulgação progressiva (7.2).
- **Wiring de eventos** é a parte mais complexa (matriz marco×evento×peso) — fatiar com cuidado.
- **Smoke ao vivo** (sem Postgres/browser no dev) crítico a cada fatia, em especial a interação no orbe.

---

## 7. 🛠️ Diário de Implementação

### 🍕 Fatia 1 — Selos de marco no orbe: visual + toggle (✅ feito, validado estaticamente)
- **Backend (`listarConstelacao`):** entidades passam a trazer `flags: [{key,value}]` (json_agg de
  `world_flags` por nó). Decisão §5.1: **no snapshot** (leves).
- **Frontend (`constelacao.js`):** `marcosOrbeHTML(flags)` desenha os marcos como **selos num anel** ao redor
  do orbe (raio 36, centro 28; aceso=preenchido/glow, desligado=ponto tênue; `title`=nome via `humanizarFlag`).
  Clique no selo (capturado em `ligarAstroDrag`, prioridade sobre abrir o feixe) → `toggleMarcoSeal`:
  **otimista** (alterna a classe + reverte no erro), `PUT /nodes/:id/flags`, atualiza o cache `entidadesAtual`.
  O `PUT /flags` entrou no **SKIP do `onMutacao`** (via `metodo`) → o disco **não** se refaz a cada toggle.
- **CSS:** `.astro-marco-seal` redondo por **clip-path** (tema Neovim zera radius), cor `--destaque` (não
  colide com ouro/vermelho dos outros canais). Cache `constelacao.js?v=23`, `global_ui.css?v=27`. node --check
  + boot + CSS balanceado ok.
- **Smoke ao vivo da F1 PENDENTE** (validar junto da F1b).

### 🍕 Fatia 1b — Gestão no-code de marcos (✅ feito, validado estaticamente)
Decisão do Narrador: **as duas superfícies** (sub-painel no feixe + popover no selo), com camada de mutação
**única** (Regra 2.9 + DRY) chamada por ambas.
- **Camada única (`constelacao.js`):** `marcoNorm` (espelha o backend: trim+lower+`_`), `flagsDe`,
  `criarMarco`/`renomearMarco`/`apagarMarco`/`setMarco` — cada uma mantém o cache `entidadesAtual` coerente e
  chama `ressincronizarSelos(id)` (re-desenha só o anel do orbe, sem refazer o disco). `toggleMarcoSeal`
  passou a delegar a `setMarco`. **Renomear envia a chave JÁ normalizada** como `novo_nome` (o backend grava
  cru) → mantém a convenção de underscore que o `humanizarFlag` assume.
- **Superfície 1 — sub-painel "Marcos" no feixe (soberana):** botão `data-fx="marcos"` → `feixeMarcos`. Lista
  vinda do cache (flags já no snapshot → **sem fetch**, Regra 2.3): cada linha = toggle (círculo/✓ via Lucide) +
  nome + renomear (inline) + apagar (2 passos "apagar?" 3s). Input `+ Novo marco (Enter)` encadeia. Um **único**
  listener delegado no box (Regra 2.9).
- **Superfície 2 — popover de long-press no selo:** segurar ~380ms no selo (em `ligarAstroDrag`) **congela o
  disco** e abre `abrirSeloPopover` ancorado ao selo (input renomear + apagar 2 passos). **Clique curto continua
  só toggle**; mover vira arrasto e cancela o long-press. `fecharFeixe` fecha o popover (mutuamente exclusivos).
- **CSS (`global_ui.css`):** `.fx-marco*` (sub-painel) e `.selo-pop*` (popover) só com tokens (Regra 2.5);
  delete confirmado reusa `.btn-del-marco-confirmar` (DRY). Versões: `constelacao.js?v=24`, `global_ui.css?v=28`.
  `node --check` ✓ · CSS balanceado (861/861) ✓ · sem emojis/inline-estético novos ✓.
- **Smoke da F1b — testado pelo Narrador:** (1) sub-painel OK, mas com ajustes de usabilidade; (2) long-press
  OK, reduzir p/ **320ms**; (3) clique curto no selo aprovado; (4) lista precisa rolar pela **roda** e navegar
  por **teclado**. → ajustes aplicados (320ms · `wheel` `stopPropagation` no feixe/popover · setas ↑/↓ no box).

### 🍕 Fatia 1c — Núcleo Holográfico Radial (✅ feito, validado estaticamente)
Feedback do Narrador: o feixe retangular fazia "barulho"; pediu uma visão sci-fi com **um holograma principal
e satélites de menu abrindo ao redor** por hover. Decisões travadas: **clique abre+congela** · **hover abre +
clique fixa (pin)** · **anel 360° edge-aware**.
- **`abrirFeixe` reescrito (`constelacao.js`):** substitui `.feixe-wrap/painel/raio` por um `.holo-wrap` com
  **núcleo central** (nome, tipo, chips relevância/afinidade) + **satélites** (7 ações) num **anel** ligado por
  linhas de luz. Layout dos satélites (inline): anel completo do topo se couber folga em todos os lados;
  senão **arco de 220°** voltado ao centro do canvas (edge-aware). Núcleo clampado p/ caber na tela.
- **Interação:** `pointerover`/`pointerout` com `relatedTarget` (cancela fecho ao entrar em satélite OU
  conteúdo) → hover abre o holograma de conteúdo após 110ms; `pointerout` p/ fora agenda fecho em 200ms (se
  não fixado). **Clique fixa (pin)**; clicar já-aberto só alterna o pin **sem re-render** (preserva edição de
  História/Marcos). `Esc` fecha conteúdo→feixe; **clique no vazio** fecha (em `ligarAstroDrag.fim`).
- **Reuso (DRY):** o conteúdo de cada satélite é hospedado num `.feixe-sub` dentro do `.holo-conteudo` e
  delega às funções existentes (`feixeHistoria`/`feixeReputacao`/`feixeMarcos`/`feixeEditarNome`/
  `feixeMoverNucleo`/`feixeDeletar`); `sinapses` permanece **só-clique** (abre o modal externo).
- **CSS (`global_ui.css`):** `.holo-*` com cor por afinidade (`--holo-cor`: neutro=destaque, aliado=dourado,
  inimigo=vermelho), glassmorphism + glow (Regra 2.5/2.6), `holo-surge`/`holo-fade` (respeitam
  `prefers-reduced-motion`). CSS do feixe antigo ficou órfão (inócuo) — remover na limpeza da F3.
- **Versões:** `constelacao.js?v=26`, `global_ui.css?v=29`. `node --check` ✓ · CSS balanceado (894/894) ✓ ·
  sem emoji/inline-estético novos ✓.
- **Smoke da F1c — testado pelo Narrador:** (1) anel funcionou, mas satélites entravam no núcleo → ajustar
  por ARESTA; (2) hover/pin aprovado; (3) "barulho" sumiu; (4) aumentar a distância das caixas; (5) 7
  satélites OK. Pedido de UX: linha de neon saindo da aresta do núcleo (projeção de tela), satélites
  flutuando ao redor — **mesma paleta/estilo, só o arranjo**.
- **Ajuste aplicado (`arrumarAnel`, pós-render):** posiciona cada satélite por ARESTA — `dCore` (centro→aresta
  do núcleo via interseção raio×retângulo) + `GAP=52` de flutuação + `satReach` (meia-extensão do satélite na
  direção radial, função-suporte da caixa) → satélites ficam FORA do núcleo, sem sobreposição. As linhas de
  neon saem da **aresta do núcleo** até a **aresta interna do satélite** (mais brilho/glow, cor `--holo-cor`).
  Limiar `cheio` do arco subiu p/ 168 (raio efetivo maior). Versões → `constelacao.js?v=27`, `global_ui.css?v=30`.
- **Smoke do ajuste — aprovado pelo Narrador** ("design, distância, tudo ficou muito bom").

### 🛰️ Fatia 1d — Hover Previews holográficos: Sol + Luas de marco (✅ feito, validado estaticamente)
Pedido: infos úteis no hover do **sol** (peso do núcleo + outras) e nas **luas de marco** (nome + evento(s)
com resumo), no **mesmo padrão holográfico** do menu. Decisões: Sol = todos os blocos · Marco = completo ·
selos com evento **realçados**.
- **Dados:** Sol = **zero fetch** (tudo no snapshot client-side via `metricasNucleo`: peso=Σ`relevancia`,
  nº entidades, sinapses intra, balanço de afinidade por `scoreReta`, reputação média, diplomacia). Marco =
  reverse-lookup `mapaMarcoEventos` montado **1×/foco** (lazy, Regra 2.3) de `GET /eventos` (gatilhos
  `event_flag_weights` + `nome/descricao/peso/pool`), mesma técnica da Grelha (`construirMapaDependencias`).
- **UX (Regra 7.2 Hover Preview):** tooltips `.holo-tip` no mesmo glass/glow do menu, **`pointer-events:none`**
  (cursor fica no alvo). Hover **congela o disco** (intent delay 110ms → não congela em passadas rápidas; não
  dispara durante arrasto via `e.buttons`) p/ o alvo não escapar; `pointerout` esconde+descongela (150ms).
- **Realce do selo:** selos com evento ganham tom **dourado** (`--seal-cor` + `filter` drop-shadow, seguro com
  `clip-path`); `aplicarRealceMarcos` reaplica após cada re-render dos selos.
- **Wiring:** `ligarHoverInfo(vp)` + `carregarMapaMarcoEventos()` no `montarAstrolabio`; `esconderHoloTip()` no
  `abrirFeixe`. Versões → `constelacao.js?v=29`, `global_ui.css?v=32`. `node --check` ✓ · CSS 914/914 ✓.
- **Smoke ao vivo PENDENTE** (Narrador testa: legibilidade do tooltip do sol; lua mostra evento+resumo; o
  congelar-no-hover é confortável; realce dourado lê bem).
- **Ajuste pós-smoke:** **diplomacia removida** do tooltip do sol (estava barulhento) — fica só peso, entidades/
  sinapses, contadores de afinidade e reputação média. `metricasNucleo`/CSS limpos. `v=30`/`v=33`.
- **Fix:** `tarot` é objeto `{carta_num,orientacao}` → renderiza como rótulo do arcano (ROMANO). `v=31`.

### ⚡ Fatia 2 — Wiring marco→evento no-code (✅ feito, validado estaticamente)
Decisões: **satélite "Eventos"** no menu da entidade (8º satélite) + lista de **todos os eventos** com pool +
toggle (vincular/desvincular) + **stepper de peso**, em **acordeão por marco** (cabe no holograma estreito).
- **Dados:** F1d refatorada → `recarregarEventos()` cacheia `eventosCache` (lista completa c/ gatilhos
  normalizados) e reconstrói o `mapaMarcoEventos` + realce. `gatilhoDoMarco(ev,id,key)` casa por
  `node_id`+`marcoNorm(flag_key)`.
- **`feixeEventos(wrap,id)`:** acordeão dos marcos da entidade; expandir lista os eventos com pool atual/máx,
  link/unlink e stepper (peso≥1). Mutação → `POST`/`DELETE /eventos/:id/pesos` (upsert do peso, anti-IDOR no
  backend) → **refetch** `recarregarEventos()` (o backend recalcula a pool) → re-render preservando o acordeão.
  Um único listener delegado no box (Regra 2.9).
- **CSS:** `.fx-ev-*` (acordeão + linhas + stepper) só com tokens; vinculados ganham fundo dourado tênue.
  Versões → `constelacao.js?v=32`, `global_ui.css?v=34`. `node --check` ✓ · CSS 938/938 ✓ · sem emoji/inline ✓.
- **Smoke ao vivo PENDENTE** (Narrador testa: vincular/desvincular reflete na pool; stepper de peso; acordeão
  confortável; selo realça ao ganhar 1º evento).

### 📷 Fatia 3 — parte 1/3: Foto/avatar no feixe (✅ feito, validado estaticamente)
Decisão: **miniatura no núcleo do menu** (orbe segue esfera abstrata) + ação Foto ali.
- **Backend:** `listarConstelacao` passa a trazer `avatar_url` por entidade (`n.dados->>'avatar_url'`, leitura).
- **Reuso:** `selecionarEEnviarImagem` exposto como `window.*` (DRY) → upload `/midia/upload/entidades`
  (Sharp→WebP, Regra 6.5). `salvarAvatar` faz `PUT /nodes/:id?avatar=1 {nome, avatar_url}`; **`avatar=1` e
  `/midia/upload` entraram no SKIP do `onMutacao`** → o disco não se refaz e o menu não fecha; re-render do
  menu no lugar (`abrirFeixe(orbe)`) c/ a nova miniatura.
- **UI:** `.holo-nucleo-foto` no topo do núcleo (foto recortada ou ícone câmera); hover na foto mostra o
  "tirar" (image-off). Só tokens. Versões → `constelacao.js?v=33`, `global_ui.css?v=35`, `controle_mundo.js?v=11`.
- **Próximas partes da F3:** (2) busca-que-foca a entidade · (3) aposentar a Grelha + Constelação padrão.
- **Smoke — aprovado pelo Narrador** ("rodou perfeitamente").

### 🔎 Fatia 3 — parte 2/3: Busca que foca (✅ feito, validado estaticamente)
Decisão: ao escolher, **foca + abre o menu** da entidade; busca encontra **entidades + núcleos**.
- **UI:** combobox flutuante `.constelacao-busca` no topo do canvas (sempre visível na lente); a `foco-barra`
  desceu p/ `top:54px` p/ não colidir. Dropdown com nome + sub (núcleo/«núcleo»), ícone user/globe.
- **Lógica (`ligarBusca`/`irPara`):** filtra `entidadesAtual`/`orbes` por nome **sem acento** (NFD); setas ↑/↓
  + Enter navegam; clique escolhe. `irPara`: entidade → `sairFoco?`+`focar(núcleo)` (monta o astrolábio,
  síncrono) → `astro-orbe--achado` (pulso via `filter`) + `abrirFeixe(orbe)`; núcleo → só `focar`. Ligado 1×
  em `garantirInteracao` (guarda `interacaoPronta`).
- Versões → `constelacao.js?v=34`, `global_ui.css?v=36`. `node --check` ✓ · CSS 960/960 ✓.
- **Smoke — aprovado pelo Narrador** ("funcionou").
- **Ajuste UX (pós-fase):** ~~barra minimizada que expandia no hover~~ → revertido. Agora é uma **faixa
  normal fixa no TOPO do canvas** (full-width, orbes abaixo, sem sobreposição); `foco-barra` em `top:54px`
  segue abaixo dela. `v=36`/`v=38`.

### 🏁 Fatia 3 — parte 3/3: Grelha aposentada, Constelação é o padrão (✅ feito) — FECHA A FASE SOBERANA
**Review prévio (pedido do Narrador) achou um landmine:** as funções de marco (`marcoItemHTML`, `toggleFlag`,
`adicionarMarcoInline`, `iniciarEdicaoMarco`, `confirmarDeletarMarco`) e o tooltip
(`mapaDependenciasMarcos`/`construirMapaDependencias`/`mostrarTooltipMarco`) são **COMPARTILHADOS com a
Direção de Cena** (`toggleExpandirAtor` expande os `.ator-card` com os mesmos marcos). Idem
`carregarMundo`/`renderizarMundo`/`nodesCache`. **Removê-los quebraria a Cena** → mantidos.
- **Removido (exclusivo da Grelha, órfão confirmado por grep):** botão `data-view="grid"`,
  `renderizarGridMundo`, `cardMundoHTML`. `renderizarMundo` agora só trata `'cena'` (e limpa `cena-painel`
  fora dela). `escudo_narrador.js` tem `renderizarGridMundoEscudo` próprio — intocado.
- **Constelação é o padrão:** `mundoCurrentView='constelacao'`; `entrarLenteConstelacao()` (esconde listas,
  mostra canvas, `Constelacao.entrar`) chamado no arranque e ao reabrir a aba Mundo. Toggle agora é
  **Constelação / Direção de Cena**.
- **Intocados (validados):** Direção de Cena, Tabuleiro, Escudo, toolbar (busca/filtros/Núcleos/Diplomacia/
  Forjar), todo o sistema de marcos/eventos. `#grid-mundo` (vazio) e CSS `.world-card*` ficam inertes (zero
  risco). Versão → `controle_mundo.js?v=12`.
- Verificação: `node --check` ✓ · grep órfãos = 0 · controller carrega ✓.
- **Smoke ao vivo PENDENTE** (aba Mundo abre na Constelação; Direção de Cena ainda funciona incl. marcos no
  ator-card; Tabuleiro ok).

> **🎉 Fase Constelação Soberana COMPLETA (F1 · F1b · F1c · F1d · F2 · F3).** A Constelação é a superfície
> soberana de gestão de entidades; a Grelha foi aposentada.

### 🧹 Pós-fase: limpeza da toolbar do Mundo (✅ feito)
Review (pedido do Narrador) → a Direção de Cena tem toolbar **própria** (`.cena-toolbar`: Nova + filtro de
elenco) e o Escudo usa IDs `-escudo` separados. Removidos da toolbar do Mundo (só-HTML, baixo risco): **select
de núcleo**, **busca por nome**, botões **Núcleos / Diplomacia / Forjar Entidade** — todos com equivalente
nativo na Constelação. Sobra na toolbar só o seletor de lente (Constelação / Direção de Cena).
- **Mantidos de propósito (NÃO eram órfãos):** `abrirModalDiplomacia`/`modal-diplomacia` (a Constelação reusa
  no `#cf-diplo` da config do núcleo, `constelacao.js:482`); `gerenciarNucleos` (Eventos/Sessões usam). Leituras
  de `#filtro-nucleo-entidade`/`#busca-mundo` em mutações usam `?.value` → viram "carregar tudo" (correto).
- **Inertes restantes (dead, inofensivos):** `aplicarFiltrosMundo` e `modal-forja` ficam sem caller — podem
  sair numa limpeza futura (com review). `node --check` ✓.

### 🪐 Polimento do Astrolábio 3D — esferas sem distorção + movimento lento (✅ feito)
Feedback: ao **arrastar** o disco as esferas (orbes 2D) distorciam, e o movimento estava rápido demais.
- **Causa:** o billboard (`astro-levanta` + `astro-encara`) cancelava só o **tilt** e a **órbita**, mas não o
  `--rot-z` do arrasto → em repouso a esfera é círculo perfeito, ao girar vira elipse.
- **Correção (billboard completo, `global_ui.css`):** `astro-levanta` e `astro-centro` passam a cancelar também
  `rotateZ(-1*var(--rot-z))` (o `--rot-z` é **herdado** do `.astrolabio-3d` via custom property, então atualiza
  ao vivo no arrasto). Net de orientação = identidade em qualquer ângulo → a esfera 2D encara sempre a câmera,
  sem distorcer. (Esferas reais em CSS são inviáveis; billboard de círculo sombreado é a técnica correta.)
- **Velocidade:** `ASTRO_PERIODO` 120→**240s**, piso da duração 28→**60s** (encara casa via `animation-duration`
  inline). CSS default `astro-girar/contra` 120→240s. Versões → `constelacao.js?v=28`, `global_ui.css?v=31`.
