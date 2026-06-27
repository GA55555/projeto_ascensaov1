# 🔮 Projeto Oráculo — Planejamento (RAG desacoplado, hardware-aware)

> **Lei dourada:** `ARQUITETURA.md`. Nada aqui pode violá-la. Este documento é PLANO — nenhuma
> linha foi implementada ainda. Cada decisão foi validada contra o **código real** (file:line),
> conforme o imperativo de "verificar premissas de prompt antes de implementar".
>
> **Status (atualizado 26/jun/2026):** F1–F5 **completos**; além disso: re-indexação de frescura
> (Regra 4.2), validação Zod do toggle (Regra 3.1) e **chunking de Sessões** (§4.4/5) — todos feitos
> nesta data, validados estaticamente; **smoke ao vivo de ponta a ponta ainda PENDENTE no servidor**.
> Próximo foco: **memória de conversa multi-turn**. DDL aplicada, decisões travadas. **O estado real e o
> guia de retomada estão na §9 (Diário) — comece pela "🔖 Retomada rápida — sessão 26/jun" no topo dela**;
> o corpo do plano (§1–§8) é a intenção original e pode divergir de detalhes já implementados.

---

## 0. Como ler este documento
- **§1** contexto e restrição de hardware.
- **§2** validação de premissas do prompt (o que é falso e como superar sem violar a arquitetura).
- **§3** restrições da arquitetura que governam TODA a operação (anti-IDOR no vetor, DML-only, segurança).
- **§4** decisão do stack de IA (embeddings + geração), fundamentada na realidade das APIs.
- **§5** o roadmap fatiado (F1–F5), refinado e conforme o contrato.
- **§6** pedidos ao DBA (DDL) — a app não faz DDL (Regra 4.1).
- **§7** decisões pendentes do Narrador.
- **§8** débitos e riscos.

---

## 1. Contexto da operação

**Hardware:** AMD A6, **7,2 GB RAM**, SSD 120GB. Servidor único rodando PostgreSQL + Node.js/Express
(o app atual) e, agora, o ecossistema de IA. Cada MB e cada ciclo importam.

**Regra de ouro do hardware (do prompt, compatível com a arquitetura):**
- ❌ Nada de filas pesadas (Redis, RabbitMQ).
- ❌ Nada de banco em Java.
- ✅ "Segundo Banco" = **ChromaDB embarcado** (mesmo processo do Python, grava no SSD).
- ✅ Oráculo **opcional** (liga/desliga por crônica).

**App atual (fatos do código):** Node/Express, PostgreSQL via `pg`, auth **cookie-only** (`m20_token`),
sem Docker, `.env.exemple` presente, `process.env` usado para `JWT_SECRET`, `NODE_ENV`, `CORS_ORIGINS`.
Controllers de mundo/cenas existem (pontos de gancho — ver §5/F2).

---

## 2. Validação de premissas do prompt

| # | Premissa do prompt | Veredito | Realidade / superação |
|---|---|---|---|
| P1 | "pede à API da IA (**OpenAI/Anthropic**) para transformar texto em vetor" | ❌ **FALSA p/ Anthropic** | A Anthropic **não tem API de embeddings** — tudo passa por `/v1/messages` (geração). Embeddings precisam de **Voyage AI** (recomendado pela Anthropic), **OpenAI**, ou modelo local. Ver §4. |
| P2 | "O container Python sobe no **Docker**" | ❌ **FALSA** | O projeto **não é containerizado** (sem `Dockerfile`/`compose`). No AMD A6, Docker adiciona overhead de RAM. Recomendo **venv + systemd/pm2** rodando o Python direto; Docker fica opcional. |
| P3 | Embeddings via "a API da IA" + serviço **< 150MB RAM** | ⚠️ **TENSÃO** | Embeddings **locais** (torch/sentence-transformers) custam ~200MB+; até o ONNX padrão do Chroma ~130–150MB → estoura o alvo. Embeddings **via API** mantêm o serviço ~60–100MB. O alvo de 150MB praticamente **exige** embeddings por API (ou relaxar o alvo). Ver §4 e §7. |
| P4 | Geração "OpenAI/Anthropic" | ✅ OK (decidido) | **Travado: formato OpenAI com BYOK** — padrão **DeepSeek** (`deepseek-chat`), trocável p/ OpenAI (`gpt-4o-mini`). Ver §4.4. Não pesa na RAM (é API). |
| P5 | ChromaDB embarcado "partilha o mesmo processo e memória" | ✅ OK, com nota | `chromadb.PersistentClient` grava no SSD. Para **não** carregar o ONNX (RAM), passar embeddings **pré-computados** (via API) ao Chroma com `embedding_function=None`. Ver §4. |
| P6 | Fire-and-forget do Node p/ Python (sem `await`) | ✅ OK, com guarda | Compatível, mas precisa de **timeout curto + catch que loga e segue** (nunca derrubar o request do Narrador). Ver §5/F2. |
| P7 | "Sincronizar Mundo com Oráculo" lê NPCs/Facções | ✅ OK | Entidades vivem em `world_nodes` (tipo npc/faccao), eventos em `world_events`, núcleos em `entidade_nucleos`. Tudo escopado por `cronica_id`. |

**Conclusão:** o roadmap é sólido, mas **P1/P2/P3** mudam decisões concretas (provedor de embeddings,
ausência de Docker, alvo de RAM). Nada disso quebra a arquitetura — apenas a respeita melhor.

---

## 3. Restrições da arquitetura que governam TUDO (a regra de ouro)

Estas se aplicam a **todas** as fatias e são inegociáveis:

1. **Isolamento multi-tenant no banco vetorial (Regra 3.3.1 — Anti-IDOR, a mais crítica aqui).**
   O Oráculo é um **segundo banco** de dados sensíveis de mundo. Cada documento e cada consulta
   DEVEM ser amarrados ao `cronica_id`. Concretamente:
   - Toda métadata de documento no Chroma inclui `cronica_id` (e `tipo`, `entidade_id`).
   - **Toda consulta filtra por `cronica_id`** (`where={"cronica_id": <id>}`) — uma crônica **nunca**
     pode recuperar texto de outra. Isso é o equivalente vetorial do `WHERE id=$1 AND cronica_id=$2`.
   - O Node, antes de chamar o Python, já validou acesso à crônica (middleware `checarAcessoCronica`);
     o Python **confia no `cronica_id` assinado/validado** que o Node envia (ver §3.4 segurança).
   - Falha de escopo → tratar como recurso inexistente (404-equivalente), nunca vazar.

