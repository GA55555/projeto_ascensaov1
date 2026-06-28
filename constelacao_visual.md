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
1. **Feixe holográfico + menu da entidade (a parte "útil"):** clique no orbe/planeta → painel-projeção
   que **sai por um feixe** da borda do planeta e hospeda o **conteúdo do menu da entidade** (decisão 2,
   "clique"). Precisa de JS novo (geometria do feixe + render do menu) — fatia dedicada.
2. **Cross-núcleo no layout solar** (decisão 5 adiada): laço externo orienta a entidade à borda.
3. **Afinações pendentes de smoke:** velocidade da rotação (`orbe-girar` 9s), intensidade do
   `drop-shadow`, raio do anel, zoom de aproximação (1.8), `SOLAR_ITER`/constantes de mola.

---

## 5. Diário
- **Sessão 1:** removida a Constelação do Tabuleiro (redundante); orbe arcano + sob demanda; bug do
  "quadrado girando" diagnosticado (reset de `border-radius` do tema Neovim) e curado com `clip-path`;
  visão solar com zoom/obscurecer/sol-central + **assentamento único** dirigido por laços intra-núcleo.
  Tudo no `sandbox` (commits §2). Falta o feixe holográfico + menu (§4.1) e o cross-núcleo (§4.2).
