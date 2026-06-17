# 📜 Contrato Arquitetural & Diretrizes de Desenvolvimento - Projeto Ascensão V1

**Versão:** 1.0
**Contexto:** Plataforma Virtual Tabletop (VTT) e Gerenciador de Campanhas de RPG.
**Objetivo deste Documento:** Alinhar agentes de IA e desenvolvedores humanos sobre a stack, regras de negócio, padrões de segurança e design de código. **Qualquer desvio destas regras requer autorização explícita.**

---

## 🛠️ 1. Stack Tecnológica Base

### 🖥️ Frontend (Client-Side)
- **Linguagem:** Vanilla JavaScript (ES6+), HTML5 Semântico, CSS3 (CSS Variables para Theming/Dark Mode).
- **Proibições:** **É ESTRITAMENTE PROIBIDO** o uso de frameworks/libs como React, Vue, Angular, jQuery, TailwindCSS ou Bootstrap. 
- **Bibliotecas Permitidas:** `GridStack.js` (apenas para o layout dinâmico do Escudo).
- **Arquitetura de UI:** Modular, baseada em injeção dinâmica e componentes renderizados via Template Strings no JS.

### ⚙️ Backend (Server-Side)
- **Ambiente:** Node.js com Express.js.
- **Banco de Dados:** PostgreSQL (Queries nativas via `pg` ou query builders autorizados).
- **Validação de Dados:** `Zod` (Estritamente implementado na camada de middlewares antes dos controllers).
- **Autenticação:** JSON Web Tokens (JWT) trafegados **exclusivamente via cookie HttpOnly** (`m20_token`, `SameSite=strict`, `Secure` em produção), escolhido para mitigar roubo de token por XSS. O middleware `auth.js` confia única e exclusivamente no cookie — **não há fallback de header `Authorization: Bearer`**.

---

## 📐 2. Arquitetura do Frontend (O "Escudo do Narrador")

A tela principal do sistema (`escudo_narrador.html`) é uma Single Page Application (SPA) complexa. Sua performance e preservação de estado são vitais.

### Regra 2.1: Manipulação de DOM e "Teletransporte"
- **Nunca destrua elementos em uso:** Ao mover módulos (caixas) entre o Grid Principal e a Gaveta Mestra (Compêndio), utilize **manipulação de nós físicos** (`appendChild`). 
- **Proibido `innerHTML` para mover layouts:** Nunca utilize `innerHTML` ou `outerHTML` para recriar blocos do grid. Isso destrói os Event Listeners (como listeners de input range e sliders de HP) e causa vazamento de memória (Memory Leaks).
- **GridStack APIs:** Use `gridStackInstance.removeWidget(el, false)` para soltar um elemento do grid sem apagá-lo do DOM, e `gridStackInstance.makeWidget(el)` para readotá-lo.

### Regra 2.2: O "Core" Intocável
- O **Grid de Combate (`gs-id="bloco-combate"`)** e a mecânica de Iniciativa são o coração do VTT. Eles são protegidos pela rotina de Auto-Limpeza e nunca devem ser enviados para a gaveta no carregamento inicial da página.

### Regra 2.3: UX/UI e Acessibilidade
- **Botões Descritivos:** A interface deve priorizar clareza em cenários de alta carga cognitiva. Use botões com texto explícito e ícones combinados em vez de ícones isolados que exigem *hover* para entender a função.
- **Lazy Loading:** Dados pesados (Lore, NPCs, Locais) só devem ser "fetcheados" do backend quando suas respectivas abas ou modais forem abertos.
- **Sistema de Ícones — Lucide Icons (ERRO ARQUITETURAL):** O uso de Emojis Unicode (ex: ⚔️, ⚠️, 📔, 🌩️, ⚡) em qualquer ponto da interface — HTML estático, Template Strings JavaScript ou comentários visíveis — é um **ERRO ARQUITETURAL GRAVE** e resultará em **rejeição imediata do código**. A renderização de Emojis é não-determinística entre sistemas operacionais e navegadores, violando a consistência visual do Design System. A única solução aprovada é a biblioteca **Lucide Icons**: use `<i data-lucide="nome-do-icone"></i>` para HTML estático e a mesma tag dentro de Template Strings no JS. Após qualquer injeção dinâmica de `innerHTML` que contenha ícones Lucide, a chamada `lucide.createIcons()` é **obrigatória**; omiti-la deixará o ícone como texto bruto invisível.

