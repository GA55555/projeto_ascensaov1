# 🌌 Constelação Visual — overhaul estético da lente (aba Mundo)

> **Lei dourada:** `ARQUITETURA.md`. Nada aqui pode violá-la. Este documento é o **guia** desta mudança
> (decisões travadas + diário + retomada), no espírito do `reta_relacao.md` e do `oraculo.md`.
> **Status:** em andamento — **ainda não terminamos o visual** (ver §4 "Próximos passos").

---

## 0. Contexto — qual Constelação é esta

Existiam DUAS "Constelações". Esta sessão **removeu** a do **Tabuleiro** (aba Tabuleiro, `modoConstelacao`
inline no `controle_mundo.js`, Fase 14) por ser **redundante**, e mantém/evolui a da aba **Mundo**:
- **Mundo (esta):** `public/js/constelacao.js` (`window.Constelacao`) + `constelacaoCalc.js`
  (`ConstelacaoCalc`, já integra Reta `RETA_FATOR` + diplomacia `PESO_DIP`) + `constelacaoFisica.js`
  (`ConstelacaoFisica`). CSS em `global_ui.css` (`.constelacao-*`, `.orbe-*`).
- Snapshot: `GET /cronicas/:id/constelacao` (`mundoController.listarConstelacao`) entrega
  `{ nucleos, entidades, links:[{origem,destino,reta:-10..+10}], diplomacia }`.

---

## 1. Decisões travadas (aprovadas pelo Narrador)

1. **Estilo do orbe = "Orbe arcano"** (não esfera astronômica): plasma/energia girando + núcleo pulsando
   ("respira"), brilho na **cor do token** do núcleo. Dark Fantasy, combina com o Tarot.
2. **Nome/infos = "Sob demanda":** repouso = só a esfera; **hover** = plaqueta glass com o nome;
   **clique** = (futuro) painel-projeção com o menu da entidade. Prioriza a beleza do mapa em repouso.
3. **Forma redonda por `clip-path: circle(50%)`** num wrapper `.orbe-esfera` — **NUNCA** confiar em
   `border-radius` aqui: o **tema Neovim** zera `border-radius` de tudo com `!important`
   (`.tema-neovim *, ::before, ::after { border-radius: 0 !important }`, `global_ui.css:85`). O `clip-path`
   é imune e ainda recorta os descendentes (à prova do `mix-blend-mode` do plasma). Halo redondo via
   `filter: drop-shadow` (o `box-shadow` viraria quadrado sob o tema).
4. **Visão solar = "Assentamento único":** ao focar um núcleo, roda uma física BREVE (`SOLAR_ITER=120`)
   **uma vez** e **congela** — **sem `requestAnimationFrame`** enquanto se olha o sistema (0% CPU depois).
   `pararLoop()` no `focar` também congela a física do fundo. Eficiência foi requisito explícito.
5. **Layout solar dirigido por laços = "Intra-núcleo primeiro":** só `links` entre entidades do MESMO
   núcleo focado influenciam o lugar no anel (reta+ aproxima/ aliadas, reta− afasta/ inimigas).
   **Cross-núcleo fica para depois** (entidade puxada à borda voltada ao núcleo do contato externo).

---

## 2. O que já está feito (no HEAD, branch `sandbox`)

Commits: `a9af862f` (remoção do Tabuleiro + estética fatia 1) · `e8a5d59d` (clip-path: corrige quadrado) ·
`6b20fa35` (visão solar: zoom/obscurecer/assentamento). Validado estaticamente (`node --check`);
**smoke ao vivo é do Narrador** (sem browser no dev).

- **Orbe arcano (núcleos e planetas):** `.orbe-esfera` (clip-path + base radial + glow `drop-shadow`)
  contendo `.orbe-plasma` (conic girando, `mix-blend-mode: screen`, `@keyframes orbe-girar`),
  `.orbe-nucleo` (radial pulsando, `orbe-pulsar`) e `.orbe-vidro` (especular fixo + vinheta → esfericidade).
  `isolation: isolate` contém o blend. Markup montado em `montar()` e `renderPlanetas()`.
- **Sob demanda:** nome saiu de dentro do orbe → `.constelacao-orbe-nome` / `.constelacao-planeta-nome`
  são plaquetas glass reveladas no `:hover`.
