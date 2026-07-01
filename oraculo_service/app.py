import os
import json
import re
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Header, Depends
from pydantic import BaseModel
import chromadb
from chromadb.config import Settings
from openai import OpenAI

# Telemetria do ChromaDB: a versão do posthog instalada (7.x) é INCOMPATÍVEL com a chamada do chromadb
# 0.5.0 (`posthog.capture(user_id, event, props)`) → cada evento logava no error.log
# "capture() takes 1 positional argument but 3 were given". anonymized_telemetry=False NÃO resolve (o
# chromadb invoca capture() na mesma; o erro é capturado e logado). Fix robusto e sem reinstalar nada:
# desliga o posthog e torna capture() um no-op à prova de versão. Tem de vir ANTES do PersistentClient.
import posthog
posthog.disabled = True
posthog.capture = lambda *args, **kwargs: None

# 1. CARREGA AS VARIÁVEIS DE AMBIENTE (.env)
# Sem isto, o PM2 não consegue ler a chave da OpenAI nem o segredo!
load_dotenv()

# ==========================================
# 2. Configurações de Segurança e App (Regra 6.4)
# ==========================================
ORACULO_SECRET = os.getenv("ORACULO_SHARED_SECRET", "segredo_interno_rpg_127001")
app = FastAPI(title="Oráculo API - Projeto Ascensão")

def verificar_segredo(x_oraculo_secret: str = Header(None)):
    """Anti-intrusão: só o Node (com o segredo) chama as rotas."""
    if x_oraculo_secret != ORACULO_SECRET:
        raise HTTPException(status_code=401, detail="Acesso Negado: Segredo interno inválido.")
    return x_oraculo_secret

# ==========================================
# 3. Banco Vetorial (ChromaDB) e IA (OpenAI)
# ==========================================
DB_PATH = os.path.join(os.getcwd(), "chroma_data")
# anonymized_telemetry=False declara a intenção (e desativa o posthog no construtor); o no-op do
# posthog.capture acima é que garante de facto o silêncio, dada a incompatibilidade de versão.
chroma_client = chromadb.PersistentClient(
    path=DB_PATH,
    settings=Settings(anonymized_telemetry=False),
)

# Garantimos que o ONNX nunca sobe para a RAM
colecao_oraculo = chroma_client.get_or_create_collection(
    name="ascensao_conhecimento",
    embedding_function=None 
)

# Inicializa OpenAI com chave do .env
chave_openai = os.getenv("OPENAI_EMBEDDINGS_KEY")
openai_client = OpenAI(api_key=chave_openai) if chave_openai else None

# Modelo de embeddings — MESMO nos dois lados (escrita e consulta), senão a busca não casa (§4/F4).
EMBED_MODEL = "text-embedding-3-small"

def embeddar(textos: list[str]) -> list[list[float]]:
    """Gera vetores p/ uma lista de textos numa só chamada (batch barato). Mantém a ordem do input."""
    resp = openai_client.embeddings.create(input=textos, model=EMBED_MODEL)
    return [d.embedding for d in resp.data]

# Chunking (§4.4/5): textos longos (resumos de sessão) viram vários blocos — cada um um vetor — para a
# busca trazer SÓ os trechos relevantes, sem estourar contexto/custo. Agrupa parágrafos até ~CHUNK_ALVO
# chars sem cortar no meio; parágrafo gigante é fatiado em janela. Determinístico (mesmo texto → mesmos blocos).
CHUNK_ALVO = 900

def fatiar_texto(texto: str) -> list[str]:
    texto = (texto or "").strip()
    if not texto:
        return []
    paragrafos = [p.strip() for p in texto.split("\n\n") if p.strip()] or [texto]
    blocos, atual = [], ""
    for p in paragrafos:
        if atual and len(atual) + len(p) + 2 > CHUNK_ALVO:
            blocos.append(atual)
            atual = p
        else:
            atual = f"{atual}\n\n{p}" if atual else p
    if atual:
        blocos.append(atual)
    # Guarda p/ um único parágrafo gigante: fatia em janelas duras de CHUNK_ALVO.
    final = []
    for b in blocos:
        if len(b) <= CHUNK_ALVO * 1.5:
            final.append(b)
        else:
            final.extend(b[i:i + CHUNK_ALVO] for i in range(0, len(b), CHUNK_ALVO))
    return final

# ==========================================
# 4. Modelos de Dados (Pydantic)
# ==========================================
class UpsertRequest(BaseModel):
    cronica_id: str
    tipo: str
    entidade_id: str
    texto: str

