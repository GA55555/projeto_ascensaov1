# Plano de Implementação — "Mundo Vivo"
## Refatoração da Aba Mundo → Tabuleiro Unificado

---

## Decisões do Narrador (consolidadas)

| Questão | Decisão |
|---|---|
| Unificação das abas | **Opção A — Absorção total.** A aba "Mundo" (grelha) desaparece como aba separada. O "Tabuleiro" se renomeia para "Mundo" e absorve as funções da grelha. A grelha clássica vira uma lente/toggle. |
| Auto-load do board | **Auto-selecionar o último board** usado. Na primeira vez (sem boards), criar automaticamente um "Board Principal". |
| Janela de entidades | **Overlay grande na frente da página** — igual ao comportamento atual da aba Mundo quando se filtra por núcleo. Não é colada ao tabuleiro, é um painel overlay (z-index alto, backdrop). |
| Feedback do long-press | **Anel de progresso circular** ao redor do cursor (SVG animado, estilo mobile). |

---

## Arquivos Afetados

### Modificados
| Arquivo | O que muda |
|---|---|
| controle_mundo.html | Remover aba "Mundo" e aba "Tabuleiro" separadas. O que era "Tabuleiro" vira a primeira aba (renomeada "Mundo"). Toolbar do board ganha botões herdados da grelha (+ Forjar Entidade, filtros). |
| controle_mundo.js | Long-press handler, auto-load de board, duplo clique → painel overlay, menu de contexto no núcleo, auto-inserção de entidade no board. |
| global_ui.css | Classes novas: `.longpress-ring`, `.painel-nucleo-overlay`, `.painel-nucleo-overlay__backdrop`, `.painel-nucleo-overlay__janela`, `.board-ctx-menu`. |

### Não modificados (backend intocado)
- `mundoController.js` — zero mudanças
- `mundoRoutes.js` — zero mudanças
- `mundoApi.js` — zero mudanças (todas as APIs necessárias já existem)
- Banco de dados — zero DDL nova

---

## O que já existe e será reaproveitado

| Componente | Localização | Como será reusado |
|---|---|---|
| Canvas infinito + pan/zoom | controle_mundo.js:3446-3489 | Base do Mundo Vivo — permanece intacto |
| Células de núcleo (render + arrasto) | controle_mundo.js:3547-3670 | Os núcleos no board já existem — long-press e duplo clique são novos handlers sobre o mesmo elemento |
| `cardMundoHTML()` | controle_mundo.js:448-476 | Reutilizado dentro do painel overlay de entidades |
| `marcoItemHTML()` | controle_mundo.js:480-495 | Reutilizado dentro dos cards do painel |
| `montarPopover()` + `posicionarPopover()` | controle_mundo.js:4641-4683 | Menu de contexto do long-press no núcleo |
| Modal de forja de entidade | controle_mundo.html:167-189 | Abre pelo painel overlay com `nucleo_id` pré-selecionado |
| `MundoApi` completa | mundoApi.js | CRUD de núcleos, nodes, flags, links, diplomacia, boards |
| Física de constelação | controle_mundo.js:3823-3894 | Permanece como lente — botão "Constelação" na toolbar |
| `renderBoard()` | controle_mundo.js:2891-2952 | Render principal — recebe hook para auto-inserir entidades |

---

## Detalhamento por Fatia

### Fatia 0 — Unificação das Abas + Auto-load

**Objetivo**: O tabuleiro se torna a aba "Mundo". Auto-carrega o último board.

#### Em `controle_mundo.html`:
- Remover o `<button>` da tab "Mundo" (grelha) e o `<div id="tab-mundo">` inteiro com sua toolbar e grid
- Renomear o botão da tab "Tabuleiro" (`abrirTab('macro')`) para "Mundo" com ícone `globe`
- Adicionar na toolbar do board:
  - Botão `+ Forjar Entidade` (herda do antigo tab-mundo)
  - Toggle de lente "Grelha" (abre o painel overlay mostrando **todas** as entidades, como a grelha clássica fazia)
- O `<div id="tab-macro">` muda seu `id` para `tab-mundo` (ou mantém `tab-macro` e muda apenas o mapeamento do `abrirTab`)

