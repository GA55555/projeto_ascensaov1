# 🌌 Motor de Constelação — Proposta de Sistema de Relacionamentos Orgânico

> **Lei dourada:** `ARQUITETURA.md`. Nada aqui pode violá-la. Este documento é o PLANO DE ENGENHARIA detalhado para o sistema de relacionamentos físicos e Tarot de Marselha, fatiado e estruturado para implementação.
>
> **Status:** PLANEJADO & ESTRUTURADO — Nenhuma linha de código foi implementada ainda. Cada decisão foi desenhada sob a perspectiva estrita da `ARQUITETURA.md` (Vanilla JS, sem libs no front, DML-only no banco, isolamento multi-tenant).

---

## 0. Como ler este documento
- **§1** Arquitetura geral e aproveitamento do código existente.
- **§2** Estrutura de dados DML-only (Sem alterações de tabela pelo app).
- **§3** As 4 fatias de implementação incremental (F1 a F4).
- **§4** Análise de conformidade e riscos com `ARQUITETURA.md`.

---

## 1. Arquitetura Geral & Aproveitamento

O **Motor de Constelação** transforma a aba "Mundo" (`controle_mundo.html`) de um gerenciador estático em um quadro tátil e interativo. Ele será implementado como uma **lente tática** adicional (Regra 7 - Lentes Táticas):
- **O que será aproveitado:**
  - A física force-directed nativa escrita no frontend em `public/js/controle_mundo.js` (`tickFisica()`, `iniciarFisicaConstelacao()`, etc.), que já lida com atração de molas de diplomacia, repulsão de Coulomb, gravidade central e congelamento dinâmico (damping/jitter control).
  - O cache local do frontend: O grafo rodará inteiramente sobre as entidades (`world_nodes`, `entidade_nucleos`) e conexões (`world_links`, `nucleo_diplomacia`) já carregadas na crônica, sem requisições adicionais de leitura.
- **Mudanças principais:**
  - A física de constelação, hoje restrita à visualização de núcleos minimizados de forma *read-only*, passará a ser um editor visual interativo e editável para núcleos, locais, NPCs e facções.
  - A criação e destruição de conexões e entidades ocorrerão de forma visual (UX No-Code) através de interações diretas (clique duplo, arrastar-e-soltar), persistindo as modificações no banco de dados.

---

## 2. Estrutura de Dados (DML-only)

Para cumprir a **Regra 4.1** (proibição absoluta de instruções DDL pela aplicação), utilizaremos as colunas JSONB já existentes nas tabelas para guardar as propriedades do Tarot e da constelação, sem alterar o esquema físico do banco PostgreSQL:

1. **Cartas de Tarot nas Entidades (`world_nodes.dados` e `entidade_nucleos.dados`):**
   Armazenadas sob a chave `tarot` dentro do JSONB de cada nó ou núcleo:
   ```json
   {
     "avatar_url": "...",
     "tarot": {
       "carta_num": 1,
       "nome": "Le Bateleur (O Mago)",
       "polaridade": -1,
       "significado": "manipulação/mentira"
     }
   }
   ```
2. **Propriedades da Conexão Física (`world_links.dados` e `nucleo_diplomacia`):**
   A tabela `world_links` possui uma coluna `dados` (JSONB) que será usada para armazenar a tensão de mola personalizada, força de conexão ou notas sobre a ligação:
   ```json
   {
     "forca_mola": 1.5,
     "anotacoes": "Traição eminente sugerida pelo Tarot"
   }
   ```

---

## 3. As 4 Fatias de Desenvolvimento

A implementação será dividida em fatias incrementais e seguras, permitindo a entrega e teste de cada etapa de forma isolada.