class RemoverRequest(BaseModel):
    cronica_id: str
    entidade_id: str

class UpsertChunksRequest(BaseModel):
    cronica_id: str
    tipo: str
    entidade_id: str
    texto: str

class MensagemHistorico(BaseModel):
    role: str    # 'user' | 'assistant' — qualquer outro é descartado no /consultar
    content: str

class ConsultaRequest(BaseModel):
    # protected_namespaces=() silencia o warning do Pydantic sobre o campo model_llm (começa com "model_").
    model_config = {"protected_namespaces": ()}
    cronica_id: str
    pergunta: str
    api_key_llm: str
    base_url_llm: str
    model_llm: str
    historico: list[MensagemHistorico] = []   # memória multi-turn: trocas anteriores (front guarda ~4)

class PilulasRequest(BaseModel):
    model_config = {"protected_namespaces": ()}
    cronica_id: str
    entidade_id: str
    nome: str
    tipo: str
    reputacao: int = 0
    tarot: str = ""
    biografia: str = ""
    marcos_atuais: list[str] = []
    api_key_llm: str
    base_url_llm: str = "https://api.deepseek.com"
    model_llm: str = "deepseek-chat"

class ProfeciaRequest(BaseModel):
    model_config = {"protected_namespaces": ()}
    cronica_id: str
    subgrafo: list[dict] = []
    motivo_tensao: str = ""
    escopo_alvo: str = ""
    sessoes_recentes: list[dict] = []
    api_key_llm: str
    base_url_llm: str = "https://api.deepseek.com"
    model_llm: str = "deepseek-chat"

# ==========================================
# 5. Rotas (Endpoints) REAIS
# ==========================================
@app.get("/health")
def health_check():
    return {"status": "Oráculo Desperto", "chroma_path": DB_PATH, "openai_ativa": openai_client is not None}