#### Em `controle_mundo.js`:
- `DOMContentLoaded`: chamar `carregarMesaGuerra()` automaticamente no init (não esperar click na aba)
- Nova função `autoLoadBoard()`:
  1. Chama `recarregarListaBoards()` 
  2. Se há boards, seleciona o primeiro (ou o último usado, via `localStorage`)
  3. Se não há nenhum, cria automaticamente um "Board Principal" via `MundoApi.criarBoard()`
  4. Chama `abrirBoard(boardId)`
- `abrirTab('mundo')` agora aponta para o tabuleiro (antes apontava para a grelha)
- Salvar `boardAtualId` em `localStorage` a cada `abrirBoard()` para persistir a seleção

#### Impacto:
- As funções `carregarMundo()`, `renderizarGridMundo()`, `renderizarMundo()` **permanecem no código** — serão reusadas no painel overlay (Fatia 2). Não são deletadas.
- O toggle de view ("Grelha" / "Direção de Cena") sai da aba removida mas reaparece como botão na toolbar do board

---

### Fatia 1 — Long-Press Handler + Anel de Progresso

**Objetivo**: Detectar long-press (400ms) no board, discriminando alvos, com feedback visual.

#### Em `controle_mundo.js`:
Nova função `ativarLongPress()`, chamada uma vez no init (junto com `ativarPanZoom()`):

```
Lógica:
1. pointerdown no #board-canvas:
   - Guarda timestamp, posição, alvo (vazio/célula/card)
   - Inicia timer de 400ms
   - Cria elemento SVG do anel de progresso na posição do cursor

2. pointermove:
   - Se moveu > 5px do ponto inicial → cancela o long-press (é pan)
   - Remove o anel

3. Timer dispara (400ms sem cancelar):
   - Remove o anel
   - Identifica o alvo:
     - Vazio → Fatia 2 (criar núcleo)
     - Célula → Fatia 4 (menu de contexto)
     - Card → Abre menu kebab existente

4. pointerup antes dos 400ms:
   - Cancela o timer
   - Remove o anel
   - NÃO dispara long-press (deixa o pan/click normal funcionar)
```

#### Em `global_ui.css`:
```css
/* Anel de progresso do long-press */
.longpress-ring { ... }
.longpress-ring circle { 
  /* animação de stroke-dashoffset 0→100% em 400ms */
  /* cor: var(--roxo-mago) */
  /* transição suave com cubic-bezier */
}
```

#### Conflito com pan/zoom:
O pan atual inicia no `pointerdown` do `#board-canvas` quando o alvo é o "fundo". O long-press também. Resolução:
- O long-press **atrasa** o início do pan em 400ms
- Se o ponteiro mover > 5px antes dos 400ms → cancela long-press, inicia pan normalmente
- Se os 400ms passarem sem movimento → cancela pan, dispara long-press
- Na prática: clicar e arrastar = pan (como antes). Clicar e segurar parado = long-press.

---

### Fatia 2 — Long-Press no Vazio → Criar Núcleo

**Objetivo**: Segurar o click no espaço vazio cria um núcleo diretamente no board.

#### Fluxo:
1. Long-press no vazio detectado → calcula coordenadas de mundo (`pointer ÷ zoom`)
2. Abre o modal de criação de núcleo existente (`modal-nucleos`)
   - Ou, mais rápido: prompt inline (nome + Enter)
3. Após criação no backend (`criarNucleo()`):
   - Cria a célula no `boardState.celulas` na posição do pointer
   - `renderBoard()` para mostrar a célula nova
   - Não salva automaticamente (Regra 2.7 — salvar é manual)

#### Código novo (~40 linhas):
- `criarNucleoNoBoard(x, y)` — wrapper que cria o núcleo + insere a célula

---

### Fatia 3 — Duplo Clique no Núcleo → Painel Overlay de Entidades

**Objetivo**: Duplo clique na célula abre um painel grande na frente da página com as entidades do núcleo.

#### Em `controle_mundo.js`:
Nova função `abrirPainelNucleo(nucleoId)`:

```
1. Cria div.painel-nucleo-overlay (backdrop + janela):
   - Backdrop semi-transparente (click fora → fecha)
   - Janela com:
     - Cabeçalho: nome do núcleo + botão X
     - Toolbar: busca + "Forjar Entidade" (nucleo_id pré-selecionado)
     - Corpo: cards gerados por cardMundoHTML() filtrados por nucleo_id
     
2. Os cards são os MESMOS da grelha clássica (marcos, kebab, sinapses)
3. Botão "Forjar Entidade":
   - Abre modal-forja com nucleo_id pré-selecionado
   - Ao salvar: fecha modal, re-renderiza o painel (add o card novo)
   
4. Fechar: X ou click no backdrop → remove o overlay do DOM
```

