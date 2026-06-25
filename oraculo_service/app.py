import os
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Header, Depends
from pydantic import BaseModel
import chromadb
from openai import OpenAI

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
chroma_client = chromadb.PersistentClient(path=DB_PATH)

# Silencia os avisos chatos de telemetria do ChromaDB
chromadb.config.Settings(anonymized_telemetry=False)

# Garantimos que o ONNX nunca sobe para a RAM
colecao_oraculo = chroma_client.get_or_create_collection(
    name="ascensao_conhecimento",
    embedding_function=None 
)

# Inicializa OpenAI com chave do .env
chave_openai = os.getenv("OPENAI_EMBEDDINGS_KEY")
openai_client = OpenAI(api_key=chave_openai) if chave_openai else None

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

class ConsultaRequest(BaseModel):
    cronica_id: str
    pergunta: str
    api_key_llm: str    
    base_url_llm: str   
    model_llm: str      

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
        resposta = openai_client.embeddings.create(
            input=req.texto,
            model="text-embedding-3-small"
        )
        vetor = resposta.data[0].embedding
        
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

# Quantos trechos recuperar do banco vetorial (top-k). Cobre múltiplos
# chunks da mesma entidade sem estourar o contexto/custo de tokens (§4/F4).
TOP_K = 5

# Mensagem fixa quando o retrieval volta vazio: nunca inventar (Regra anti-alucinação, F4).
RESPOSTA_SEM_CONTEXTO = (
    "O Oráculo consultou as estrelas, mas não encontrou nada na história desta "
    "crônica que responda a isto."
)

def montar_super_prompt(trechos: list[str], pergunta: str) -> str:
    """Grounding anti-alucinação: a IA responde SÓ com base nos trechos recuperados (§4/F4)."""
    contexto = "\n\n---\n\n".join(trechos)
    return (
        "Você é o Oráculo, uma entidade que conhece a história desta crônica de RPG. "
        "Responda à pergunta do Narrador baseando-se ÚNICA E EXCLUSIVAMENTE nos trechos "
        "abaixo. Se a resposta não estiver nos trechos, diga claramente que não sabe — "
        "nunca invente fatos.\n\n"
        f"=== TRECHOS DA CRÔNICA ===\n{contexto}\n\n"
        f"=== PERGUNTA DO NARRADOR ===\n{pergunta}"
    )

@app.post("/consultar", dependencies=[Depends(verificar_segredo)])
def consultar_oraculo(req: ConsultaRequest):
    """(F4) RAG: embeda a pergunta, recupera trechos da crônica (anti-IDOR) e gera a resposta (BYOK)."""
    if not openai_client:
        raise HTTPException(status_code=500, detail="Chave OPENAI_EMBEDDINGS_KEY ausente.")

    try:
        # 1. Embeda a pergunta com o MESMO modelo do /upsert (consistência obrigatória, §4/F4).
        emb = openai_client.embeddings.create(
            input=req.pergunta,
            model="text-embedding-3-small"
        )
        vetor_pergunta = emb.data[0].embedding

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
        cliente_geracao = OpenAI(api_key=req.api_key_llm, base_url=req.base_url_llm)
        completion = cliente_geracao.chat.completions.create(
            model=req.model_llm,
            messages=[
                {"role": "user", "content": montar_super_prompt(trechos, req.pergunta)}
            ]
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