- **Ambiente:** canvas com nebuloso roxo (`radial-gradient` em token); `.em-foco` ganha vinheta
  (`box-shadow inset`).
- **Visão solar (foco):** `focar` faz zoom-in (`centrarCamera(o, 1.8)` + transição `.animando`),
  `pararLoop()`, acende o sol (`.is-sol`) e esmaece os outros núcleos (`.em-foco .constelacao-orbe
  { opacity:.12 }`). `calcularLayoutSolar(sol, ents)` assenta as entidades (molas dos laços intra +
  repulsão anti-overlap + mola radial ao anel `R = diametroOrbe*0.6+100`), depois congela.
  `linksAtual` capturado de `snap.links` no `entrar`/`recarregar`. `sairFoco`/`montar` reconciliam `.is-sol`.
- Cache-busters atuais: `constelacao.js?v=16`, `global_ui.css?v=21`.

---

## 3. Conformidade com a `ARQUITETURA.md`
- Regra 1/2.5: vanilla, zero libs; cores **por token** (`--cor-orbe`, `--bg-principal`, `--texto-claro`…);
  largura/forma são mecânica dinâmica (exceção tipo `barra-fill`). · 4.1: sem DDL (dado já no snapshot).
  · 6.1: `escapeHTML` nos nomes. · Paradigma 5: respeita o tema Neovim (daí o `clip-path`).
- **Eficiência:** visão solar sem RAF contínuo (assentamento único); `pararLoop` no foco.

---

## 4. Próximos passos (visual NÃO terminado)
1. ~~**Feixe holográfico + menu da entidade.**~~ ✅ **FEITO (Sessão 4)** — clique no orbe → painel-projeção
   por um feixe da borda, com Sinapses + Editar/Mudar núcleo/Deletar. Ver diário §5.
2. **Cross-núcleo no layout solar** (decisão 5 adiada): laço externo orienta a entidade à borda.
3. **Afinações pendentes de smoke:** velocidade da rotação (`orbe-girar` 9s), intensidade do
   `drop-shadow`, raio do anel, zoom de aproximação (1.8), `SOLAR_ITER`/constantes de mola.

---

## 5. Diário
- **Sessão 1:** removida a Constelação do Tabuleiro (redundante); orbe arcano + sob demanda; bug do
  "quadrado girando" diagnosticado (reset de `border-radius` do tema Neovim) e curado com `clip-path`;
  visão solar com zoom/obscurecer/sol-central + **assentamento único** dirigido por laços intra-núcleo.
  Tudo no `sandbox` (commits §2). Falta o feixe holográfico + menu (§4.1) e o cross-núcleo (§4.2).
- **Sessão 2 (análise + decisões; SEM código ainda):** avaliado o prompt do "Motor de Constelação 3D"
  (astrolábio CSS). Veredito + plano abaixo (§6). **Pausado antes de implementar.**