#### Em `global_ui.css` (~60 linhas):
```css
.painel-nucleo-overlay { /* backdrop fixo, z-index alto */ }
.painel-nucleo-overlay__janela { 
  /* card grande, centralizado, scrollável */
  /* glassmorphism (backdrop-filter, --bg-card-glass) */
  /* max-height: 80vh, overflow-y: auto */
}
```

#### Handler de duplo clique:
- Registrar `dblclick` nas `.board-celula` dentro de `ativarArrastoCelulas()`
- Discriminar do arrasto: o `dblclick` nativo do browser já faz isso (não conflita com pointerdown/move)

---

### Fatia 4 — Long-Press no Núcleo → Menu de Contexto

**Objetivo**: Segurar o click na célula abre um menu rápido com ações.

#### Menu de contexto (reutiliza `montarPopover`):
```
┌──────────────────┐
│ Editar Nome      │  → prompt() ou inline edit
│ Mudar Cor        │  → color picker (cores existentes do board)
│ Novo Elo         │  → modo seleção (click em outro núcleo)
│ Deletar          │  → confirmação → excluirNucleo()
└──────────────────┘
```

- "Novo Elo": ativa um modo onde o próximo click em outra célula cria uma relação diplomática (aliado/inimigo/neutro — submenu ou dropdown)
- Todas as ações usam APIs já existentes

---

### Fatia 5 — Polish e Integração

**Objetivo**: Micro-interações, auto-inserção, e validação completa.

#### Auto-inserção de entidade no board:
- Quando `salvarForja()` cria uma entidade com `nucleo_id`, e esse núcleo tem célula no board:
  - Insere automaticamente o card na `boardState.nodes` (posição dentro da célula)
  - `renderBoard()` para mostrar o card novo
  - Não precisa mais de "Importar Entidade"

#### Animações:
- Painel overlay: `opacity 0→1` + `transform: scale(0.95)→scale(1)` com `--transicao-suave`
- Anel de long-press: animação CSS `stroke-dashoffset` (preenchimento circular em 400ms)
- Menu de contexto: fade-in suave (já existe no popover)

#### Validação final:
- Auditoria de inline styles (Regra 2.5)
- Verificar `lucide.createIcons()` em toda injeção dinâmica
- Testar com zoom extremo (0.05 e 4.0)
- Testar fluxo completo: abrir → criar núcleo (long-press) → abrir entidades (duplo clique) → criar entidade → editar marcos → criar elo (long-press no núcleo)

---

## Riscos e Mitigações

| Risco | Probabilidade | Mitigação |
|---|---|---|
| Long-press conflita com pan (ambos no pointerdown do fundo) | Alta | Threshold de movimento (5px) + delay — movimento = pan, imóvel = long-press |
| Duplo clique conflita com arrasto de célula | Baixa | `dblclick` nativo não conflita — o browser distingue automaticamente |
| Cards da grelha dentro do overlay perdem listeners | Média | Os listeners são inline (`onclick=`) via template strings — sobrevivem ao `innerHTML`. Verificar handlers delegados. |
| `salvarForja()` não sabe que precisa inserir no board | Baixa | Hook no callback do salvar — verificar se o núcleo tem célula no board e inserir |
| Tabuleiro sem board pré-existente → tela vazia confusa | Média | Auto-criar "Board Principal" no primeiro acesso (Fatia 0) |

---

## Estimativa

| Fatia | Complexidade | Linhas novas (estimativa) |
|---|---|---|
| 0 — Unificação + auto-load | Média | ~80 linhas JS + ~20 HTML |
| 1 — Long-press + anel | Média-Alta | ~90 linhas JS + ~40 CSS |
| 2 — Criar núcleo no board | Baixa | ~40 linhas JS |
| 3 — Painel overlay | Média-Alta | ~120 linhas JS + ~60 CSS |
| 4 — Menu de contexto | Média | ~70 linhas JS + ~20 CSS |
| 5 — Polish | Baixa | ~60 linhas JS + ~30 CSS |
| **Total** | | **~460 JS + ~170 CSS** |

Nenhum arquivo novo é criado — tudo vai nos 3 arquivos existentes.