### 🍕 Fatia 1 — O Motor de Tarot no Backend (Modelagem e DML)
- **Objetivo:** Adicionar capacidade de associar Arcanos do Tarot de Marselha a nós e núcleos de mundo, salvando os dados no PostgreSQL e propagando para o Oráculo (RAG).
- **O que codificar:**
  - **Validação (Zod - Regra 3.1):** Criação do schema `salvarTarotSchema` em `/validators/mundoValidator.js` que valida o payload do Tarot (ID da entidade, número do arcano de 0 a 21, e polaridade +1 ou -1).
  - **Controllers (Node - Regra 3.3.1 Anti-IDOR):** Criar a rota `PUT /cronicas/:cronicaId/mundo/nodes/:nodeId/tarot` (e análoga para núcleos). O controller deve:
    1. Validar a posse do nó/núcleo (`nodePertenceACronica`) para evitar falhas de escopo cross-tenant.
    2. Fazer o `UPDATE` inserindo os metadados do Tarot no JSONB da coluna `dados` usando `jsonb_set` ou merge parametrizado.
  - **Sincronização com o Oráculo (RAG - Regra 4.2):** Integrar com o `services/oraculoSync.js`. Sempre que um Tarot for salvo, acionar a re-indexação do nó no ChromaDB para atualizar o conhecimento contextual da IA sobre aquele NPC/núcleo.
- **Teste de sucesso:** Uma chamada PUT atualiza o Tarot de um NPC no banco, retorna sucesso, e o log do microsserviço Python confirma o upsert do vetor correspondente com os dados do arcano inseridos.

---

### 🍕 Fatia 2 — Física de Constelação Expandida (Hooke, Densidade & Tarot)
- **Objetivo:** Adaptar o algoritmo físico do frontend para reagir às cartas de Tarot e conexões de rede, gerando clusters e gravidade dinâmicos.
- **O que codificar:**
  - **Gravidade por Densidade (Massa):** No `tickFisica()` em `public/js/controle_mundo.js`, calcular a "massa" de cada bolha como `1 + (numero_de_conexoes * 0.5)`. Nós com alta densidade (muitos vínculos) sofrem uma gravidade central de atração mais forte, ocupando o centro da constelação, enquanto nós órfãos ou leves orbitam nas bordas.
  - **Molas Hooke do Tarot:**
    - Ajustar a constante `k` e a distância ideal das molas no cálculo de atração/repulsão no JS:
      - Polaridades iguais (+1 e +1) ou compatíveis encurtam a distância ideal, formando clusters unidos.
      - Polaridades negativas (-1) geram repulsão, esticando a linha visualmente.
      - Se a distância esticada ultrapassar o limite crítico `FIS_REP_DIST`, a mola se rompe no canvas visual e uma notificação sugere o rompimento da relação (salvando o novo status no banco).
  - **Magnetismo de Arquétipos:** Força de atração extra entre nós baseada na proximidade dos números das cartas de Tarot (0 a 21), promovendo agrupamento temático natural de arcanos próximos, mesmo sem conexões diretas.
- **Teste de sucesso:** Ao abrir a lente de constelação, os núcleos se movem organicamente na tela. Adicionar um arcano negativo (ex: Torre) faz a bolha repelir-se da constelação principal e orbitar distante.

---

### 🍕 Fatia 3 — Interface No-Code Interativa (Quadro Branco e Drag & Drop)
- **Objetivo:** Dar poder ao Narrador para manipular o grafo fisicamente, criando relações por arrasto e gerando bolhas ao clicar.
- **O que codificar:**
  - **Drag & Drop Nativo (Sem Bibliotecas - Regra 7.1):**
    - Habilitar o início de um arrasto a partir de uma "âncora de vínculo" na borda de uma bolha.
    - Capturar o `pointermove` desenhando uma linha temporária e, no `pointerup` sobre outra bolha, acionar a criação de conexão (inserindo o novo link em `world_links` através da API).
  - **Criação Rápida (Quadro Branco):**
    - Adicionar listener de duplo clique em áreas vazias da lente de constelação.
    - Criar uma bolha flutuante efêmera e abrir uma janela flutuante rápida (Vanilla UI) para dar nome e selecionar o tipo da entidade (NPC/Local/Núcleo).
    - Clicar duas vezes em uma bolha existente abre o painel/modal de edição padrão daquela entidade (onde o Tarot da Fatia 1 é configurável).
  - **Salvamento Manual (Regra 2.7):**
    - A movimentação física dos nós atualiza apenas a memória local e o DOM em tempo real.
    - Exibir o botão "Salvar Constelação" na barra superior. Ao clicar, o frontend envia em lote as posições X/Y consolidadas e as novas ligações para serem persistidas no banco, eliminando APIs spams.
