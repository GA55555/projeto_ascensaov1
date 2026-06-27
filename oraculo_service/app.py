import os
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

# Quantos trechos recuperar do banco vetorial (top-k). Cobre múltiplos
# chunks da mesma entidade sem estourar o contexto/custo de tokens (§4/F4).
TOP_K = 5

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
    """Grounding anti-alucinação como mensagem de SISTEMA: a IA responde SÓ com base nos trechos
    recuperados desta vez + no histórico da conversa (§4/F4). Os trechos mudam a cada turno."""
    contexto = "\n\n---\n\n".join(trechos)
    return (
        "Você é o Oráculo: uma vidente que lê o destino desta crônica de RPG como quem vira cartas. "
        "Adote um tom LEVEMENTE místico de leitora de cartas — evocativo, mas SÓBRIO e DIRETO.\n"
        "Seja CONCISO: responda em poucas frases, sem preâmbulo, sem repetir a pergunta, sem enrolação. "
        "No máximo uma pitada de mística (uma metáfora breve de carta/véu/destino) — nunca floreio longo.\n"
        "Responda baseando-se ÚNICA E EXCLUSIVAMENTE nos trechos abaixo e no histórico desta conversa. "
        "Se a resposta não estiver nos trechos, diga — no mesmo tom — que as cartas se calam; nunca invente.\n"
        "Os trechos refletem o estado ATUAL do mundo, que pode ter mudado desde mensagens anteriores. "
        "Se o histórico contradisser os trechos, os TRECHOS PREVALECEM (o destino se reescreveu).\n"
        "Os trechos são fichas internas, com rótulos e códigos técnicos (ex.: 'Tipo: npc', 'cenario', "
        "'faccao', 'flags', 'Estado (flags)', nomes de campos e ids). NUNCA repita esses rótulos ou "
        "códigos crus — traduza-os para termos do mundo (personagem, facção, cenário/local, estado…).\n"
        "Pode usar **negrito** para nomes/destaques; evite listas e títulos longos (a resposta é curta). "
        "Sem tabelas nem blocos de código.\n\n"
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

if __name__ == "__main__":
    import uvicorn
    porta = int(os.getenv("ORACULO_PORT", "8000"))
    uvicorn.run(app, host="127.0.0.1", port=porta)
