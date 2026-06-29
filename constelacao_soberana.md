# 👑 Constelação Soberana — a Constelação substitui a Grelha na gestão de entidades

> **Lei dourada:** `ARQUITETURA.md`. Nada aqui pode violá-la. Guia desta fase (decisões travadas + roadmap +
> decisões abertas), no espírito do `reta_relacao.md`/`reputacao.md`/`oraculo.md`. Premissas validadas contra
> o **código real** (file:line). **Status: PLANO — nada implementado.**

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

### 🍕 Fatia 1 — Marcos como camada visual no orbe (no-code)  ⏳ **selos+toggle FEITOS (§7); add/renomear/apagar = F1b**
- **Snapshot:** `listarConstelacao` passa a incluir `flags` por entidade (são leves: `{key,value}`). Alternativa
  lazy: buscar flags ao focar o núcleo. (Decidir em §5.)
- **Orbe:** render dos marcos como **selos** ao redor do orbe (aceso/apagado). **Hover** = nome do marco
  (Regra 7.2); **clique** = toggle (`PUT /nodes/:id/flags`). Um **+** abre input de novo marco; renomear/
  apagar por interação no selo. Marcos com **evento atrelado** (do `mapaDependenciasMarcos`) ganham um realce.
- **Débito:** UX de muitos marcos num orbe pequeno (anel de selos? satélites? overflow?) — §5.

### 🍕 Fatia 2 — Wiring marco→evento no feixe (no-code completo)
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
- **F1b (próxima):** **adicionar/renomear/apagar** marco no-code pelo orbe (popover ancorado, congelar o disco
  enquanto edita). Aguarda smoke da ergonomia dos selos (clicar em orbe que orbita; densidade com muitos marcos).
- **Smoke ao vivo PENDENTE** (Narrador testa agora).