2. **App é DML-only; DDL é do DBA (Regra 4.1).**
   O flag opt-in (`oraculo_ativo`) numa coluna de `cronicas` é **DDL** → **pedido ao DBA** (§6).
   O ChromaDB grava em **pasta no SSD** (fora do Postgres), então o "segundo banco" não precisa de DDL,
   mas qualquer coluna de controle no Postgres precisa do DBA.

3. **Segurança do microsserviço Python (Regra 6.4 — Defesa de Borda).**
   - O Python **NÃO** pode ser exposto à internet. Escuta só em **`127.0.0.1`** (localhost) — o Node
     fala com ele localmente. Sem CORS aberto, sem porta pública.
   - **Chaves de IA vivem só no servidor, nunca no frontend.** A de **embeddings** (projeto) no `.env`;
     a de **geração** (BYOK do utilizador) **cifrada** no Postgres, decifrada pelo Node e passada ao Python
     só na chamada interna. O frontend nunca fala com a IA direto.
   - Segredo compartilhado Node↔Python (header interno) para o Python não aceitar chamadas de outro
     processo local malicioso.

4. **Auth cookie-only e escopo de crônica (Regras 1 e 3.3).**
   O fluxo do usuário continua cookie-only no Node. O Python é interno; o Node é o único a chamá-lo,
   sempre **depois** de `verificarToken` + `checarAcessoCronica`. O Python recebe `cronica_id` já validado.

5. **Validação Zod nas rotas de mutação do Node (Regra 3.1).**
   As rotas novas no Node (ex.: toggle do Oráculo, "Sincronizar", proxy de consulta) que forem
   POST/PUT **precisam de schema Zod** + middleware `validate`.

6. **Sem auto-save/spam de rede; lazy loading (Regras 2.7, 2.3).**
   Os ganchos da F2 são **fire-and-forget** (não atrasam a tela). O chat da F5 só busca quando aberto.

7. **Frontend: Vanilla, sem libs novas; UI por classes/tokens; ícones Lucide; XSS (Regras 1, 2.5, 6.1).**
   O modal de chat (F5) é Vanilla JS, reusa classes de `global_ui.css`, escapa toda resposta da IA
   com `escapeHTML` antes de `innerHTML`, ícones Lucide, sem cor hardcoded.

8. **Higiene/ressincronização defensiva (Regra 4.2).**
   Deletar uma entidade no Postgres deve **remover o vetor** correspondente no Chroma (senão o Oráculo
   "lembra" de mortos). Dados corrompidos no jsonb não podem derrubar o upsert.

---

## 4. Decisão do stack de IA (fundamentada)

> ⚠️ **§4.1–§4.3 registram a análise inicial (Anthropic/Voyage como hipótese). O stack FINAL está
> travado na §4.4** (BYOK OpenAI-compatível: OpenAI **ou** DeepSeek para gerar; OpenAI
> `text-embedding-3-small` para embeddings). Em caso de conflito, vale a §4.4.

### 4.1 Embeddings (a parte que o prompt errou) — DECISÃO PENDENTE (§7)
A Anthropic não faz embeddings. Três caminhos, com o trade-off de RAM como eixo (alvo: serviço <150MB):

| Opção | RAM local | Custo | Privacidade | Veredito |
|---|---|---|---|---|
| **A. API Voyage** (`voyage-3-lite`/`voyage-3`) | ~Ø (só HTTP) | barato | texto sai p/ Voyage | **Recomendado** — provedor que a Anthropic recomenda; mantém o alvo de 150MB |
| **B. API OpenAI** (`text-embedding-3-small`) | ~Ø (só HTTP) | muito barato | texto sai p/ OpenAI | Alternativa sólida e comum |
| **C. Local ONNX** (all-MiniLM via Chroma default) | ~130–150MB | grátis | 100% local | **Estoura/risca o alvo de 150MB**; só se privacidade local for inegociável e o alvo subir p/ ~300MB |

**Padrão RAM-ótimo (A ou B):** o Python computa o vetor via API e **entrega o vetor pronto** ao Chroma
(`collection.add(embeddings=[...], documents=[...], metadatas=[...])`, `embedding_function=None`),
**evitando** carregar onnxruntime. A MESMA função de embedding é usada no upsert (F2/F3) e na consulta
(F4) — consistência obrigatória (mesmo modelo dos dois lados).

### 4.2 Geração (RAG) — Anthropic
- **Modelo padrão:** `claude-opus-4-8` (atual mais capaz). **Opção econômica:** `claude-haiku-4-5`.
- SDK oficial **`anthropic`** (Python), **adaptive thinking** (`thinking={"type":"adaptive"}`),
  **streaming** se a resposta puder ser longa. Chave em env do Python.
- O "super prompt" do RAG injeta **apenas** os trechos recuperados (grounding) + a pergunta, e instrui
  o Oráculo a responder **só** com base neles (reduz alucinação) — exatamente como o roadmap descreve.

### 4.3 Microsserviço
- **FastAPI** (leve) + **uvicorn** (1 worker, sem reload em prod) escutando em `127.0.0.1:<porta>`.
- **Deps mínimas (stack travado, ver §4.4):** `fastapi`, `uvicorn`, `chromadb`, `openai`. **Uma única
  biblioteca (`openai`)** serve geração (OpenAI **ou** DeepSeek, só muda `base_url`) **e** embeddings
  (`text-embedding-3-small`). Sem `anthropic`, sem `voyageai`.
- Sem Docker (§4.4/P2): **venv + pm2**.

---

## 4.4 Decisões travadas do Narrador + análise arquitetural (atualização)

> Esta conversa é referência objetiva. As decisões abaixo **resolvem** os itens 1, 2, 4 e 5 da §7 e
> **substituem** o stack provisório do §4.1–§4.2 (Anthropic+Voyage). Cada ponto foi pesado contra a
> `ARQUITETURA.md` e o objetivo final (um Oráculo RAG leve, barato e isolado por crônica).

### (1 e 2) BYOK — "Chave do Utilizador" + formato OpenAI (OpenAI **ou** DeepSeek)
**Decisão:** o sistema aceita a **chave do utilizador**. Usamos o **formato/SDK da OpenAI**, que aceita
**nativamente o DeepSeek** para pensar/responder (mesma API, basta trocar `base_url` para
`https://api.deepseek.com`). O Narrador configura na UI: **"Chave da API" + "URL do Provedor" (+ modelo)**.

**Análise (a parte que muda o stack e que a arquitetura exige tratar):**
- **Uma só biblioteca:** o `openai` SDK cobre geração (OpenAI `gpt-4o-mini`/DeepSeek `deepseek-chat`) e
  embeddings — **menos uma dependência** que o plano anterior (some `anthropic` e `voyageai`). Bom para RAM.