- **Sessão 3 (Astrolábio 3D — ✅ implementado, validado estaticamente):** o pivô do §6 saiu do papel.
  - `public/js/constelacao.js` — a visão solar 2D (`renderPlanetas`/`calcularLayoutSolar`/`SOLAR_ITER`)
    foi **removida** e substituída por `montarAstrolabio()`/`construirAstrolabio` no caminho do foco:
    overlay `.astrolabio-viewport` (anexado ao `canvas`, não ao world-layer) com `.astrolabio-3d`
    (`rotateX(62deg) rotateZ(var(--rot-z))`). Raio ∝ **Reta agregada** da entidade (`scoreReta` = Σ reta dos
    laços **intra-núcleo**, ambas as pontas no foco) via `astroRaio` (score+ → interno; score− → externo);
    classe `astro--arcana|repulsao|neutro`. Período ∝ raio (interno mais rápido); fases espalhadas por
    `animation-delay`. `focar` agora adiciona `astro-on` (esconde o world-layer 2D sob o overlay) e mantém
    `centrarCamera`/`em-foco`/`mostrarBarraFoco`; `sairFoco`/`montar` reconciliam via `montarAstrolabio`/
    `removerAstrolabio`. Drag do disco gira `--rot-z` (`ligarAstroDrag`, ÷rootZoom). Auto-pausa por
    `visibilitychange` → classe `astro-pausado`.
  - `public/css/global_ui.css` — bloco `.astrolabio-*`/`.astro-*` novo: anéis por **radial-gradient**
    (não `border` — tema Neovim), avatar/sol reusando `.orbe-esfera` arcano, contra-rotação sincronizada
    (`astro-girar`/`astro-contra` mesma duração/atraso, sentidos opostos) + `astro-levanta` (rotateX(-62))
    p/ o corpo encarar a câmera; `prefers-reduced-motion` + `.astro-pausado` congelam. Cores por token
    (`--dourado`/`--link-inimigo`/`--borda`). `.constelacao-planeta*` 2D removido (mantido só
    `.constelacao-planeta-nome`, reusado pelo avatar). Grep limpo de órfãos; `node --check` ok.
  - Cache-busters: `constelacao.js?v=17`, `global_ui.css?v=22`.
  - **Débito CRÍTICO — smoke ao vivo do Narrador** (CSS 3D escrito às cegas, sem browser no dev): clicar
    num núcleo deve abrir o astrolábio inclinado, sol ao centro, entidades em anéis (interno dourado quanto
    mais aliadas, externo vermelho quanto mais inimigas), girando lento e de pé; arrastar gira o disco;
    trocar de aba pausa; Sair/Esc fecha. **Constantes a afinar no smoke:** `ASTRO_TILT` (62), `ASTRO_PERIODO`
    (120s), `ASTRO_R_MIN/MAX` (92/300), `ASTRO_SCORE_SAT` (12), `perspective` (1200px), sensibilidade do
    drag (0.4°/px). Se a contra-rotação dessincronizar (avatar deitando), é o ponto nº1 a investigar.
- **Sessão 3b (refino pós-teste do Narrador — ✅ feito, validado estaticamente):** dois ajustes do feedback.
  - **Raio = RELEVÂNCIA (não mais afinidade).** Decisão 8: cada entidade ganha a SUA órbita; ordenadas por
    **relevância híbrida = grau (nº de sinapses incidentes, intra+cross) + bônus de papel** (`BONUS_TIPO`:
    protagonista +3, facção +2, npc +1, local/cenário +0), atribuídas a raios distintos R_MIN..R_MAX por
    **rank** (mais relevante → mais interna, gira mais rápido). Empate: |afinidade| e nome (determinístico).
  - **Cor do anel/orbe = AFINIDADE (Reta agregada intra-núcleo).** `astroValencia` (`astro--arcana` dourado /
    `astro--repulsao` vermelho / `astro--neutro`) tinge o anel E o `--cor-orbe` do avatar. Raio e cor viram
    **dois sinais independentes** (relevância × afinidade).
  - **Vista "meio isométrica".** Decisão 9: `perspective` grande (`--astro-persp: 2400px`, quase ortográfico —
    o lado distante da órbita não encolhe) + tilt parametrizado (`--astro-tilt: 58deg`); `.astro-3d`/`-levanta`/
    `-centro` leem o mesmo var (sincronia do encarar). Ambos afináveis no smoke.
  - `scoreReta` (afinidade) mantida; `astroRaio`/`astroSat`/`ASTRO_SCORE_SAT`/`ASTRO_TILT` removidos (grep limpo).
    Cache: `constelacao.js?v=18`, `global_ui.css?v=23`. node --check ok. **Smoke segue pendente.**