### Regra 2.4: Segregação de Camada de Rede (API)
- **Sem Fetch no HTML:** A lógica de requisições HTTP não deve ficar misturada com a manipulação de tela. O consumo de rotas deve ser isolado em arquivos na pasta `public/js/api/` (ex: `api.js`, `mundoApi.js`), organizados em classes ou objetos modulares.

### Regra 2.5: Coesão Visual, Geometria e Design System Imperativo
O VTT possui uma identidade visual estrita baseada em jogos de RPG modernos e interfaces premium. Qualquer desvio das regras abaixo resultará em rejeição do código:
- **Tipografia (Font Pairing):** Títulos (`h1` a `h6`) devem usar exclusivamente a fonte serifada `'Cormorant Garamond'`. Textos base, inputs e modais (UI) devem usar `'Manrope'`. Valores numéricos importantes ou trechos técnicos devem usar `'Fira Code'`.
- **Glassmorphism e Sombras em Camadas:** O efeito de profundidade é criado através de variáveis globais CSS (ex: `--bg-card-glass`). É obrigatório o uso de `backdrop-filter: blur()` nas caixas flutuantes e painéis modais, combinados com `box-shadow` em camadas difusas. Efeitos de borda dura (`solid border`) de alto contraste estão banidos.
- **Proibição de Estilos Inline:** O uso de atributos `style="..."` no HTML estático ou injetados via Template Strings no JavaScript é **ESTRITAMENTE PROIBIDO** para fins de estética (cores, fontes, paddings, borders). A estética DEVE ser delegada a classes utilitárias centralizadas no arquivo `public/css/global_ui.css` (ex: `.card`, `.item-interativo`, `.info-block-vazio`). Estilos inline só são permitidos para mecânicas de layout crítico e dinâmico (ex: larguras em porcentagem baseadas em dados, como a `barra-fill` de HP).
- **Micro-interações:** Toda interatividade (`hover`, `focus`, `active`) deve utilizar a variável CSS `--transicao-suave` para garantir a fluidez baseada na curva de aceleração (`cubic-bezier`). Transições secas sem animação estão vetadas.
- **Geometria Sóbria (Sharp Edges):** É imperativo o uso de formatos mais quadrados e rígidos. O arredondamento excessivo de bordas (`border-radius` acima de `4px` para botões/inputs ou acima de `8px` para cards) está **BANIDO**. A interface deve transparecer a organização e a sobriedade de um VTT Dark Fantasy.
- **Visibilidade e Molduras:** Ações secundárias NUNCA devem parecer textos soltos. Botões secundários DEVEM obrigatoriamente utilizar a classe `.btn-outline` ou `.btn-secondary` para garantir que a moldura (`border`) delimite a área de clique claramente.
- **Coesão Absoluta de Cores:** É **ESTRITAMENTE PROIBIDO** o uso de cores hardcoded (como `#ff0000`, `red`, `blue`) diretamente nos arquivos HTML ou JS. Todas as cores devem obrigatoriamente referenciar o escopo oficial em `global_ui.css` (ex: `var(--bg-principal)`, `var(--roxo-mago)`, `var(--erro)`). Nenhuma nova página pode divergir da paleta ou da estrutura base do projeto.

### Regra 2.6: Contraste de Estados Interativos e Acessibilidade
- **Prevenção de Camuflagem (Contrast Inversion):** É **ESTRITAMENTE PROIBIDO** programar transições de `:hover`, `:focus` ou `:active` onde a cor do background preenchido possua contraste insuficiente contra a cor da fonte. Se um botão vazado (`outline`/`ghost`) ganhar preenchimento sólido na interação, a propriedade `color` **DO TEXTO E DO ÍCONE DEVE** obrigatoriamente inverter para um tom de alto contraste geométrico (ex: `#ffffff` para fundos escuros ou cores fortes).
- **Herança Estrita de SVGs:** Os ícones vetorizados (Lucide) devem utilizar impreterivelmente `stroke: currentColor !important;` em seu CSS base. Transições de cor devem ocorrer no **contêiner pai**, forçando o ícone a rastrear e herdar passivamente as mudanças de `color`.

---

## 🛡️ 3. Arquitetura do Backend e Segurança

