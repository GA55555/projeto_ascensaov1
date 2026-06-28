# 🧭 Análise — Novo Mundo (Motor de Constelação como a aba Mundo)

> **Lei dourada:** `ARQUITETURA.md`. **Status:** ANÁLISE / LEVANTAMENTO DE DÚVIDAS — nenhuma linha
> implementada. Este documento serve para **tirar dúvidas e travar decisões** antes de planejar/codar.
> O `relacionamento.md` será evoluído depois para o **relatório/spec** fatiado deste novo projeto.
> Cada afirmação de "estado atual" foi validada contra o **código real** (file:line).

---

## 0. Objetivo (como entendi)
A aba **Mundo** deixa de ser uma lista/visualização e passa a ser um **canvas de criação no-code** baseado
na física de constelação — uma **fusão entre o mapa de constelação e a aba Mundo**. A constelação deixa de
ser read-only/transitória e vira o **chão editável e persistente** onde o Narrador cria o mundo direto no
mapa. A **Direção de Cena** (o atual Tabuleiro) deixa de ser aba e vira um **botão**. As funções atuais da
Mundo (núcleos, entidades, diplomacia, sinapses, e a ponte com eventos/sessões) passam a ser **instâncias**
acessíveis a partir desse canvas. Cada entidade/núcleo pode receber uma **carta de Tarot de Marselha** que,
junto com diplomacia e densidade de vínculos, governa a física (atração/repulsão).

**Fluxo de criação descrito pelo Narrador:**
1. **Clica-e-segura** no mapa → animação de um núcleo "crescendo" com temporizador → abre o **editor de núcleo**.
2. **Card do núcleo** tem: nome, escolha de **laços diplomáticos**, e uma **descrição breve** (consumida pela IA/RAG).
3. **Clicar no núcleo** abre a **tela de configuração**: editar, apagar, escolher **carta de Tarot**, botão
   dedicado de **Diplomacia** (laços dele) e botão **"criar entidade dentro"** (já vinculada ao núcleo).

---

## 1. Estado atual (validado no código)
- **Abas** (`controle_mundo.html:23-28`): Mundo · Eventos · Automações · Sessões · **Tabuleiro** (= Direção
  de Cena) · Oráculo.
- **Constelação** (`controle_mundo.js:2830+`, `3883 iniciarFisicaConstelacao`, `3896 tickFisica`): lente
  **force-directed read-only/transitória** sobre **núcleos**, vivendo **dentro** do Tabuleiro. Velocidades
  efêmeras (`constelacaoFisica`), **não tocam o `boardState`**; ao sair, restaura o snapshot.
- **Persistência do Tabuleiro:** `boardState` → `world_boards.dados` via **botão Salvar** (Regra 2.7). Há um
  guard explícito: *"Saia do modo Constelação antes de salvar (layout transitório)"* (`:2930`).
- **Criação hoje** é por formulário/lista: `criarNucleo` (`:370`), criar nó (`world_nodes`), Lentes Táticas
  (Grelha/Kanban), **Reta de Relação** (sinapses, recém-feita) e **Diplomacia** (`nucleo_diplomacia`).
- **Dados (DML/JSONB, escopados por `cronica_id`):** `entidade_nucleos` (tipo `entidade`/`evento`),
  `world_nodes` (npc/faccao/local/cenario, `nucleo_id` vincula ao núcleo), `world_links` (já carrega a Reta
  de Relação em `dados.tags`), `nucleo_diplomacia`. Posições x/y de board vivem em `world_boards.dados`.

---

## 2. Conformidade & a tensão central (Regra 2.7) — leitura importante
**A boa notícia: provavelmente NÃO precisamos remover nenhuma regra dourada.** A Regra 2.7 proíbe
**auto-save atrelado a drag/drop/resize** e exige salvar por **ação explícita**. O fluxo proposto separa-se
naturalmente em duas camadas:
- **Mutação de DOMÍNIO** (criar núcleo, criar entidade, definir diplomacia/tarot, conectar): são **ações
  explícitas** do Narrador (botão "Salvar" no editor, soltar uma conexão). **1 request por ação** — não é
  spam de drag. Isso **já é o padrão atual** (`criarNucleo` faz 1 POST) e **respeita** a Regra 2.7.