- **Sessão 4 (Feixe holográfico — ✅ feito, validado estaticamente):** o §4.1 saiu do papel.
  - `public/js/constelacao.js` — `abrirFeixe(orbeDiv)`/`fecharFeixe`: clique LIMPO num orbe (distinguido do
    arrasto-que-gira em `ligarAstroDrag` por tolerância de 5px) **congela o disco** (`.astro-congelado`) e
    projeta um `.feixe-wrap` (anexado ao `canvas`, pass-through; só raio+painel capturam ponteiro). O **raio**
    é um div rotacionado (geometria inline: `getBoundingClientRect` do orbe ÷ rootZoom → centro em px de
    layout; `atan2`/`hypot` p/ ângulo/comprimento até o painel; painel à direita se couber, senão à esquerda,
    clampado). Painel = **menu da entidade**: leitura (Relevância rank/total + Afinidade pela `dataset.score`)
    + ações **Sinapses** (reusa `window.abrirModalSinapses`, auto-contido), **Editar nome**/**Mudar núcleo**
    (sub-forms inline → `PUT /nodes/:id` e `/nodes/:id/nucleo`; seletor de núcleo vem de `orbes`), **Deletar**
    (2 passos, sem `confirm()`). Mutações passam pelo `API.onMutacao` → `recarregar` → `montarAstrolabio` →
    `fecharFeixe` (auto). Esc fecha o feixe antes de sair do foco; `sairFoco`/`montarAstrolabio` limpam.
    Orbes ganharam `data-ent-id/-rank/-total/-score/-relev` p/ o feixe ler.
  - `public/css/global_ui.css` — bloco `.feixe-*`: raio com `linear-gradient`+`box-shadow` na cor da afinidade
    (token), painel glass (`backdrop-filter`+halo), cor por `.feixe--aliado|inimigo|neutro` (`--dourado`/
    `--link-inimigo`/`--azul-vida`); botões reusam `.btn-outline`/`.btn-del`/`.input-sm` (Regra 2.5/DRY).
    `.astro-congelado` adicionado à regra de `animation-play-state: paused`.
  - Cache: `constelacao.js?v=19`, `global_ui.css?v=24`. node --check ok. **Smoke ao vivo pendente** (Narrador):
    posição/ângulo do raio, painel não vazar do canvas, congelar/descongelar, e as 4 ações + refresh.
- **Sessão 4b (História da entidade no feixe — ✅ feito, fatia backend+frontend):** nova ação "História" no
  painel do feixe → biografia gravada no JSONB `world_nodes.dados.historia` (**sem DDL**, Regra 4.1).
  - **Backend:** `salvarHistoriaNodeSchema` (Zod, `max(8000)`, vazio limpa a chave) · `obterHistoriaNode` (GET
    lazy, Regra 2.3) + `salvarHistoriaNode` (PUT, MERGE sem clobber, anti-IDOR `id+cronica_id`, **re-index do
    Oráculo** — história é RAG rico) · rotas `GET/PUT /nodes/:id/historia` (GET sem `apenasNarrador`).
  - **Frontend:** `feixeHistoria(wrap,id)` — GET ao abrir → textarea → PUT salva. O save é **excluído do
    `onMutacao`** (`/historia` no skip) → não recarrega o disco, mantém o feixe aberto pra continuar escrevendo.
  - Cache: `constelacao.js?v=20`. node --check + boot ok.
  - **História no RAG (✅ feito):** `services/oraculoTexto.js` → helper `historiaDoDados` + linha "História: …"
    no `textoDoNode` (ao lado da Descrição/Tarot). O `salvarHistoriaNode` já reindexa; nós antigos pegam no
    próximo Big Bang/edição. **Pendente:** só o smoke ao vivo.

---

## 6. PIVÔ: Astrolábio 3D (✅ IMPLEMENTADO na Sessão 3 — ver diário §5; smoke pendente)

> Veredito da análise do prompt do Narrador: conceito coerente e compatível em espírito (vanilla + CSS 3D
> `perspective`/`preserve-3d`, zero libs = Regra 1/Paradigma 4). MAS o CSS do prompt, como veio, **seria
> rejeitado** por violar o contrato — exige adaptações OBRIGATÓRIAS. Boa parte já existe (visão solar:
> raio ∝ Reta = Hooke, núcleo central, entidades orbitando); o que o 3D agrega é a **perspectiva inclinada**.

### Decisões travadas (aprovadas)
6. **Escopo: SÓ a visão solar (foco).** O astrolábio 3D substitui a visão solar ao CLICAR num núcleo.
   A visão geral 2D (vários núcleos, criar por clica-segura, arrastar âncora→diplomacia, pan/zoom) **fica
   como está**. Evita reescrever a interação e a armadilha `:root{zoom:1.33}` [[project-zoom-double-scaling]].
7. **Movimento: girar LENTO + pausável.** Rotação contínua via CSS `transform` (GPU-composited), MUITO
   lenta (~120s/volta, raio interno mais rápido), com **auto-pausa** (aba/lente oculta → `display:none`
   já congela; `visibilitychange` → `animation-play-state: paused`) e **`@media (prefers-reduced-motion)`**.
   (Substitui, só no foco, o "assentar e congelar 0% CPU" da decisão 4 — troca consciente: vida sutil.)
8. **Raio = RELEVÂNCIA; cor = AFINIDADE (refino Sessão 3b, aprovado).** Supera a decisão original "raio ∝ Reta".
   O RAIO codifica **relevância híbrida = grau (nº de sinapses) + bônus de papel** (protagonista +3, facção +2,
   npc +1, local/cenário +0): cada entidade na SUA órbita, mais relevante → mais interna (por rank). A COR do
   anel/orbe codifica a **afinidade** (Reta agregada intra-núcleo: dourado aliado / vermelho inimigo / neutro).
   Dois sinais independentes. Empate de relevância: |afinidade| e nome.
9. **Vista "meio isométrica" (refino Sessão 3b, aprovado).** `perspective` grande (`--astro-persp: 2400px`,
   quase ortográfico) + tilt parametrizado (`--astro-tilt: 58deg`) — o lado distante da órbita não encolhe.
   Afináveis no smoke.

### Adaptações OBRIGATÓRIAS ao CSS do prompt (senão viola o contrato)
- **Cores → tokens (Regra 2.5).** O prompt traz hardcoded (`#d4af37`, `#1a1a24`, `rgba(212,175,55…)`,
  `rgba(220,53,69…)`). Mapear: ouro→`var(--dourado)`(#eab308), vermelho→`var(--erro)`/`--link-inimigo`,
  fundos→`var(--bg-principal)`/`--bg-afundado`, brilho→`color-mix(... var(--dourado) …)`.
- **Forma redonda → `clip-path: circle(50%)`, NUNCA `border-radius`.** O tema Neovim zera radius
  (`global_ui.css:86`) → era o bug do quadrado. Para os ANÉIS de órbita (que são `border`), `clip-path`
  não recorta border: usar **anel via `radial-gradient(circle closest-side, …)`** (à prova de tema), com
  cor `arcana`=dourado / `repulsao`=vermelho. Halo via `filter: drop-shadow`.
- **Premissa "Tarot na relação" é FALSA.** Tarot vive no núcleo/nó (`dados.tarot`), não na relação. O que
  dá força/polaridade é a **Reta** (`snap.links[].reta` −10..+10). Raio ∝ Reta agregada da entidade
  (score = Σ reta dos laços intra-núcleo): score+ → órbita interna `arcana` (dourado); score− → externa
  `repulsao` (vermelho); 0/sem laço → anel neutro. Velocidade: interno mais rápido.
- **Sem avatar no snapshot** (`entidades:{id,nucleo_id,nome,tipo}`): o "avatar" reusa o **orbe arcano**
  (`.orbe-esfera` + camadas). Se um dia houver `avatar_url`, sanitizar a URL ao injetar em `style` (6.1).
- **Arquivo:** manter o CSS em `global_ui.css` (fonte única, Regra 2.5) — NÃO criar `constelacao.css`.

### Plano de implementação (overlay no foco)
- `focar(id)` → além do atual, monta um overlay `.astrolabio-viewport` (position:absolute, cobre o canvas,
  `perspective`) com `.astrolabio-3d` (`rotateX(~62deg) rotateZ(var(--rot-z))`, arrastável p/ girar).
- `construirAstrolabio(sol, ents)`: núcleo central (orbe arcano, `--cor-sol`); por entidade calcula
  `{raio (do score da Reta), angulo (spread), velocidade (∝ raio), classe arcana|repulsao|neutro}`;
  cria anel (radial-gradient) + braço girando (`@keyframes astro-girar`) + entidade com **contra-rotação**
  (`astro-contra`) p/ manter o avatar de pé e encarando a câmera (`rotateX(-62deg)`), reusando `.orbe-esfera`.
- `sairFoco` → `removerAstrolabio()`. Reduced-motion/`astro-pausado` desligam as animações.
- Reaproveitar: substitui `renderPlanetas`/`calcularLayoutSolar` (2D) no caminho do foco; manter a
  `mostrarBarraFoco` (Configurar/Entidade/Sair). `linksAtual` já capturado.
- **Débito: smoke ao vivo é crítico aqui** (CSS 3D às cegas no dev — sem browser). Constantes a afinar:
  `tilt` (62deg), período (~120s), raioBase/escala do score, perspective (1200px).
