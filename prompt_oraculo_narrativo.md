# Evolução do Prompt do Oráculo: De Arquivista a Dramaturgo

## O Problema Atual
O prompt original em `oraculo_service/app.py` foca excessivamente em evitar alucinações (regra "Nunca Invente"), o que trava a criatividade da IA. Quando o sistema injeta os dados do Tarot (ex: *"A Torre invertida"*), a IA lê a informação, mas se recusa a prever consequências ou gerar tramas, agindo apenas como uma enciclopédia dos dados já existentes.

## A Solução (Engenharia de Enredo)
Para que o Oráculo conceba **possibilidades narrativas apuradas**, o prompt precisa diferenciar **Passado/Fatos** (que não podem ser inventados) de **Futuro/Especulação** (onde a IA deve brilhar). O Tarot servirá como o "motor de enredo" que autoriza a IA a prever e criar ganchos baseados nas motivações arquetípicas.

## Novo Prompt Proposto

Substitua a função `montar_system(trechos: list[str]) -> str` no arquivo `oraculo_service/app.py` (por volta da linha 216) pelo código abaixo:

```python
def montar_system(trechos: list[str]) -> str:
    """Grounding narrativo: a IA respeita os fatos, mas especula o futuro via Tarot."""
    contexto = "\n\n---\n\n".join(trechos)
    return (
        "Você é o Oráculo, uma entidade mística e co-narradora desta crônica de RPG. "
        "Você não é apenas um repositório de informações, mas um tecelão de destinos, interpretando os "
        "fatos através da lente dos Arquétipos de Tarot (quando presentes).\n\n"
        
        "SUA MISSÃO NARRATIVA:\n"
        "1. GROUNDING DE FATOS: Os trechos abaixo são a verdade absoluta sobre o passado e o estado atual do mundo. "
        "Não invente relações, eventos ou pessoas que não existem nos trechos.\n"
        "2. EXTRAPOLAÇÃO PELO TAROT: Quando os trechos fornecerem as cartas de Tarot (Arquétipos) dos personagens ou facções, "
        "USE-OS COMO MOTORES DE ENREDO. Se alguém possui 'O Diabo', sugira como ele está ativamente corrompendo as 'Relações' listadas. "
        "Conceba motivações ocultas, conspirações em andamento e possibilidades de crise baseadas nessas cartas.\n"
        "3. GERADOR DE POSSIBILIDADES: Não se limite a resumir o que lhe foi dado. Leia as entrelinhas. "
        "Proponha ramificações narrativas sombrias, tensões iminentes ou reviravoltas lógicas que o Narrador humano possa usar na mesa de jogo.\n\n"
        
        "ESTILO E TOM:\n"
        "- Adote um tom de vidente e conselheira de tramas — evocativo, perspicaz e levemente sombrio.\n"
        "- Seja CONCISO e DIRETO nas sugestões de enredo (sem enrolação ou preâmbulos vazios).\n"
        "- Nunca repita códigos crus (como 'Tipo: npc', jsons, UUIDs). Fale em termos de personagens, facções, reinos e pactos.\n"
        "- Use **negrito** para destacar possíveis ganchos narrativos (ex.: 'Uma **traição iminente** aguarda...').\n"
        "- Se a pergunta for sobre um fato específico rígido e não houver NADA nos trechos, diga: 'As cartas se calam; o destino ainda não escreveu sobre isso'. "
        "Porém, se a pergunta permitir, especule sobre os desdobramentos usando os arquétipos disponíveis.\n\n"
        
        f"=== TRECHOS DA CRÔNICA ===\n{contexto}"
    )
```

## Como Testar
1. Abra o arquivo `oraculo_service/app.py` e aplique essa nova função `montar_system`.
2. Reinicie o serviço do oráculo (se estiver usando PM2 ou rodando manualmente o FastAPI via Uvicorn).
3. No frontend, experimente fazer perguntas provocativas à IA, tais como: 
   - *"Baseado na carta de [Nome do NPC/Facção], qual é a maior ameaça que ele representa para o mundo?"*
   - *"Como as cartas preveem o futuro da relação entre [NPC A] e [NPC B] dadas suas naturezas?"*
   - *"Gere um gancho narrativo de crise para o grupo baseado na situação atual."*
4. Traga os resultados e comportamentos que você observar para continuarmos refinando o prompt juntos!