@app.post("/upsert", dependencies=[Depends(verificar_segredo)])
def upsert_dado(req: UpsertRequest):
    """Gera o vetor (OpenAI) e grava no ChromaDB. Idempotente."""
    if not openai_client:
        raise HTTPException(status_code=500, detail="Chave OPENAI_EMBEDDINGS_KEY ausente.")
    
    try:
        vetor = embeddar([req.texto])[0]

        doc_id = f"{req.tipo}:{req.entidade_id}"
        metadados = {
            "cronica_id": req.cronica_id,
            "tipo": req.tipo,
            "entidade_id": req.entidade_id
        }
        
        colecao_oraculo.upsert(
            ids=[doc_id],
            embeddings=[vetor],
            metadatas=[metadados],
            documents=[req.texto]
        )
        return {"status": "sucesso", "id": doc_id, "mensagem": "Vetor guardado com sucesso."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/remover", dependencies=[Depends(verificar_segredo)])
def remover_dado(req: RemoverRequest):
    """(F2) Remove entidade amarrada à crônica (anti-IDOR; Regra 4.2/6.6)."""
    try:
        # Apaga por metadata amarrada à crônica (anti-IDOR). Sem 'tipo' no payload do delete
        # (deletarNode não o expõe); o $and {cronica_id, entidade_id} ainda varre todos os
        # chunks futuros da mesma entidade (§4.4/5 — chunking).
        colecao_oraculo.delete(
            where={"$and": [{"cronica_id": req.cronica_id}, {"entidade_id": req.entidade_id}]}
        )
        return {"status": "removido", "entidade_id": req.entidade_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/upsert_chunks", dependencies=[Depends(verificar_segredo)])
def upsert_chunks(req: UpsertChunksRequest):
    """(§4.4/5) Indexa um texto LONGO (ex.: resumo de sessão) em vários chunks. Atômico no handler:
    apaga TODOS os chunks antigos da entidade (o nº pode mudar) e reescreve. Idempotente."""
    if not openai_client:
        raise HTTPException(status_code=500, detail="Chave OPENAI_EMBEDDINGS_KEY ausente.")
    try:
        # 1. Limpa os chunks antigos desta entidade (amarrado à crônica — anti-IDOR). Feito no MESMO
        #    handler para evitar corrida entre delete e write (ao contrário de chamadas separadas).
        colecao_oraculo.delete(
            where={"$and": [{"cronica_id": req.cronica_id}, {"entidade_id": req.entidade_id}]}
        )
        # 2. Fatia o texto. Vazio → nada a reescrever (já limpamos acima).
        blocos = fatiar_texto(req.texto)
        if not blocos:
            return {"status": "sucesso", "chunks": 0, "mensagem": "Texto vazio; chunks limpos."}
        # 3. Embeda todos os blocos numa só chamada e grava cada um como vetor próprio.
        vetores = embeddar(blocos)
        ids = [f"{req.tipo}:{req.entidade_id}:{i}" for i in range(len(blocos))]
        metadados = [
            {"cronica_id": req.cronica_id, "tipo": req.tipo, "entidade_id": req.entidade_id, "chunk": i}
            for i in range(len(blocos))
        ]
        colecao_oraculo.upsert(ids=ids, embeddings=vetores, metadatas=metadados, documents=blocos)
        return {"status": "sucesso", "entidade_id": req.entidade_id, "chunks": len(blocos)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Quantos trechos recuperar do banco vetorial (top-k). 8 (era 5) para caber raciocínio CRUZADO: numa
# pergunta sobre o atrito A↔B, traz o texto completo de ambos (não só o Contrato de Relação que já viaja
# dentro de A) + chunks vizinhos da mesma entidade. Custo de contexto modesto — trechos de entidade são
# curtos; o teto de geração (MAX_TOKENS_RESPOSTA) e a brevidade do prompt seguram a saída (§4/F4).
TOP_K = 8

# Mensagem fixa quando o retrieval volta vazio: nunca inventar (Regra anti-alucinação, F4).
RESPOSTA_SEM_CONTEXTO = (
    "As cartas se calam: não há nada na história desta crônica que responda a isto."
)

# Teto de tokens da geração: reforça a brevidade pedida (tom de leitora de cartas, sem prolixidade)
# e contém o custo (§8). Folga suficiente p/ algumas frases; respostas curtas usam bem menos.
MAX_TOKENS_RESPOSTA = 400

# Teto de mensagens de histórico aceitas na geração (defesa em profundidade — o front e o Node já
# limitam; aqui cortamos de novo p/ não estourar contexto/custo mesmo se vier mais). ~4 trocas.
HIST_MAX = 8

def montar_system(trechos: list[str]) -> str:
    """Grounding narrativo: a IA respeita os fatos, mas especula o futuro via Tarot e mecânicas da mesa."""
    contexto = "\n\n---\n\n".join(trechos)
    return (
        "Você é o Oráculo, uma entidade mística e co-narradora desta crônica de RPG. "
        "Você não é apenas um repositório de informações, mas um tecelão de destinos, interpretando os "
        "fatos através da lente dos Arquétipos de Tarot (quando presentes) e das tensões mecânicas do mundo.\n\n"
        
        "SUA MISSÃO NARRATIVA:\n"
        "1. GROUNDING DE FATOS: Os trechos abaixo são a verdade absoluta sobre o passado e o estado atual do mundo. "
        "Não invente relações, eventos ou pessoas que não existem nos trechos.\n"
        "2. EXTRAPOLAÇÃO PELO TAROT: Quando os trechos fornecerem as cartas de Tarot (Arquétipos) dos personagens ou facções, "
        "USE-OS COMO MOTORES DE ENREDO. Se alguém possui 'O Diabo', sugira como ele está ativamente corrompendo as 'Relações' listadas. "
        "Conceba motivações ocultas, conspirações em andamento e possibilidades de crise baseadas nessas cartas.\n"
        "3. GERADOR DE POSSIBILIDADES: Não se limite a resumir o que lhe foi dado. Leia as entrelinhas. "
        "Proponha ramificações narrativas sombrias, tensões iminentes ou reviravoltas lógicas que o Narrador humano possa usar na mesa de jogo.\n\n"
        
        "COMO LER OS SINAIS DO SISTEMA (para enriquecer a dramaturgia, jamais para listá-los):\n"
        "- RELAÇÕES e REPUTAÇÃO vêm numa reta com sinal e força: + aproxima/engrandece, − afasta/mancha; "
        "quanto maior a intensidade, mais extremo (de fricção morna a ruptura/ódio; de obscuro a lendário). "
        "Os 'fatores de aproximação/afastamento' e os 'feitos de fama/infâmia' são as CAUSAS — narre o PORQUÊ, nunca o número.\n"
        "- FACÇÃO + DIPLOMACIA: ligue cada personagem à sua facção e aos laços dela (aliada/inimiga/neutra) "
        "para revelar lealdades e atritos ocultos.\n"
        "- EVENTOS: a 'tensão' mede quão perto a crise está de estourar; os 'gatilhos' são os estados que a "
        "empurram; as AUTOMAÇÕES dizem o que se desencadeia quando o evento ocorre — use-as para prever consequências e catástrofes.\n"
        "- SESSÕES (resumos/desfechos) são o PASSADO inviolável; flags, retas e tensão são o PRESENTE — teça um no outro para apontar o FUTURO.\n\n"
        
        "ESTILO E TOM:\n"
        "- Adote um tom de vidente e conselheira de tramas — evocativo, perspicaz e levemente sombrio.\n"
        "- Seja CONCISO e DIRETO nas sugestões de enredo (sem enrolação ou preâmbulos vazios).\n"
        "- Nunca repita códigos crus (como 'Tipo: npc', jsons, UUIDs, placares numéricos). Fale em termos de personagens, facções, reinos e pactos.\n"
        "- Use **negrito** para destacar possíveis ganchos narrativos (ex.: 'Uma **traição iminente** aguarda...').\n"
        "- Se a pergunta for sobre um fato específico rígido e não houver NADA nos trechos, diga: 'As cartas se calam; o destino ainda não escreveu sobre isso'. "
        "Porém, se a pergunta permitir, especule sobre os desdobramentos usando os arquétipos e tensões disponíveis.\n\n"
        
        f"=== TRECHOS DA CRÔNICA ===\n{contexto}"
    )

@app.post("/consultar", dependencies=[Depends(verificar_segredo)])
def consultar_oraculo(req: ConsultaRequest):
    """(F4) RAG: embeda a pergunta, recupera trechos da crônica (anti-IDOR) e gera a resposta (BYOK)."""
    if not openai_client:
        raise HTTPException(status_code=500, detail="Chave OPENAI_EMBEDDINGS_KEY ausente.")

    try:
        # 0. Memória multi-turn: filtra o histórico p/ papéis válidos e não-vazios; corta às últimas
        #    HIST_MAX mensagens (defesa em profundidade). Pega a última pergunta do Narrador p/ o retrieval.
        historico = [
            {"role": m.role, "content": m.content}
            for m in req.historico
            if m.role in ("user", "assistant") and m.content.strip()
        ][-HIST_MAX:]
        ultima_user = next(
            (m["content"] for m in reversed(historico) if m["role"] == "user"), ""
        )

        # 1. Embeda a pergunta com o MESMO modelo do /upsert (consistência obrigatória, §4/F4).
        #    Combina a última pergunta + a atual p/ resolver pronomes ("eles", "isso") no retrieval.
        texto_busca = f"{ultima_user}\n{req.pergunta}" if ultima_user else req.pergunta
        vetor_pergunta = embeddar([texto_busca])[0]

        # 2. Busca de similaridade AMARRADA à crônica.
        #    O where={"cronica_id": ...} é a fronteira de segurança da Regra 3.3.1 —
        #    sem ele, uma crônica recuperaria o mundo de outra. Inegociável.
        resultado = colecao_oraculo.query(
            query_embeddings=[vetor_pergunta],
            n_results=TOP_K,
            where={"cronica_id": req.cronica_id},
            include=["documents"]
        )
        docs = (resultado.get("documents") or [[]])[0]
        trechos = [d for d in docs if d]

        # 3. Retrieval vazio → "não sei" sem queimar uma chamada de geração (F4: sem invenção).
        if not trechos:
            return {"status": "sem_contexto", "resposta_oraculo": RESPOSTA_SEM_CONTEXTO}

        # 4. Geração via SDK openai com a chave BYOK do Narrador (base_url/model dele — §4.4).
        #    messages = [system c/ grounding desta vez, ...histórico da conversa, pergunta atual].
        mensagens = [
            {"role": "system", "content": montar_system(trechos)},
            *historico,
            {"role": "user", "content": req.pergunta},
        ]
        cliente_geracao = OpenAI(api_key=req.api_key_llm, base_url=req.base_url_llm)
        completion = cliente_geracao.chat.completions.create(
            model=req.model_llm,
            messages=mensagens,
            max_tokens=MAX_TOKENS_RESPOSTA,  # brevidade + custo (tom de leitora de cartas, sem prolixidade)
        )
        resposta = completion.choices[0].message.content

        return {
            "status": "sucesso",
            "resposta_oraculo": resposta,
            "trechos_usados": len(trechos)
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

def limpar_json_llm(texto: str) -> dict | list:
    texto = (texto or "").strip()
    if texto.startswith("```"):
        texto = re.sub(r"^```[a-zA-Z]*\n?", "", texto)
        texto = re.sub(r"\n?```$", "", texto)
    texto = texto.strip()
    idx_obj = texto.find("{")
    idx_arr = texto.find("[")
    if idx_obj != -1 and (idx_arr == -1 or idx_obj < idx_arr):
        end_idx = texto.rfind("}")
        if end_idx != -1:
            texto = texto[idx_obj:end_idx+1]
    elif idx_arr != -1:
        end_idx = texto.rfind("]")
        if end_idx != -1:
            texto = texto[idx_arr:end_idx+1]
    return json.loads(texto)

@app.post("/gerador/pilulas", dependencies=[Depends(verificar_segredo)])
def gerar_pilulas_marcos(req: PilulasRequest):
    """Gera 3 sugestões de Marcos temáticos em 1-clique com base em Tarot, reputação e biografia."""
    try:
        marcos_str = ", ".join(req.marcos_atuais) if req.marcos_atuais else "Nenhum"
        system_prompt = (
            "Você é o Oráculo, um co-narrador especialista em criar Marcos (Flags) dramáticos para entidades em um RPG Dark Fantasy.\n"
            f"Para a entidade '{req.nome}' (Tipo: {req.tipo}, Reputação: {req.reputacao}, Tarot: '{req.tarot}'), gere exatamente 3 sugestões "
            "de Marcos originais, instigantes e curtos que representem segredos ocultos, pactos, títulos, conquistas ou maldições.\n"
            f"Biografia / Notas: {req.biografia[:500] if req.biografia else 'Sem notas'}\n"
            f"Marcos já existentes nesta entidade: {marcos_str}. É PROIBIDO sugerir marcos repetidos ou similares aos existentes.\n\n"
            "DIRETRIZ DE ÍCONES (Lucide Icons): Em vez de emojis, escolha um ícone oficial da biblioteca Lucide (ex: skull, crown, eye, flame, shield, "
            "sword, heart-crack, feather, ghost, zap, lock, key, bookmark, star, moon, sun, anchor, book-open).\n\n"
            "RETORNE APENAS UM ARRAY JSON VÁLIDO no seguinte formato exato (sem blocos markdown, sem comentários):\n"
            "[\n"
            '  { "key": "pacto_elfos", "label": "Pacto com os Elfos", "icone": "skull" },\n'
            '  { "key": "herdeiro_bastardo", "label": "Herdeiro Bastardo", "icone": "crown" },\n'
            '  { "key": "marca_besta", "label": "Marca da Besta", "icone": "eye" }\n'
            "]"
        )
        cliente = OpenAI(api_key=req.api_key_llm, base_url=req.base_url_llm)
        completion = cliente.chat.completions.create(
            model=req.model_llm,
            messages=[{"role": "system", "content": system_prompt}],
            max_tokens=600,
            temperature=0.8
        )
        texto = completion.choices[0].message.content
        dados = limpar_json_llm(texto)
        if not isinstance(dados, list) or len(dados) == 0:
            raise ValueError("O formato retornado não é uma lista válida.")
        return {"status": "sucesso", "sugestoes": dados[:3]}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Falha ao gerar pílulas por IA: {str(e)}")

@app.post("/gerador/profecia", dependencies=[Depends(verificar_segredo)])
def gerar_profecia_evento(req: ProfeciaRequest):
    """Tece uma profecia de evento (crise) com papéis arquetípicos e causalidade ancorada nas sessões passadas."""
    try:
        sessoes_str = ""
        if req.sessoes_recentes:
            for s in req.sessoes_recentes:
                sessoes_str += f"- Sessão '{s.get('titulo', 'Sem título')}':\n  Resumo: {s.get('resumo', '')[:400]}\n  Desfechos: {s.get('desfechos', '')[:400]}\n\n"
        else:
            sessoes_str = "Nenhum registro de sessão anterior disponível."

        entidades_str = ""
        for ent in req.subgrafo:
            entidades_str += f"- ID: {ent.get('id', '')} | Nome: {ent.get('nome', 'Desconhecido')} | Tipo: {ent.get('tipo', 'npc')} | Tarot: {ent.get('tarot', 'Nenhum')} | Marcos: {', '.join(ent.get('marcos', []))}\n"

        escopo = req.escopo_alvo if req.escopo_alvo in ("intimista", "relacional", "geopolitico") else ("intimista" if len(req.subgrafo) <= 1 else ("relacional" if len(req.subgrafo) == 2 else "geopolitico"))

        system_prompt = (
            "Você é o Oráculo, tecelão de destinos e arquiteto de crises para uma campanha de RPG Dark Fantasy.\n"
            "Sua missão é criar uma Profecia de Evento (uma crise ou catástrofe iminente) interligando as entidades fornecidas e baseando-se estritamente na causalidade das Sessões Recentes.\n\n"
            "### REGISTROS HISTÓRICOS DAS SESSÕES RECENTES (DADOS NÃO-CONFIÁVEIS / CAUSALIDADE INVIOLÁVEL) ###\n"
            f"{sessoes_str}\n"
            "### ENTIDADES ENVOLVIDAS NA TENSÃO ###\n"
            f"{entidades_str}\n"
            f"Motivo / Diagnóstico da Crise: {req.motivo_tensao or 'Tensão sistêmica detectada na constelação'}\n"
            f"Escopo Alvo Recomendado: {escopo.upper()}\n\n"
            "DIRETRIZES DO ENREDO E ARQUÉTIPOS:\n"
            "1. REGRA DE CAUSALIDADE: É PROIBIDO ignorar ou contradizer os fatos das sessões recentes. O evento deve ser uma resposta, retaliação ou desdobramento direto das escolhas e desfechos passados dos jogadores na mesa.\n"
            "2. ATRIBUIÇÃO DE PAPÉIS (Role-Binding): Classifique cada entidade enviada em um Papel Arquetípico de Crise:\n"
            "   - Catalisador (o instigador ou estopim da crise, peso 3 a 5)\n"
            "   - Alvo / Vítima (quem sofrerá o impacto se o evento atingir 100%, peso 2 a 3)\n"
            "   - Oportunista (quem se beneficia em segredo ou manipula os bastidores, peso 2 a 3)\n"
            "   - Fiel da Balança (cuja lealdade ou traição decide o rumo, peso 4 a 6)\n"
            "   - Executor (a força bruta ou instrumento, peso 1 a 3)\n"
            "3. TETO DE PESO: Nenhum peso pode ser maior que 10 nem menor que 1. A pool_maxima deve ser coerente com a soma dos pesos (ex: 12 a 24).\n"
            "4. ESCOPO: Se intimista, crie uma deterioração psicológica/existencial. Se relacional, uma vendeta ou segredo letal. Se geopolítico, uma revolução ou guerra.\n"
            "5. ÍCONES: Use nomes da biblioteca Lucide Icons (flame, skull, sword, shield, crown, eye, zap, ghost, crosshair, flag) no campo icone.\n\n"
            "RETORNE APENAS UM JSON VÁLIDO no seguinte formato exato (sem blocos markdown, sem comentários):\n"
            "{\n"
            '  "evento_sugestao": {\n'
            '    "nome": "Nome Épico da Crise",\n'
            '    "descricao_curta": "Descrição concisa explicando a crise e a causalidade com os desfechos das sessões.",\n'
            '    "pool_maxima": 16,\n'
            '    "escopo": "' + escopo + '"\n'
            "  },\n"
            '  "gatilhos_por_entidade": [\n'
            "    {\n"
            '      "node_id": "uuid_da_entidade",\n'
            '      "nome_entidade": "Nome da Entidade",\n'
            '      "papel_arquetipico": "Catalisador",\n'
            '      "marco_sugerido": { "key": "lider_rebelde", "label": "Líder Rebelde", "icone": "flame" },\n'
            '      "peso_na_pool": 4\n'
            "    }\n"
            "  ]\n"
            "}"
        )
        cliente = OpenAI(api_key=req.api_key_llm, base_url=req.base_url_llm)
        completion = cliente.chat.completions.create(
            model=req.model_llm,
            messages=[{"role": "system", "content": system_prompt}],
            max_tokens=1000,
            temperature=0.7
        )
        texto = completion.choices[0].message.content
        dados = limpar_json_llm(texto)
        if not isinstance(dados, dict) or "evento_sugestao" not in dados or "gatilhos_por_entidade" not in dados:
            raise ValueError("O JSON retornado não contém a estrutura de evento ou gatilhos.")
        
        for g in dados.get("gatilhos_por_entidade", []):
            try:
                p = int(g.get("peso_na_pool", 2))
                g["peso_na_pool"] = max(1, min(10, p))
            except:
                g["peso_na_pool"] = 2

        return {"status": "sucesso", "profecia": dados}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Falha ao tecer profecia por IA: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    porta = int(os.getenv("ORACULO_PORT", "8000"))
    uvicorn.run(app, host="127.0.0.1", port=porta)