- **LAYOUT/física** (arrastar bolha, posições x/y, zoom/pan): fica **local** até o botão **"Salvar
  Constelação"** — exatamente o que a Regra 2.7 pede.

→ O que muda de fato **não é uma regra dourada**, e sim uma **escolha de implementação atual**: a
constelação ser *transitória/read-only*. Vamos **invertê-la** para *editável/persistente*. Só se você quiser
**auto-salvar posições** (sem botão) é que haveria um **desvio explícito** da Regra 2.7 a autorizar e
documentar. **Recomendação:** manter o salvamento de layout manual (botão) e salvar domínio por ação.

**Demais regras — sem conflito previsto:** DML-only/JSONB (4.1) ✓ · Vanilla, sem libs de grafo (1) ✓ ·
drag&drop por PointerEvents (7.1) ✓ · anti-IDOR por `cronica_id` + posse (3.3.1) ✓ · Zod nas mutações (3.1) ✓
· XSS `escapeHTML` no texto da IA (6.1) ✓ · Lentes Táticas/divulgação progressiva (7) ✓.

---

## 3. ❓ Dúvidas & Decisões abertas (o coração deste doc)
> Responda na ordem; cada uma destrava parte do plano. Onde há **recomendação**, é só dizer "ok".

**A. Substituição vs coexistência — ✅ DECIDIDO (27/jun): TOGGLE.** A Constelação vira a visão padrão da
   Mundo; um botão alterna para a **Grelha/Kanban** atuais (mesma data, só troca o renderizador — Regra 7).
   Preserva fallback e reduz risco.

**B. Onde persistem as POSIÇÕES — ✅ DECIDIDO (27/jun).** As posições **emergem da física** (não são
   coordenadas postas à mão). Persistimos apenas o **estado de REPOUSO** como cache, por núcleo, em
   `entidade_nucleos.dados.pos {x,y}` (DML/JSONB) — para o mapa abrir estável e a simulação continuar a
   partir daí. Modelo completo em **§3-bis**.

**C. Destino das funções atuais — ✅ DECIDIDO (27/jun): ABAS PRÓPRIAS.** Eventos, Sessões e Automações
   continuam como abas separadas. A Constelação foca em **núcleos/entidades/relações** (diplomacia e Reta
   entram na config do núcleo/entidade). Escopo menor, entrega mais rápida.

**D. "Direção de Cena" — ✅ DECIDIDO (27/jun): ABA PRÓPRIA dedicada.** (Corrige o "botão".) O board de
   cena/combate (`world_boards`) **fica como está**, apenas passa a ser sua **própria aba**, **fora** da
   Mundo. A Mundo nova = exclusivamente o canvas de constelação (+ toggle p/ Grelha/Kanban).

**E. Gestos + Menu de edição — ✅ DECIDIDO (27/jun).** Gestos: **clica-segura ~600ms** (vazio) = criar
   núcleo; **arrastar âncora** = conectar; **arrastar bolha** = mover (física reassume ao soltar);
   **arrastar vazio** = pan; **scroll/pinça** = zoom; **clique** = zoom + abrir (núcleo vira "sol" com
   planetas). **+ Menu de edição por bolha** (tamanho, cor, etc.) **reaproveitando a mesma UX/lógica de
   edição do Tabuleiro** (DRY — Regra 5.3 / Paradigma). Tempo do hold ajustável.

**F. Catálogo de Tarot — ✅ DECIDIDO + ENRIQUECIDO (27/jun).** Os 22 arcanos (0–21) vivem numa **constante
   no front** (sem DDL). Cada carta carrega: **nome**, **estágio da Jornada do Herói** (a carta = um estágio;
   toda entidade/núcleo está na jornada), **significado EM PÉ (direita = +1, positivo)** e **significado
   INVERTIDA (−1, negativo)**. A **orientação** (em pé/invertida) **É** a polaridade. A UI exibe esse texto
   explicativo (pé vs invertida) para a **escolha ser fácil**, e o mesmo texto vira **contexto para a IA**.
   Persiste em `dados.tarot` = `{carta_num, orientacao: 1|-1}` (nome/significados vêm do catálogo, não duplicam).

