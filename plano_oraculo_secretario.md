# Base de Operação: Oráculo Secretário (Extração Automática)

## 🎯 O Objetivo
Transformar anotações cruas (bullet points, frases soltas ou transcrições rápidas) feitas durante ou logo após a sessão de RPG em um **Diário de Campanha estruturado, atmosférico e já linkado** às entidades (NPCs, Locais, Facções) do banco de dados, utilizando a IA.

## 📐 Arquitetura da Solução (O Fluxo)

A ideia é que o processo seja mágico para o usuário, mas extremamente previsível e estruturado para o código.

### 1. Interface (Frontend)
No `modal-sessao` da aba de Sessões:
- Adicionaremos um botão brilhante `[✨ Estruturar com o Oráculo]` logo acima ou ao lado do campo de "Resumo".
- **Ação:** Quando o Mestre cola suas anotações ruins no "Resumo" e clica no botão, a interface entra em modo de carregamento (spinner).
- **Resultado:** O texto ruim é substituído por uma prosa rica e dividida em parágrafos. Além disso, as Entidades e Facções que a IA reconheceu no texto são **adicionadas automaticamente** na lista de "Vínculos Narrativos".

### 2. A Ponte (Backend Node.js)
Precisamos de uma nova rota (ex: `POST /api/sessoes/estruturar`).
- O Node.js recebe o texto cru do Frontend.
- **O Truque de Mestre:** Antes de mandar para a IA, o Node faz um `SELECT id, nome, tipo FROM world_nodes` e `entidade_nucleos` daquela crônica. 
- Ele monta um "Dicionário de Entidades Conhecidas" e envia isso junto com o texto cru para o serviço Python.

### 3. O Cérebro (Serviço Python FastAPI)
Criaremos um novo endpoint no `app.py` (ex: `POST /estruturar_resumo`).
- **O Prompt de Sistema:** Vai orientar o LLM a agir como um escrivão. Ele deve transformar as notas num texto coeso. E o mais importante: ele vai receber a lista de nomes que o Node mandou e deve identificar quem participou.
- **Output Estruturado (JSON Mode):** Para que o Frontend consiga "ticar" as entidades sozinhas, não podemos receber apenas um texto da IA. Pediremos para ela retornar um JSON estrito:
  ```json
  {
    "texto_formatado": "Naquela noite chuvosa, a **Guarda Real** encontrou...",
    "ids_detectados": ["uuid-da-guarda-real", "uuid-do-npc-x"]
  }
  ```

### 4. O Retorno Mágico
- O Python devolve o JSON pro Node.
- O Node devolve pro Frontend.
- O Frontend substitui o `textarea` do resumo com o `texto_formatado`.
- O Frontend pega o array `ids_detectados` e injeta visualmente na lista de vínculos (o mesmo que aconteceria se o usuário tivesse selecionado um por um).

---

## 🛠️ Passo a Passo para Implementação (Brainstorm de Fatiamento)

Para não quebrar o que já existe, podemos atacar isso em 3 fatias pequenas:

### Fatia 1: O Backend (A Rota e o Prompt)
- Criar a rota no `oraculo_service/app.py` configurada para usar `response_format={ "type": "json_object" }` (se usarmos OpenAI) para garantir a estrutura do retorno.
- Escrever o Prompt do Escrivão.

### Fatia 2: O Conector Node.js
- Criar a rota no Express (`routes/sessoesRoutes.js` ou `oraculoRoutes.js`).
- Fazer o Node buscar as entidades da crônica e enviar o payload pro Python.

### Fatia 3: O Frontend (UI e Reatividade)
- Criar o botão `[✨ Estruturar com o Oráculo]` na UI (`controle_mundo.html`).
- Criar a função JavaScript (`controle_mundo.js`) que envia a requisição, mostra o loading, e atualiza o DOM quando a resposta chegar (preenchendo o texto e adicionando as *tags* visuais dos vínculos).

---

## ❓ Questões Abertas para Refinamento
1. **O Tom do Resumo:** Você prefere que a IA reescreva as anotações num tom neutro e objetivo (tipo ata de reunião) ou num tom literário/romanceado?
2. **Auto-Criação:** Se o mestre citar nas anotações o nome de um NPC novo ("O grupo encontrou o ferreiro **Thorek**"), você acha que a IA deve apenas ignorar por não estar no banco de dados, ou seria legal ela sugerir no JSON: `"entidades_novas": ["Thorek"]` para o sistema criar as bolinhas automaticamente no tabuleiro?