### Regra 3.1: Contratos e Validação (Zod)
- **Toda rota de Mutação (POST, PUT, PATCH, DELETE) DEVE ter um schema Zod.**
- Os schemas (localizados em `/validators/`) são a única fonte da verdade para o formato de entrada.
- **Middleware de Validação:** A validação ocorre em um middleware dedicado (ex: `validate.js`). Se o payload falhar, o controller sequer é instanciado. O middleware deve retornar `400 Bad Request` contendo o array estruturado de erros do Zod.

### Regra 3.2: O Padrão de Resposta ao Frontend
O Frontend espera uma resposta padronizada para exibir notificações (Toasts).
- **Sucesso (20x):** Retornar JSON com os dados consolidados.
- **Erro (4xx/5xx):** O Frontend (`escudo_narrador.js` ou `api.js`) DEVE interceptar o erro e exibir um alerta/toast claro informando o narrador sobre qual regra de negócio foi violada (ex: "HP Máximo não pode ser negativo").

### Regra 3.3: Autenticação e Escopo de Crônica
- Todas as rotas de sistema (Cronicas, Mundo, Monstros) são protegidas pelo middleware `auth.js`.
- O isolamento de dados é crítico: Um usuário só pode dar GET/POST em `nodes` ou `monstros` associados ao `cronica_id` sobre o qual ele tem direitos de Narrador. Valide a autoria no Controller.

---

## 🧩 4. Estrutura de Banco de Dados (PostgreSQL)

- **Normalização:** A engenharia de mundo (Lore) é desacoplada do Combate (Mecânica). 
  - Entidades do Mundo (`nodes`) possuem `id`, `nome`, `tipo` (npc, local), `nucleo_id` e um array/JSONB de `flags`.
  - Entidades de Combate (`monstros`) são representações efêmeras e táticas (com `hp_atual`, `iniciativa`).
- Se um NPC da lore entra em combate, uma cópia dos seus dados base deve instanciar um novo registro em `monstros` (Card de Combate), para não poluir a ficha da lore com danos temporários da batalha.

### Regra 4.1: Princípio do Menor Privilégio (DDL vs DML)
O utilizador do banco de dados configurado na aplicação Node.js (`.env`) **DEVE** possuir exclusivamente permissões **DML** (Data Manipulation Language: `SELECT`, `INSERT`, `UPDATE`, `DELETE`). É **ESTRITAMENTE PROIBIDO** que a aplicação execute instruções **DDL** (Data Definition Language: `CREATE TABLE`, `ALTER`, `DROP`). A criação e migração de esquemas é responsabilidade exclusiva do Administrador de Banco de Dados (DBA) via acesso manual e blindado.

### Regra 4.2: Resiliência de Estado e Dados Corrompidos
Nunca confie cegamente nos dados retornados pelo próprio banco, especialmente em colunas JSON/JSONB de "Saves" antigos. O código que restaura estados (ex: layout do escudo ou lista de monstros) deve ser **defensivo**. Utilize `ON CONFLICT DO NOTHING` ou `DO UPDATE` para evitar `500 Internal Server Error` caso o banco contenha lixo residual de versões anteriores. O sistema deve falhar graciosamente e ignorar o dado corrompido, mantendo a sessão viva.

---

## 🤖 5. Diretrizes para Agentes IA (Claude, Gemini, Hermes)