**G. Física unificada — ✅ DECIDIDO (27/jun).** Sim, uma física só: **Reta de Relação + diplomacia +
   densidade** alimentam a Lei de Hooke; tarot entra como modificador (§3-I do `relacionamento.md`). Modelo
   completo em **§3-bis**.

**H. "Rompimento" — ✅ RESSIGNIFICADO (27/jun): é VISUALIZAÇÃO, não deleção.** Não existe rompimento real
   nem auto-save. A mola muito esticada (ou muito curta) é apenas a forma **visual** de mostrar a tensão
   extrema — "romper" = pender para inimigo/aliado no espectro. Nada persiste sozinho (Regra 2.7 intacta).

**I. Performance — ✅ DECIDIDO (27/jun): GRANDE (60–150 entidades) ⇒ LOD obrigatório.** Estratégia:
   a física **principal é no nível de NÚCLEOS** (poucos — dezenas no máximo), sempre ativa e leve. As
   **entidades** de um núcleo só são renderizadas/animadas quando o núcleo está **em foco/expandido**
   (orbitam-no); fora de foco, ficam **abstraídas** (contam para massa/tensão via valores pré-computados,
   mas não renderizam nem rodam física). Nós em repouso **congelam** (damping → sleep) e só "acordam" com
   interação/mudança. Isso mantém 60fps no A6 mesmo com 150+ entidades.

**J. Entidades = "sistema solar" — ✅ DECIDIDO (27/jun).** O núcleo é o **sol**; ao **selecioná-lo**, a
   câmera dá **zoom** e suas entidades aparecem **orbitando** como "planetas" (os cards). Fora de foco ficam
   abstraídas (LOD, §I). Criar entidade pelo botão do núcleo seta `world_nodes.nucleo_id` e ela nasce
   orbitando aquele núcleo.