- **Embeddings ≠ DeepSeek → dois donos de chave (RESOLVIDO):** o DeepSeek **não tem embeddings**; o padrão
  é o **`text-embedding-3-small` da OpenAI** (~1.000 páginas < US$0,02). **Decisão travada:**
  - **Embeddings = chave do PROJETO** (no `.env` do servidor — `OPENAI_EMBEDDINGS_KEY`), **não** BYOK.
    Custo é centavos e fica com o dono do servidor; onboarding do Narrador fica simples (ele só dá a chave
    de **chat**). Quem chama embeddings é o serviço Python, com essa chave do env.
  - **Geração = BYOK, por UTILIZADOR**, **padrão DeepSeek** (`base_url=https://api.deepseek.com`,
    `model=deepseek-chat`). O Narrador pode trocar para OpenAI (`gpt-4o-mini`) na config.
  - **Consequência de fluxo (importante):** `/upsert` (F2/F3) só precisa de **embeddings** → usa a chave do
    projeto, **não** precisa da chave do Narrador. Só `/consultar` (F4) precisa da **chave de geração** do
    Narrador. Isso reduz o trânsito do segredo: a chave BYOK só viaja na **consulta**.
- **🔒 Segurança da chave (imperativo da regra de ouro — Regra 6 / Secção 3):** a chave do utilizador é um
  **segredo**. NÃO pode ser guardada em texto puro nem voltar para o frontend. Regras concretas:
  1. **Criptografar em repouso** — cifrar no Node (módulo `crypto`, AES) com uma `ORACULO_ENC_KEY` no
     `.env` (irmã do `JWT_SECRET`) **antes** do `INSERT`/`UPDATE`. Nada de plaintext no Postgres.
  2. **Write-only no frontend** — a UI grava a chave mas **nunca** a recebe de volta; mostra só
     "chave definida ✓" (igual a senha). O `GET` de perfil/config jamais devolve a chave.
  3. **Trânsito só interno** — quem usa a chave é o **serviço Python** (em `127.0.0.1`). Fluxo: Node
     decifra a chave e a repassa ao Python **na chamada localhost** (com o segredo compartilhado da §3.3);
     a chave **nunca** trafega para fora do servidor a não ser para o provedor de IA escolhido.
  4. **DDL é do DBA (Regra 4.1):** as colunas para guardar chave cifrada/URL/modelo são **DDL → §6**.
- **Divergência consciente do default Anthropic:** o plano original sugeria Claude/Anthropic; o Narrador
  **escolheu explicitamente** OpenAI-compatível + DeepSeek (custo/inteligência). É uma decisão deliberada
  de provedor não-Anthropic — respeitada aqui. A privacidade passa a ser **escolha do Narrador** (chave e
  provedor dele), o que também resolve o item 6 da §7.

### (4) Docker vs Venv → **Venv + pm2** (confirmado, com fato novo)
**Decisão:** rodar o Python "direto no metal" com **venv + pm2**. **Não** Docker.
**Análise:** o AMD A6/7,2GB **já sofre com 6 contêineres Docker** rodando — fato novo que **aperta ainda
mais** o orçamento de RAM (Postgres + Node + 6 contêineres + agora o Oráculo, tudo em 7,2GB). O Docker
gasta RAM só para simular rede/sistema; o venv isola apenas as bibliotecas, sem essa camada. Isso é o que
torna **viável** a meta de **< 150MB** do serviço (§5/F1). **Reforço para o orçamento de RAM:** com 6
contêineres já ativos, a meta de 150MB e **embeddings por API** (sem ONNX local) deixam de ser preferência
e viram **necessidade**.

### (5) Estruturação colossal (Mundo, Eventos, **Automações, Sessões**) → escopo + **chunking**
**Decisão:** o escopo do Oráculo **inclui Sessões e Automações** (não só NPCs/Facções/Eventos). A força do
RAG é **estilhaçar** esse volume.
**Análise (consequência técnica nova — chunking):**
- Resumos de **sessão** (`sessoes.resumo`/`desfechos`) e **automações** podem ser **textos longos**. Enviar
  tudo à IA estouraria contexto e custo. Então, na escrita (F2/F3), **textos longos são divididos em blocos
  ("chunks")** — cada bloco vira **um vetor** com metadata `{cronica_id, tipo:'sessao'|'automacao',
  entidade_id, chunk:i}` e `id = f"{tipo}:{entidade_id}:{i}"`.
- **Re-upsert de algo que mudou:** apagar **todos os chunks** daquele `entidade_id` antes de regravar (o nº
  de chunks pode mudar) — mantém o Chroma coerente (Regra 4.2).