- **Teste de sucesso:** O narrador dá duplo clique no tabuleiro vazio, cria o nó "Guarda Imperial", arrasta uma linha dele até o "Sindicato dos Ladrões", clica em "Salvar Constelação" e o banco de dados registra o nó e a nova sinapse.

---

### 🍕 Fatia 4 — Storylets de Tensão & Sugestões da IA (Oráculo RAG)
- **Objetivo:** Unir o motor físico ao Oráculo RAG, sugerindo conflitos dramáticos à medida que o grafo se altera e as tensões rompem.
- **O que codificar:**
  - **Gatilhos de Tensão (Storylets):**
    - No backend Node.js, ao processar mutações de vínculos ou Tarot, calcular o índice de tensão da rede. Se a repulsão exceder o limite crítico ou um link de Tarot negativo for criado, engatilhar uma requisição de sugestão para o Oráculo.
  - **Prompt RAG Temático (Python):**
    - No FastAPI (`oraculo_service/app.py`), criar prompt que injeta os arcanos do Tarot dos personagens envolvidos e seus trechos RAG mais próximos para gerar um micro-evento narrativo (Storylet).
  - **Divulgação Progressiva (Regra 7.2):**
    - Exibir as sugestões de Storylets no frontend de forma limpa (ícone discreto pulsando na linha do relacionamento ou hover preview).
    - O Narrador, ao visualizar a sugestão e passar o mouse, vê a ideia de evento gerada pela IA e pode clicar em "Adotar Evento", inserindo-o automaticamente como um `world_event` oficial.
- **Teste de sucesso:** A quebra de um link entre dois líderes devido ao Tarot negativo faz surgir um indicador de tensão no tabuleiro. O hover revela a traição gerada pela IA, e o narrador a converte em evento com um único clique.

---

## 4. Conformidade com a Regra Dourada (`ARQUITETURA.md`)

- **Regra 1 (Vanilla JS & Sem Libs):** A física de Hooke e a renderização do grafo de constelação utilizam SVG e manipulação de DOM nativos do JS. Nenhuma biblioteca de terceiros como D3.js, Sigma.js ou Cytoscape.js será adicionada ao frontend.
- **Regra 2.7 (Salvamento Manual):** O grafo de forças e o arrasto físico rodam a 60fps localmente no DOM. Nenhuma requisição HTTP é feita durante o cálculo físico ou movimentação; as coordenadas e vínculos só são enviados ao servidor quando o utilizador clica explicitamente no botão "Salvar Constelação".
- **Regra 3.3.1 (Anti-IDOR Multi-tenant):** Toda e qualquer ação de leitura ou mutação do Tarot ou vínculos valida a autoria da crônica (`WHERE cronica_id = $1`) e a posse dos nós, garantindo isolamento absoluto entre mesas de RPG distintas.
- **Regra 7.1 (Drag & Drop Nativo):** O traçado de novas sinapses e a movimentação visual de orbes usam exclusivamente a API nativa de eventos de ponteiro (`PointerEvents`: `pointerdown`, `pointermove`, `pointerup`), zero bibliotecas.
- **Regra 6.1 (Prevenção de XSS):** O texto das sugestões de Storylets gerado pela IA passa obrigatoriamente por `escapeHTML()` antes de ser exibido nas bolhas ou modais de hover.