Quando convocado para escrever, debugar ou refatorar código neste projeto:
1. **Verifique o Escopo:** Leia este arquivo e entenda em qual camada a tarefa reside.
2. **Task Slicing (Fatiamento):** Não entregue arquivos monolíticos de 1000 linhas. Refatore em módulos. Se for criar o "Diário de Sessões", primeiro faça a API (Node + Zod), valide, e só na próxima iteração injete o Javascript no Frontend.
3. **DRY (Don't Repeat Yourself):** Reutilize os middlewares, funções de `toast.js` e estilos CSS já existentes. Não crie uma nova classe CSS se uma variável global de `--borda` ou `--destaque` já atende à necessidade.
4. **Sem Destruição Colateral:** Use as APIs de diff ou garanta que os IDs e as marcações `gs-id` do GridStack permaneçam idênticos nas suas refatorações, sob pena de corromper os "Saves do Escudo" que residem no banco de dados.

---

## 🛡️ 6. Segurança e Prevenção de Ataques

### Regra 6.1: Prevenção de XSS (Cross-Site Scripting)
É **ESTRITAMENTE PROIBIDO** injetar variáveis diretas em templates usando `innerHTML` sem antes passar a variável pela função utilitária `escapeHTML(str)`. Sempre que gerar listagens baseadas no banco de dados, garanta a sanitização de tags HTML.

### Regra 6.2: Prevenção de SQL Injection
Todas as interações com o banco de dados PostgreSQL usando a biblioteca `pg` **DEVEM** utilizar Queries Parametrizadas (`$1`, `$2`). A concatenação de strings em instruções SQL resultará em rejeição imediata do código.

### Regra 6.3: Upload de Arquivos
Todo upload deve ser gerido pelo `multer`. É obrigatória a validação dupla: checagem de **Mimetype** da requisição **AND** checagem de **extensão real do arquivo**. Arquivos devem sempre ser renomeados para hashes unívocos (ex: `Date.now()`) no momento de salvamento.

### Regra 6.4: Defesa de Borda (Rate Limiting & Headers)
Toda instância do servidor Express **DEVE** utilizar `helmet` para ocultação de cabeçalhos sensíveis (ex: `X-Powered-By`) e proteção contra Clickjacking. Um limitador global (`express-rate-limit`) de **100 req/min por IP** deve ser aplicado após os middlewares de arquivos estáticos. A rota `POST /auth/login` possui limitador dedicado e mais restrito: **5 tentativas por IP a cada 15 minutos**, para mitigação de ataques de força bruta.
A política de **CORS** (Cross-Origin Resource Sharing) deve ser rigorosa, configurada com uma "Lista VIP" estática (`dominiosPermitidos`). O uso de wildcard (`*`) no `origin` do CORS é **terminantemente proibido**. A aplicação deve bloquear qualquer requisição proveniente de IPs/Domínios não reconhecidos na rede Tailscale ou domínios de produção oficiais.

### Regra 6.5: Otimização de Assets e Pipeline de Imagem
Imagens enviadas por upload **nunca** devem ser persistidas no disco no formato original. Todo arquivo recebido via `multer.memoryStorage()` deve ser processado pelo pipeline **Sharp** antes de ser gravado, aplicando obrigatoriamente:
- Conversão para **WebP** com qualidade 80 (`sharp().webp({ quality: 80 })`).
- Redimensionamento de segurança: `{ width: 1920, height: 1080, fit: 'inside', withoutEnlargement: true }`.

### Regra 6.6: Higiene de Disco e Ficheiros Órfãos
Qualquer operação de `DELETE` no banco de dados que envolva uma entidade associada a um ficheiro físico no servidor (Avatares, Capas e demais imagens) **DEVE** obrigatoriamente acionar a remoção física desse ficheiro do disco (usando `fs.unlink`). É inaceitável permitir o acúmulo de "ficheiros zumbis" que consomem o armazenamento do servidor ao longo do tempo.

> **Nota de escopo (Gaveta de Fichas):** A Gaveta deixou de armazenar PDFs físicos. As fichas são agora **nativas**, persistidas integralmente na coluna `gaveta_fichas.dados_ficha` (JSONB). Portanto a deleção de uma ficha **não** tem ficheiro físico associado e esta regra não se aplica a ela — basta o `DELETE` no banco (validado por `usuario_id`, ver Regra 3.3).

---

## 🧠 7. Paradigmas de Design & Engenharia

### Paradigma 4: Zero Framework Frontend & DOM Direto
O ecossistema visual opera inteiramente em Vanilla JavaScript. A adoção de frameworks pesados (React/Angular) é estritamente proibida para preservar a latência zero necessária no Escudo do Narrador. A manipulação de interface é baseada em injeção de templates literais controlados, higienizados e escutadores de eventos delegados.

### Paradigma 5: Design System Multi-Tema Baseado em Escopo
A personalização visual não requer duplicação de arquivos CSS. O sistema adota o paradigma de "Sobrescrita de Escopo" (Scope Override). Variáveis e redefinições geométricas de temas (ex: Modo Retrô 16-bits) são injetadas exclusivamente via classe na raiz do documento (`document.documentElement.classList`), isolando o impacto visual e permitindo troca dinâmica (FOUC-free) orientada ao perfil do usuário no banco de dados.