**K. Tarot (substitui os "storylets" da F4) — ✅ RESSIGNIFICADO (27/jun).** **NÃO** há geração automática
   de micro-eventos. O Narrador dá uma **carta** (arquétipo, com o significado real do Tarot de Marselha) a
   uma entidade/núcleo. A carta tem **dois papéis**:
   1. **Física — Magnetismo de Arquétipos (força FRACA, layer sobre as molas de relação do §3-bis):**
      núcleos com a **mesma carta** e **mesma orientação** se **atraem** (cluster temático); **mesma carta**
      com **orientação diferente** se **repelem**.
   2. **Contexto de arquétipo para a IA (RAG):** a carta + sua orientação + laços/vínculos/contratos/
      diplomacia entram no texto que o Oráculo lê — a IA considera **tudo** ao responder (a "trama do
      herói"). É enriquecimento de contexto, sem auto-storylet nem "adotar evento".
   - ⚠️ **A confirmar:** "orientação/posição" da carta = a **polaridade** (carta direita = +1 / invertida =
     −1), e **não** a posição espacial no mapa — certo?

---

**L. ⚠️ DDL para NÚCLEOS — ACHADO NA F1 (decisão sua, como DBA).** `entidade_nucleos` **NÃO tem coluna
`dados`** (jsonb) — só `id, cronica_id, nome, tipo, avatar_url` (validado: zero referências a
`entidade_nucleos.dados` no código). A spec assumiu `entidade_nucleos.dados` p/ guardar **tarot** e
**posição** de núcleo. Como núcleos são o centro do sistema, é **fundacional**. Opções:
- **(i) DDL — recomendado:** `ALTER TABLE entidade_nucleos ADD COLUMN dados jsonb NOT NULL DEFAULT
  '{}'::jsonb;` (pequeno, consistente com a DDL do Oráculo; libera tarot+pos de núcleo por DML).
- **(ii) Sem DDL:** guardar tarot/pos de núcleo no jsonb de outra tabela (ex.: por crônica) — mais
  acoplado e feio.
> **Estado:** ✅ **RESOLVIDO (27/jun): DDL (i) aplicada** — `entidade_nucleos.dados jsonb` existe. F1 de
> ENTIDADES **e** NÚCLEOS (tarot) **implementada**; a coluna também recebe a futura `pos` (F3).

## 3-bis. ⚙️ Modelo de Física da Constelação (TRAVADO — 27/jun)
A **posição não é dado de entrada** — é o **resultado** de uma simulação force-directed. O que persiste e o
que governa:

- **Massa do núcleo = importância = nº de ligações.** Mais conexões → mais pesado → puxado mais ao
  **centro** (gravidade central proporcional à massa) e mais **difícil de mover** (inércia alta; resiste a
  forças e a arrasto). Núcleos órfãos/leves orbitam nas bordas.
- **Tensão entre dois núcleos (A↔B) = a mola de Hooke entre eles.** Calculada a partir de:
  - a **diplomacia** direta A↔B (`nucleo_diplomacia`: aliado/inimigo/neutro), e
  - o **agregado das relações entre as entidades** de A e de B — **quantidade × tipo × intensidade** dos
    `world_links` (a **Reta de Relação −10..+10** que já fizemos).
  - **Sinal → geometria:** mais **aliada** ⇒ mola curta, atrai (perto); mais **inimiga/opositora** ⇒ mola
    longa/repulsão (longe); **neutro** ⇒ comprimento intermediário. A tensão resultante define o
    **comprimento ideal/constante `k`** da mola; a simulação acomoda as posições.
- **Posições de repouso** são cacheadas em `entidade_nucleos.dados.pos` (B) para abrir estável.
- **Eficiência (crítico no A6):** a **massa** e a **tensão A↔B** são **pré-computadas** quando os dados
  mudam (criar/editar vínculo, diplomacia, entidade), **não a cada frame**. O `tickFisica` roda só com as
  constantes prontas → leve. (Reaproveita `tickFisica`/`iniciarFisicaConstelacao` já existentes.)

**Sub-decisões — ✅ RESOLVIDAS (27/jun):**
1. **Massa:** `massa = 1 + (grau × fator)`, onde **grau = ligações do próprio núcleo (diplomacia) + os
   `world_links` de TODAS as suas entidades** (somados). Núcleo com mais NPCs/conexões pesa mais → centro.
2. **Tensão A↔B:** a **diplomacia direta** dá um valor **garantido** (ex.: inimigo = −X, aliado = +X, neutro
   = 0) e os **links assinados entre as entidades** de A e B (a Reta) **ajustam o fino** por cima. (Soma
   assinada ponderada; número final na spec.)
3. **Arrasto vs física — SEM luta:** durante o arrasto a física do nó é **suspensa** (o Narrador move
   livre); **ao soltar**, a física **reassume daquela posição** e o mapa se reacomoda **organicamente**.
   Não há pin permanente.

## 4. Riscos transversais
- **Escopo (refundação de UX):** é grande; fatiar bem é vital para não travar o uso atual da Mundo no meio.
- **Performance no A6:** física 60fps via DOM/SVG sobre o mundo inteiro é o maior risco técnico (ver §3-I).
- **Coexistência de dados:** `world_links.dados` já tem a Reta (`tags`); tarot/forca em JSONB devem
  **fazer merge sem clobber**. Idem `dados` de núcleos/nós ao gravar `tarot`/`pos`.
- **Não corromper o Tabuleiro/`world_boards`** nem os "Saves do Escudo" ao mexer no board (Regras 2.2/4/4.2).
- **Regressão das funções da Mundo:** eventos/sessões/automações/diplomacia precisam continuar acessíveis.

---

## 5. Próximos passos
1. Você responde a **§3 (A–K)** — ou diz "use as recomendações" para as que têm.
2. Eu valido os últimos detalhes no código físico (`tickFisica` real, como a Reta/diplomacia entram na força).
3. Reescrevo o **`relacionamento.md`** como **relatório/spec fatiado** (F1…Fn) coerente com estas decisões.
4. Começamos a **Fatia 1** (provavelmente: Tarot no backend + persistência de posição + base do canvas).

> Este arquivo permanece como **registro vivo de dúvidas/decisões**; à medida que travamos, as respostas
> migram para o `relacionamento.md` (a spec) e este doc guarda o "porquê".