- **Na leitura (F4):** a busca vetorial traz **só os 3–5 blocos** onde o assunto aparece (ex.: "o que
  aconteceu com o Rei na sessão passada?" → blocos específicos da sessão), e a IA lê **só esses**. O sistema
  não "sua" mesmo com 5 anos de campanha — exatamente o ganho do RAG.
- **Impacto no fatiamento:** F2 e F3 ganham um passo de **chunking** + tabelas-fonte ampliadas
  (`sessoes`, `automacoes`); F4 já usa top-k (k cobre múltiplos blocos da mesma entidade); F5 ganha os
  campos de **BYOK** (chave/URL/modelo) na config.

---

## 5. Roadmap fatiado (refinado e conforme a arquitetura)

> Ordem do prompt mantida (F1→F5), incremental e segura. Cada fatia: objetivo, o que codificar,
> conformidade com as regras, teste de sucesso e riscos. Validação estática + débito de teste ao vivo
> declarados (ambiente sem Postgres/browser aqui).

### 🍕 Fatia 1 — O Alicerce de IA (microsserviço leve)
**Objetivo:** erguer o microsserviço Python (meio-campo entre o app, o banco vetorial e a IA),
consumindo o mínimo de RAM.

**O que codificar:**
- **Path real (WSL):** `~/dev/projeto_ascensao/oraculo_service/` — **fora** do app Node
  (`projeto_ascensaov1/`), pasta irmã. Já contém `app.py` (FastAPI), `requirements.txt` e `venv/`.
  Falta `.env`/`.env.exemple` próprio (chaves de IA, porta, segredo) e `README` de boot.
- `chromadb.PersistentClient(path="<SSD>/oraculo_db")` — grava no SSD, sem container extra.
- Dois endpoints **vazios** (esqueleto): `POST /upsert` e `POST /consultar`, mais `GET /health` (ping).
- Escuta em **`127.0.0.1`**; middleware que exige o **header de segredo compartilhado** (Regra 6.4).

**Conformidade:** Regra 6.4 (sem exposição pública; chaves server-side), Regra 4.1 (Chroma no SSD, sem
DDL). Nada toca o Postgres ainda.

**Teste de sucesso:** o serviço sobe (venv, sem Docker), responde `GET /health` ("pong"), e o
**RSS do processo fica < 150MB** (medir com `ps`/`/proc`). Se passar de 150MB, revisar §4.1 (provavelmente
embeddings locais — trocar por API).

**Riscos:** dependências do `chromadb` podem puxar onnxruntime mesmo sem usá-lo → confirmar RSS; se
inflar, fixar versões/extras enxutos.

**📌 Estado real (jun/2026) — `~/dev/projeto_ascensao/oraculo_service/`:**
- **RSS em produção: ~6,6MB** (pm2) — muito abaixo da meta de 150MB. ✅ (ONNX nunca carrega: sempre
  passamos `embeddings=`/`query_embeddings=` prontos; o onnxruntime fica só instalado, sem rodar.)
- **🔴 Bloqueador resolvido — NumPy:** `chromadb 0.5.0` **não funciona com NumPy 2.x** (usa `np.float_`,
  removido na 2.0) → todo `upsert`/`query` quebrava. **Fixado `numpy<2` (1.26.4)** no `requirements.txt`.
  (Lição p/ o boot do serviço: instalar a partir do `requirements.txt` com `numpy<2`.)
- **Caminho de dados + anti-IDOR PROVADOS localmente:** upsert/query/delete ok; consulta com `cronica_id`
  de outra mesa retorna **vazio** (isolamento da Regra 3.3.1 confirmado).
- **Telemetria do chromadb** emite avisos inofensivos → opcional silenciar
  (`Settings(anonymized_telemetry=False)`).
- **Atenção pm2:** o `pm2` **não recarrega** ao salvar o arquivo. Após corrigir o `app.py`, **`pm2 restart
  oraculo`** (o processo "online" pode estar rodando uma versão antiga em memória).

---

### 🍕 Fatia 2 — O Caminho da Escrita (sincronização invisível)
**Objetivo:** o Node avisa o Python sempre que o Narrador altera o mundo, **sem atrasar a tela**.

**O que codificar (Node):**
- `services/oraculoClient.js` (camada de rede isolada — Regra 2.4): `enviarParaOraculo(acao, dados)`
  faz `POST http://127.0.0.1:<porta>/upsert` (ou `/remover`) em **fire-and-forget**:
  `fetch(...).catch(err => console.error('[oraculo] falhou, seguindo', err))` — **sem `await`** no fluxo
  do request, **timeout curto** (ex.: 2s via AbortController) e header do segredo compartilhado.
- **Gate opt-in:** `enviarParaOraculo` só dispara se a crônica tem o Oráculo ligado (flag da F5/§6).
  Desligado → no-op (Regra: feature opcional).
- **Ganchos nos controllers (após o COMMIT no Postgres, no caminho de sucesso):**
  - `mundoController.js:79 criarNode` e `:94 editarNode` → upsert do node (npc/faccao/local).
  - `mundoController.js:135 deletarNode` → **remover** o vetor (Regra 4.2/6.6 — nada de zumbis).
  - `mundoController.js:454 criarEvento` / `:482 deletarEvento` → upsert/remover evento.
  - `cenasController.js:39/56/78` (criar/atualizar/deletar cena) → upsert/remover (se cena entrar no escopo).
  - Cada gancho usa o `cronica_id` **já validado** pelo middleware da rota.

**O que codificar (Python `/upsert`):**
- Recebe JSON `{cronica_id, tipo, entidade_id, texto}` (+ valida o segredo compartilhado).
- Computa o vetor via **API de embeddings** (§4.1) e grava no Chroma com **metadata `{cronica_id, tipo,
  entidade_id}`** e `id = f"{tipo}:{entidade_id}"` (idempotente: re-upsert sobrescreve).
- `/remover` apaga por `id` **amarrado ao `cronica_id`** (anti-IDOR também na escrita).

**Conformidade:** Regra 2.7 (sem auto-save/spam — o fire-and-forget é 1 disparo por mutação já existente),
Regra 2.4 (rede isolada), Regra 3.1 (a rota que o gancho serve já tem Zod), Regra 3.3.1 (metadata
`cronica_id`), Regra 4.2/6.6 (delete propaga; jsonb corrompido não derruba o upsert — try/catch defensivo),
Regra 6.4 (chamada interna + segredo).

**Teste de sucesso:** Narrador cria um Vampiro no Tabuleiro → a tela salva na hora (sem atraso perceptível)
→ segundos depois o log do Python mostra "Vampiro adicionado ao banco vetorial". Derrubar o Python **não**
quebra o salvar do Narrador (fire-and-forget tolera falha).

**Riscos:** ordem de chamada (só após persistir no Postgres); montar o `texto` do node a partir do jsonb
de forma defensiva; garantir que o gancho não vaze exceção pro request do Narrador.

---

### 🍕 Fatia 3 — O Big Bang (sincronização inicial)
**Objetivo:** popular o Chroma com o mundo que **já existe** no Postgres.

**O que codificar:**
- Rota no Node `POST /cronicas/:cronicaId/oraculo/sincronizar`, protegida por
  `verificarToken + checarAcessoCronica + apenasNarrador` (Regra 3.3) — **só o Narrador**, **só a sua crônica**.
- O controller lê `world_nodes` (npc/faccao/local) e `world_events` **da crônica** (`WHERE cronica_id=$1`,
  Regra 6.2 parametrizado) e envia ao Python **em lotes (ex.: 10 de cada vez)**, com pequena pausa entre
  lotes, para **não pregar a CPU do AMD A6**.
- **Idempotente:** como o `id` no Chroma é `tipo:entidade_id`, re-sincronizar sobrescreve (sem duplicar).
- Botão "Sincronizar Mundo com Oráculo" na config da crônica (F5) chama essa rota; mostra progresso simples.

**Conformidade:** Regra 3.3/3.3.1 (narrador + escopo `cronica_id` na query e na metadata), Regra 6.2
(queries parametrizadas), Regra 2.3 (operação pesada sob demanda, não no load), opt-in respeitado.

**Teste de sucesso:** o ChromaDB é populado com a história completa da mesa atual (contagem de vetores
≈ nº de NPCs/Facções/Eventos da crônica). Re-rodar não duplica.

**Riscos:** crônicas grandes → lotes + backpressure; custo de embeddings no Big Bang (N chamadas à API) —
medir e, se preciso, lote maior por request de embedding (muitos provedores aceitam batch).

---

### 🍕 Fatia 4 — O Caminho da Leitura (o cérebro do Oráculo / RAG)
**Objetivo:** a mágica — Retrieval-Augmented Generation.

**O que codificar (Python `/consultar`):**
1. Recebe `{cronica_id, pergunta}` (+ valida o segredo compartilhado).
2. **Embeda a pergunta** com a **mesma** API/modelo de embedding da F2 (consistência obrigatória).
3. **Busca de similaridade no Chroma com `where={"cronica_id": <id>}`** → top-k (ex.: 5).
   **Esta cláusula `where` é a fronteira de segurança (Regra 3.3.1):** sem ela, uma crônica veria
   o mundo de outra. É inegociável.
4. Monta o **super-prompt**: *"Você é o Oráculo. Baseado **apenas** nestes trechos [TRECHOS], responda:
   [PERGUNTA]. Se a resposta não estiver nos trechos, diga que não sabe."* (grounding anti-alucinação).
5. Chama a **geração via SDK `openai`** com a **chave BYOK do Narrador** (`base_url`/`model` dele —
   padrão DeepSeek `deepseek-chat`), streaming se longo, pega a resposta e devolve ao Node.

**Node:** rota proxy `POST /cronicas/:cronicaId/oraculo/consultar`
(`verificarToken + checarAcessoCronica + apenasNarrador + validate(zodSchema)`); **decifra a `oraculo_gen_key`
do utilizador** e repassa ao Python (na chamada interna) o `cronica_id` **já validado** + a pergunta +
`{gen_key, gen_url, gen_model}`, e devolve a resposta ao frontend. (O `/upsert` da F2/F3 **não** recebe a
chave — embeddings usam a chave do projeto no env.)

**Conformidade:** Regra 3.3.1 (filtro `cronica_id` no retrieval — núcleo do isolamento), Regra 3.1 (Zod na
rota), Regra 6.4 (chave de IA só no Python; Python interno), Regra 3.2 (resposta padronizada p/ o frontend).

**Teste de sucesso:** pergunta no Postman/terminal ("Quem pode trair a Igreja?") → a IA responde citando
os personagens corretos **da crônica certa**; uma pergunta com `cronica_id` de outra mesa **não** retorna
os dados desta (isolamento provado).

**Riscos:** latência (geração pode demorar — UX de loading na F5); `k` e tamanho de trecho vs. custo de
tokens; garantir que trechos vazios → resposta "não sei", não invenção.

---

### 🍕 Fatia 5 — A Interface de Mestre (front-end opt-in)
**Objetivo:** garantir o critério de ouro — o Oráculo é **opcional** e fácil de ligar/desligar.

**O que codificar (frontend Vanilla — Regras 1, 2.4, 2.5, 6.1):**
- **Switch "Ligar Oráculo de IA"** na config da crônica → `PUT /cronicas/:id/oraculo` (Zod) grava o flag
  `oraculo_ativo` (coluna do §6). **Desligado → os ganchos da F2 viram no-op** (gate já previsto).
- **Botão "Consultar Oráculo"** no Tabuleiro (`controle_mundo`) → abre **modal lateral de chat** (Vanilla,
  reusa `.modal-*` de `global_ui.css`, ícones Lucide, sem cor hardcoded). Fetch isolado em
  `public/js/api/oraculoApi.js` (Regra 2.4).
- Loading "O Oráculo está a ler as estrelas…" enquanto espera a F4. **Resposta da IA passa por
  `escapeHTML` antes do `innerHTML`** (Regra 6.1 — texto da IA é não-confiável).

**Conformidade:** Regra 1 (Vanilla, sem libs), Regra 2.5 (classes/tokens, geometria sóbria), Regra 6.1
(escape da resposta), Regra 2.3 (lazy: chat só busca ao abrir), opt-in (critério de ouro).

**Teste de sucesso:** fluxo completo integrado: ligar o Oráculo, sincronizar, perguntar no chat e receber
a resposta citando a crônica; desligar → ganchos param de enviar.

**Riscos:** o flag desligado precisa cortar F2/F3/F4 de fato (testar); escapar a resposta (XSS); o modal
seguir o sistema de temas (incl. 16-bit/neovim) via tokens.

---

## 6. Pedidos ao DBA (DDL — a app não faz, Regra 4.1)

> A app só faz DML. Estas mudanças de esquema são do DBA, via acesso manual.

1. **Flag opt-in na crônica:**
   ```sql
   ALTER TABLE cronicas ADD COLUMN oraculo_ativo boolean NOT NULL DEFAULT false;
   ```
   (O Node lê/grava via UPDATE — DML; quem cria a coluna é o DBA.)

2. **BYOK — chave de GERAÇÃO do utilizador (§4.4), por utilizador, CIFRADA** (DeepSeek por padrão):
   ```sql
   ALTER TABLE usuarios ADD COLUMN oraculo_gen_key   text;                                  -- chave de geração (cifrada)
   ALTER TABLE usuarios ADD COLUMN oraculo_gen_url   varchar DEFAULT 'https://api.deepseek.com';
   ALTER TABLE usuarios ADD COLUMN oraculo_gen_model varchar DEFAULT 'deepseek-chat';        -- ou gpt-4o-mini
   ```
   - `oraculo_gen_key` guarda o segredo **cifrado** (AES, `ORACULO_ENC_KEY` no `.env`) — nunca plaintext,
     **write-only** (o `GET` de perfil nunca devolve a chave). O Node cifra/decifra (DML); o DBA cria as
     colunas (DDL). **Não há coluna de chave de embeddings** — embeddings são pagos pelo projeto (env).

3. **(Opcional) Auditoria/estado de sync** — só se quisermos registrar último Big Bang por crônica.
   Decidir com o Narrador antes de pedir (evitar tabela órfã).

**Segredos no `.env` do servidor (não-DDL, responsabilidade da app):**
```
OPENAI_EMBEDDINGS_KEY=...     # chave OpenAI do PROJETO (embeddings text-embedding-3-small) — usada pelo Python
ORACULO_ENC_KEY=...           # chave AES p/ cifrar a oraculo_gen_key (irmã do JWT_SECRET)
ORACULO_SHARED_SECRET=...     # segredo do header interno Node↔Python (127.0.0.1)
ORACULO_URL=http://127.0.0.1:<porta>
```

> O "segundo banco" (ChromaDB) vive em **pasta no SSD**, fora do Postgres → **não** demanda DDL.

---

## 7. Decisões do Narrador

**✅ TODAS TRAVADAS (ver §4.4 e §6):**
1. **Embeddings:** OpenAI **`text-embedding-3-small`**, **pagos pelo PROJETO** (chave no `.env`,
   `OPENAI_EMBEDDINGS_KEY`) — não é BYOK. Onboarding do Narrador pede só a chave de chat.
2. **Geração (BYOK, por utilizador):** **padrão DeepSeek** (`base_url=api.deepseek.com`,
   `model=deepseek-chat`); pode trocar p/ OpenAI (`gpt-4o-mini`). Chave **cifrada** em repouso (§6),
   write-only no frontend. Só a **consulta** (F4) usa essa chave.
3. **Onde guardar a chave BYOK:** por **utilizador** (`usuarios`). O opt-in (`oraculo_ativo`) fica na **crônica**.
4. **Alvo de RAM:** rígido **<150MB** ⇒ embeddings por API, sem ONNX local (reforçado pelos 6 contêineres Docker já ativos).
5. **Ambiente:** **venv + pm2** (sem Docker).
6. **Escopo:** Mundo (NPCs/Facções/Locais), Eventos, **Sessões e Automações** — textos longos via **chunking**.
7. **Privacidade:** decisão do Narrador (chave/provedor de geração dele); embeddings passam pela OpenAI do projeto.

**🟢 Nada bloqueando o início.** Falta só o **DBA aplicar a DDL da §6** (3 colunas em `usuarios` + 1 em
`cronicas`) e os segredos entrarem no `.env`. Feito isso, a **Fatia 1** (microsserviço isolado) pode começar
— ela nem depende da DDL (só toca o Python). A DDL é pré-requisito da **F2** em diante.

---

## 8. Débitos e riscos transversais
- **Custo recorrente:** cada upsert e cada consulta podem chamar APIs externas (embedding + geração).
  Medir e, se preciso, cachear embeddings/consultas frequentes.
- **Consistência Postgres↔Chroma:** delete/edição precisam propagar (F2) ou o Oráculo "mente". Um
  re-sync (F3) é a rede de segurança.
- **Segurança operacional (BYOK):** Python só em `127.0.0.1` + segredo compartilhado; **chaves do
  utilizador cifradas no banco** (§6), decifradas pelo Node e passadas ao Python só na chamada interna;
  `ORACULO_ENC_KEY` no `.env`; **nada de chave no frontend**. Revisar antes de qualquer deploy.
- **Teste ao vivo:** ambiente atual sem Postgres/browser → todas as fatias terão **débito de smoke ao vivo**
  declarado (igual ao restante do projeto).
- **Ordem segura:** F1 (isolada, sem tocar o app) → F2 (ganchos) → F3 (big bang) → F4 (RAG) → F5 (UI).
  Cada uma entrega valor e pode ser validada sozinha.

---

### Apêndice — pontos de gancho reais (file:line, validados)
- `controllers/mundoController.js:79` `criarNode` · `:94` `editarNode` · `:135` `deletarNode`
- `controllers/mundoController.js:454` `criarEvento` · `:482` `deletarEvento`
- `controllers/cenasController.js:39` `criarCena` · `:56` `atualizarCena` · `:78` `deletarCena`
- Entidades: `world_nodes` (npc/faccao/local, `cronica_id`), `world_events` (`cronica_id`),
  `entidade_nucleos` (`cronica_id`). Auth: cookie-only (`m20_token`). Sem Docker. `process.env`:
  `JWT_SECRET`, `NODE_ENV`, `CORS_ORIGINS`.

---

## 9. 🛠️ Diário de Implementação & Guia de Retomada (jun/2026)

> Esta seção reflete o **código real** (sobrepõe-se ao §1–§8 em caso de divergência). O microsserviço
> Python foi **movido para dentro do repo** (monorepo): `oraculo_service/` na raiz de
> `projeto_ascensaov1/`; `.gitignore` protege `venv/`, `chroma_data/`, `.env`. Trabalho na branch
> **`sandbox`**; o servidor (Debian 12, prod) faz `git pull` da `sandbox` + `pm2 restart` (Node =
> `mochila`, Python = `oraculo`). Ambiente de dev (WSL) **sem Postgres/browser** → validação estática
> aqui, **smoke ao vivo feito pelo Narrador no servidor**.

### 🔖 Retomada rápida — sessão 27/jun/2026 (LEIA PRIMEIRO ao voltar)
**O que esta sessão fechou (tudo validado estaticamente; smoke ao vivo PENDENTE no servidor):**
1. **Memória de conversa multi-turn (✅ feito — item 1 da fila):** o `/consultar` deixou de ser stateless.
   - **Front** (`controle_mundo.js`): `oraculoHistorico` guarda as últimas ~4 trocas (`ORACULO_HIST_MAX=8`);
     envia o histórico (sem a pergunta atual) e empilha a troca no sucesso.
   - **API** (`oraculoApi.js`): `consultar(cronicaId, pergunta, historico=[])` → body `{pergunta, historico}`.
   - **Zod** (`consultarOraculoSchema`): `historico` opcional, `default []`, **teto 8 msgs**, `role` em
     `enum(['user','assistant'])`, `content` 1–2000 chars (contém custo de tokens, §8).
   - **Controller** (`mundoController.consultarOraculo`): repassa `historico` ao client (o client é genérico).
   - **Python** (`/consultar`): `ConsultaRequest.historico: list[MensagemHistorico]=[]`; filtra papéis válidos
     + corta a `HIST_MAX=8` (defesa em profundidade); **retrieval embeda `últimaPergunta+atual`** (resolve
     "eles/isso"); geração com `messages=[system(grounding desta vez), ...histórico, user]`. `montar_super_prompt`
     virou `montar_system` (grounding como mensagem de **sistema**, pois os trechos mudam a cada turno).
     Bônus: `model_config={"protected_namespaces":()}` silencia o warning do Pydantic do campo `model_llm`
     (item 4 da fila, cosmético). **Não toca o banco.**

**Sessões anteriores (já commitadas):**
- **Chunking de Sessões (§4.4/5)** — `/upsert_chunks` + `textoDaSessao` + `reindexarSessao` + ganchos no
  `sessaoController` + sessões no Big Bang. (Commit `fd2b3114`.) Destrava "resumo da campanha" no chat.
- **F5 completo**, **Re-indexação de frescura (Regra 4.2, `oraculoSync.js`)**, **Zod no toggle (Regra 3.1)**.

**Smoke test ao vivo do F4 (feito pelo Narrador) — diagnóstico:**
- ✅ Funciona: retrieval por crônica, diplomacia (inferiu "vilões"), anti-alucinação ("não sei" quando
  não há trecho). ❌ Falhou "resumo da campanha" → **causa: sessões não indexadas → CORRIGIDO** (chunking).
- Observado: vaza o tipo cru `(cenario)` nas respostas → item 3 abaixo (pendente).

**PRÓXIMA SESSÃO — por onde pegar (em ordem; ver "Como continuar" abaixo p/ detalhe):**
1. ~~Memória multi-turn~~ ✅ FEITO.
2. ~~Automações~~ ✅ FEITO. **Correção de premissa:** o plano dizia "via chunking", mas o código real
   (`world_triggers`) mostra que automação é **regra curta** (condição→efeito), **não** texto longo →
   indexada como **vetor único** (`automacao:id`, `upsert`), não `upsert_chunks`. Describer
   `textoDaAutomacao` (resolve evento-gatilho, node-alvo e facção → nomes legíveis), `reindexarAutomacao`
   em `oraculoSync`, ganchos em `automacaoController` (criar/deletar/toggle) e automações no Big Bang.
3. **Não vazar o `tipo` cru** no super-prompt (ex.: "(cenario)") — ajustar `montar_system`. (O texto da
   automação já é auto-descritivo: começa com "Automação (regra reativa):".)
4. ~~Cosmético do warning Pydantic~~ ✅ FEITO junto com a multi-turn. Resta: silenciar telemetria do ChromaDB.
5. (Opcional) re-index de membros ao renomear/excluir facção.

**Pendência ANTES de confiar:** rodar o **smoke ao vivo** no servidor (`pm2 restart oraculo mochila`):
criar/editar sessão c/ resumo longo → `pm2 logs oraculo` deve mostrar `/upsert_chunks` com N chunks;
re-rodar Big Bang; perguntar "resumo da campanha?". Mexer numa flag/sinapse/diplomacia → ver re-upsert.
**Multi-turn:** perguntar "quem é o vilão?" e depois "e o que **ele** quer?" — a 2ª deve entender o pronome
(retrieval `últimaPergunta+atual`) e a resposta usar o contexto da 1ª (histórico nas `messages`).

**⚠️ Achado de segurança (fora do escopo, NÃO corrigido):** IDOR em `sessaoController.editarSessao`/
`deletarSessao` (`WHERE id=$1` sem `cronica_id`) — detalhe na nota ao fim do §9. Decidir se corrige.

### Pré-requisitos JÁ resolvidos
- **DDL aplicada** (Narrador assumiu DBA): `cronicas.oraculo_ativo` (bool, default false);
  `usuarios.oraculo_gen_key` (text, cifrada), `oraculo_gen_url` (default `https://api.deepseek.com`),
  `oraculo_gen_model` (default `deepseek-chat`).
- **`.env` do Node:** `ORACULO_URL` (atenção: o Python roda na porta **8001** em prod, não 8000),
  `ORACULO_SHARED_SECRET` (idêntico ao do Python), `ORACULO_ENC_KEY` (AES da chave BYOK).
- **`.env` do Python (`oraculo_service/`):** `ORACULO_PORT=8001`, `ORACULO_SHARED_SECRET`,
  `OPENAI_EMBEDDINGS_KEY`. Lembrete: **`pm2` não recarrega** — após editar, `pm2 restart`.

### Estado por fatia
- **F1 — Microsserviço (✅ feito, ao vivo):** `oraculo_service/app.py` (FastAPI, 127.0.0.1, header
  `X-Oraculo-Secret`, ChromaDB `PersistentClient`, `embedding_function=None`). RSS ~7MB.
- **F2 — Escrita invisível (✅ feito, ao vivo):** `services/oraculoClient.js`
  (`enviarParaOraculo` fire-and-forget, `enviarParaOraculoAsync` awaitable, `consultarOraculo`,
  `oraculoConfigurado`). Ganchos em `mundoController.js`: criar/editar node + criar/deletar evento +
  deletar node. Python `/upsert` e `/remover` (delete por `$and {cronica_id, entidade_id}`).
- **F3 — Big Bang (✅ feito, ao vivo):** `POST /cronicas/:cronicaId/oraculo/sincronizar` (só Narrador).
  Lê nodes + **núcleos/facções** + eventos da crônica, monta texto rico, upsert em lotes de 10 com
  pausa. Idempotente.
- **F4 — Consulta RAG (✅ feito, ao vivo):** Python `/consultar` (embeda pergunta, retrieval
  `where cronica_id`, super-prompt anti-alucinação, geração BYOK, "não sei" se vazio).
  `utils/oraculoCripto.js` (AES-256-GCM, chave derivada de `ORACULO_ENC_KEY` por SHA-256).
  `PUT /perfil/oraculo` (grava a chave **cifrada, write-only**; `GET /perfil` expõe só
  `oraculo_tem_chave`). Proxy `POST /cronicas/:cronicaId/oraculo/consultar` (gates → decifra a chave
  do Narrador → chama o Python).
- **Texto rico (✅ feito):** `services/oraculoTexto.js` — describer único (DRY) usado pelo Big Bang e
  pelos ganchos: `textoDoNode` (facção, local-pai, flags, sinapses), `textoDoNucleo` (membros +
  diplomacia), `textoDoEvento` (estado/tensão, núcleos, gatilhos). Os ganchos montam o texto em 2º
  plano (sem `await` — não atrasam a tela).
- **Sessões via chunking (✅ feito, §4.4/5):** o resumo de sessão é texto LONGO → indexado em vários
  vetores. Python ganhou `/upsert_chunks` (apaga TODOS os chunks antigos da entidade + fatia + embeda em
  lote + grava `sessao:id:i` com metadata `chunk:i`, tudo NUM handler — sem corrida delete/write);
  helpers `embeddar(lote)`, `fatiar_texto` (~900 chars, parágrafo-aware) e const `EMBED_MODEL` (DRY;
  os 2 embeddings inline antigos passaram a usá-los). Describer `oraculoTexto.textoDaSessao` (título,
  data, estado, grupo, personagens/eventos citados resolvidos por UUID→nome, desfechos, resumo).
  `oraculoSync.reindexarSessao` (ação `upsert_chunks`). Ganchos em `sessaoController` (criar/editar →
  reindex; deletar → `removerEntidade`, que apaga `sessao:id:*` por metadata). Big Bang inclui sessões
  (laço agora respeita `acao` por-alvo). **Destrava "resumo da campanha"/"o que aconteceu" no chat.**
- **Automações (✅ feito, SEM chunking):** `world_triggers` é regra curta (condição→efeito) → **vetor
  único** `automacao:id` (`upsert`, não `upsert_chunks` — premissa do §4.4/5 corrigida contra o código).
  `oraculoTexto.textoDaAutomacao` traduz o `effect_json` p/ frase natural (resolve evento-gatilho/node/
  facção → nomes) + estado armada/desarmada; `oraculoSync.reindexarAutomacao`; ganchos em
  `automacaoController` (criar/deletar/toggle); Big Bang inclui `world_triggers`. Destrava perguntas tipo
  "o que acontece quando o evento X disparar?".
- **Re-indexação de frescura (✅ feito, Regra 4.2):** `services/oraculoSync.js` — módulo central (DRY)
  que combina describer + conector, fire-and-forget, **nunca lança**: `reindexarNode(c,id,tipo?)`
  (resolve o tipo se omitido — evita doc duplicado), `reindexarNucleo`, `reindexarEvento`,
  `reindexarNucleosDaCronica`, `removerEntidade`. Os 5 ganchos antigos foram **refatorados** para ele.
  **Novos ganchos:** `atualizarNucleoNode` (node + núcleo antigo/novo), flags (`criar/atualizar/
  renomear/deletarFlag` → node; atualizar/deletar também re-indexam os **eventos** cuja tensão muda),
  núcleo-entidade (`criar/renomear` → `reindexarNucleo`; `excluir` → `removerEntidade` do `nucleo:id`),
  sinapses (`criar/deletar/atualizarLink` → **ambos** os nós; `deletarLink` ganhou os 2 ids no RETURNING),
  diplomacia (`salvarDiplomacia` → todas as facções, por ser bulk-replace). **Débito menor restante:**
  renomear/excluir facção não re-indexa os membros (texto deles guarda o nome antigo) — sanado no próximo
  Big Bang.
- **F5 — Interface (✅ feito):**
  - ✅ **Aba "Oráculo"** no `controle_mundo` (chat): `public/js/api/oraculoApi.js`
    (`consultar`/`toggle`/`salvarChave`), aba + painel central, bolhas Narrador/Oráculo, loading,
    `escapeHTML` na resposta (Regra 6.1), classes `.oraculo-*` só com tokens. Decisão do Narrador:
    aba dedicada (NÃO chat sobre o board).
  - ✅ **Toggle backend** `PUT /cronicas/:cronicaId/oraculo` (liga/desliga `oraculo_ativo`, só Narrador).
    Validação **Zod + middleware** (`validators/cronicasValidators.js` → `toggleOraculoSchema`: params
    `cronicaId` UUID + body `ativo` booleano), saldando o desvio da Regra 3.1.
  - ✅ **Switch opt-in na UI** (cabeçalho da aba Oráculo): `.oraculo-switch` + `alternarOraculo()`
    (otimista c/ reversão), lê o estado de graça em `verificarAcesso` (o `SELECT *` da crônica já
    traz `oraculo_ativo`); desligado **esmaece + bloqueia** o chat (`.oraculo-painel--off`, inputs
    `disabled`) — reforça o critério de ouro (opcional).
  - ✅ **Form BYOK no `config_perfil.html`** (`salvarOraculo()` → `OraculoApi.salvarChave`): card
    chave/URL/modelo, prefill de URL/modelo do `GET /perfil`, estado "chave definida" (write-only —
    a chave nunca volta). **Corretude:** o front **omite** `gen_key` em branco (Zod rejeita vazia +
    COALESCE preserva a atual).

### Como continuar (próximos passos, em ordem)
1. ✅ **Memória de conversa (multi-turn) — FEITO (sessão 27/jun):** `/consultar` agora recebe `historico`;
   front guarda ~4 trocas, Zod com teto 8, Python monta `messages=[system(grounding), ...histórico, user]`
   e embeda `últimaPergunta+atual` no retrieval. Detalhe na "Retomada rápida" no topo do §9.
2. ✅ **Automações — FEITO (sem chunking):** premissa do §4.4/5 corrigida contra o código real —
   `world_triggers` é **regra curta** (condição `evento_id` → efeito `tipo_nome`+`parametros`), não texto
   longo → **vetor único** (`automacao:id`, `upsert`), não `upsert_chunks`. Implementado:
   `oraculoTexto.textoDaAutomacao` (traduz o efeito p/ linguagem natural — `criar_flag`/`alterar_flag`/
   `postar_em_aba`/`criar_evento`/`criar_entidade` — e resolve UUID→nome de evento-gatilho, node-alvo e
   facção, escopado por `cronica_id`); `oraculoSync.reindexarAutomacao`; ganchos em `automacaoController`
   (criar → reindex do novo id, extraído defensivo do retorno da fn do banco; deletar → `removerEntidade`;
   toggle armada/desarmada → reindex, pois o estado faz parte do texto, Regra 4.2); automações entram no
   Big Bang. Ganchos imunes a IDOR (describer binda `id=$1 AND cronica_id=$2`).
3. **Não vazar rótulo técnico:** instruir o `montar_system` a não exibir o `tipo` cru (ex.: "(cenario)").
4. **Cosméticos no `app.py`:** silenciar a telemetria do ChromaDB (passar `settings=` no
   `PersistentClient` — a linha 31 atual é objeto solto, no-op) e o warning do Pydantic
   (`model_config['protected_namespaces'] = ()` no `ConsultaRequest`, por causa do campo `model_llm`).
5. **(Opcional) Re-indexar membros ao renomear/excluir facção** — hoje sanado pelo Big Bang.

> ⚠️ **Achado de segurança FORA do escopo Oráculo (Regra 3.3.1 — anti-IDOR):** `sessaoController.editarSessao`
> e `deletarSessao` usam `WHERE id = $1` **sem `cronica_id`** — um narrador pode editar/apagar sessão de
> outra crônica adivinhando o id (o middleware só garante acesso à crônica da URL). Corrigir amarrando
> `id = $1 AND cronica_id = $2` no WHERE. (Os ganchos do Oráculo já são imunes: o describer binda
> `cronica_id`, então não mis-indexam cross-tenant.) A rota irmã `PUT /:cronicaId/status` segue validando
> `status` inline (desvio Zod menor) — ambos fora do escopo Oráculo, mas registrados.

### Mapa de arquivos (implementação)
- Python: `oraculo_service/app.py`
- Node rede/serviços: `services/oraculoClient.js`, `services/oraculoTexto.js`, `services/oraculoSync.js`
  (re-indexação Regra 4.2), `utils/oraculoCripto.js`
- Node rotas: `routes/mundoRoutes.js` (sincronizar/consultar), `routes/cronicasRoutes.js` (toggle),
  `routes/perfilRoutes.js` (BYOK write-only)
- Node controller/validators: `controllers/mundoController.js`, `controllers/sessaoController.js`
  (ganchos de sessão), `controllers/automacaoController.js` (ganchos de automação),
  `validators/mundoValidator.js` (sincronizar/consultar), `validators/perfilValidators.js`,
  `validators/cronicasValidators.js` (toggle)
- Front: `public/controle_mundo.html` (aba + switch), `public/js/controle_mundo.js`
  (`consultarOraculo`/`alternarOraculo`/`refletirEstadoOraculo`), `public/config_perfil.html`
  (card BYOK + `salvarOraculo`), `public/js/api/oraculoApi.js`, `public/css/global_ui.css` (`.oraculo-*`)
