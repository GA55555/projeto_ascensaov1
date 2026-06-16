// ==========================================
// ESTADO GLOBAL DA PÁGINA
// ==========================================
const urlParams = new URLSearchParams(window.location.search);
const cronicaId = urlParams.get('id');

let minhaPermissaoAtual = 'leitura';
let meuPapelNaMesa = 'jogador';
let meuIdUsuario = null;
let abaAtualId = null;
let postsAtuaisNaAba = [];
let tipoPostSelecionado = 'normal';
let albumItensCount = 0;

let lightboxImagens = [];
let lightboxIndex = 0;

if (!cronicaId) window.location.href = '/profile.html';

// ==========================================
// INICIALIZAÇÃO E GESTÃO DE ABAS
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    carregarComunidade();
});

async function carregarComunidade() {
    try {
        const res = await API.fetch(`/cronicas/${cronicaId}/comunidade`);
        const dados = await res.json();
        
        if (!res.ok) {
            alert(dados.erro || "Acesso negado.");
            window.location.href = '/profile.html';
            return;
        }

        // Configuração de Cabeçalho
        const titulo = dados.nome || "Comunidade da Crônica";
        const elementoNome = document.getElementById('nome-cronica') || document.querySelector('.nome-cronica') || document.querySelector('h1');
        if (elementoNome) elementoNome.innerText = titulo;

        const elementoBanner = document.getElementById('banner-cronica') || document.querySelector('.banner-comunidade');
        const urlCapa = dados.cronica.banner_url || dados.cronica.capa_url || dados.cronica.imagem_url;
        
        if (elementoBanner && urlCapa) {
            let urlTratada = urlCapa.replace(/\\/g, '/');
            if (!urlTratada.startsWith('/')) urlTratada = '/' + urlTratada;
            elementoBanner.style.backgroundImage = `url('${urlTratada}')`;
        }

        // Renderização do Menu de Abas
        const menuAbas = document.getElementById('menu-abas') || document.getElementById('lista-abas') || document.querySelector('.menu-abas');
        if (!menuAbas) return;
        
        menuAbas.innerHTML = '';
        const isNarrador = (dados.papel === 'narrador' || dados.is_narrador);

        if (dados.abas && dados.abas.length > 0) {
            const abasHtml = dados.abas.map(aba => {
                const icone = aba.tipo === 'restrita' ? '<i data-lucide="lock"></i>' : '<i data-lucide="eye"></i>';
                const btnExcluir = isNarrador ? `<span class="btn-fechar" onclick="event.stopPropagation(); deletarAba('${aba.id}')" style="margin-left: 8px; cursor: pointer; color: #ff5555; float: right;" title="Apagar Aba"><i data-lucide="x" style="width: 14px; height: 14px;"></i></span>` : '';
                return `
                    <div class="aba-item" onclick="selecionarAba('${aba.id}', this)">
                        ${icone} ${escapeHTML(aba.nome)} ${btnExcluir}
                    </div>
                `;
            }).join('');
            
            menuAbas.innerHTML = abasHtml;
            setTimeout(() => {
                const primeiraAba = menuAbas.querySelector('.aba-item');
                if (primeiraAba) primeiraAba.click();
            }, 100);
        } else {
            menuAbas.innerHTML = '<p style="color: var(--texto-mutado); padding: 15px; font-size:13px;">Nenhuma aba visível.</p>';
        }

        // Links Extras (Apenas Narrador)
        if (isNarrador) {
            menuAbas.innerHTML += `
                <a href="/controle_mundo.html?id=${cronicaId}" class="aba-item" style="text-decoration: none; display: block;"><i data-lucide="globe"></i> Controle de Mundo</a>
                <a href="/escudo_narrador.html?id=${cronicaId}" class="aba-item" style="text-decoration: none; display: block;"><i data-lucide="shield"></i> Escudo do Narrador</a>
                <button onclick="criarNovaAba()" style="width: 90%; margin: 15px auto; display: block; padding: 10px; background: transparent; border: 1px dashed var(--roxo-mago); color: var(--roxo-mago); border-radius: 4px; cursor: pointer; font-weight: bold; transition: 0.3s;">
                    + Nova Aba
                </button>
            `;
        }
        lucide.createIcons();
    } catch (err) { console.error("Erro ao renderizar comunidade:", err); }
}

async function criarNovaAba() {
    const nomeAba = prompt("Qual será o nome da nova sala? (Ex: NPCs, Diários, Segredos)");
    if (!nomeAba || nomeAba.trim() === '') return;

    try {
        const resposta = await API.fetch(`/cronicas/${cronicaId}/abas`, {
            method: 'POST',
            body: JSON.stringify({ nome: nomeAba, tipo: 'restrita' })
        });
        if (resposta.ok) carregarComunidade();
        else alert("Erro ao criar aba.");
    } catch (err) { alert("A conexão falhou."); }
}

window.deletarAba = async function(abaId) {
    if(!confirm("Deseja apagar esta sala e todo o seu conteúdo?")) return;
    try {
        const res = await API.fetch(`/cronicas/${cronicaId}/abas/${abaId}`, { method: 'DELETE' });
        if(res.ok) {
            abaAtualId = null; 
            carregarComunidade();
        } else alert("Erro ao deletar aba.");
    } catch (e) { alert("Erro de conexão."); }
}

window.selecionarAba = function(abaId, elemento) {
    abaAtualId = abaId;
    document.querySelectorAll('.aba-item').forEach(aba => aba.classList.remove('ativa'));
    if (elemento) elemento.classList.add('ativa');
    carregarPosts();
}

// ==========================================
// GESTÃO DE POSTAGENS (PERGAMINHOS)
// ==========================================
async function carregarPosts() {
    const divPosts = document.getElementById('lista-posts');
    if(!abaAtualId) return;

    try {
        const res = await API.fetch(`/cronicas/${cronicaId}/abas/${abaAtualId}/posts`);
        const dados = await res.json();
        
        postsAtuaisNaAba = dados.posts || [];
        minhaPermissaoAtual = dados.minha_permissao;
        meuPapelNaMesa = dados.papel_na_mesa;
        meuIdUsuario = dados.meu_usuario_id;

        const nomeAbaAtiva = document.querySelector('.aba-item.ativa')?.innerText || "Aba";
        const btnPermissoes = (meuPapelNaMesa === 'narrador') 
            ? `<button onclick="abrirModalPermissoes('${abaAtualId}')" style="background: transparent; border: 1px solid var(--roxo-mago); color: var(--roxo-mago); padding: 5px 15px; border-radius: 4px; cursor: pointer;"><i data-lucide="lock"></i> Permissões</button>`
            : ``;

        divPosts.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 1px solid var(--borda); padding-bottom: 10px;">
                <h3><i data-lucide="file-text"></i> ${nomeAbaAtiva}</h3> ${btnPermissoes}
            </div>
            <div style="display: flex; gap: 20px; height: auto;">
                <div id="leitura-principal" style="flex: 2.5; background: var(--bg-card); padding: 20px; border-radius: 8px; border: 1px solid var(--borda);"></div>
                <div id="lista-lateral" style="flex: 1; overflow-y: auto; border-left: 1px dashed var(--borda); padding-left: 15px;"></div>
            </div>
        `;

        const areaPostagem = document.querySelector('.caixa-postar');
        if (areaPostagem) {
            areaPostagem.style.display = (meuPapelNaMesa === 'narrador' || minhaPermissaoAtual === 'editor') ? 'block' : 'none';
        }

        const listaLateral = document.getElementById('lista-lateral');
        listaLateral.innerHTML = postsAtuaisNaAba.map((post, index) => {
            let imgs = [];
            try { imgs = typeof post.imagens === 'string' ? JSON.parse(post.imagens) : (post.imagens || []); } catch(e) {}
            const capa = (imgs.length > 0) ? imgs[0] : null;
            return `
                <div onclick="exibirPostCompleto(${index})" style="padding: 10px; cursor: pointer; border-bottom: 1px solid var(--borda);">
                    ${capa ? `<img src="${capa}" style="width: 100%; height: 60px; object-fit: cover; border-radius:4px;">` : '<i data-lucide="file"></i>'}
                    <div style="font-size: 12px; margin-top: 5px;">${escapeHTML(post.conteudo.substring(0,20))}...</div>
                </div>
            `;
        }).join('');
        
        if(postsAtuaisNaAba.length > 0) exibirPostCompleto(0);
    } catch (err) { console.error(err); }
}

window.exibirPostCompleto = function(index) {
    const post = postsAtuaisNaAba[index];
    if (!post) return;

    const leituraPrincipal = document.getElementById('leitura-principal');
    const dataFormatada = new Date(post.criado_em).toLocaleString('pt-BR');
    const inicial = post.autor_nome.charAt(0).toUpperCase();
    
    const souDonoDoPost = (post.autor_id === meuIdUsuario);
    const possoEditarPost = (meuPapelNaMesa === 'narrador') || (minhaPermissaoAtual === 'editor' && souDonoDoPost);
    const possoComentar = (meuPapelNaMesa === 'narrador' || minhaPermissaoAtual === 'editor' || minhaPermissaoAtual === 'comentar');
    
    const botoesAcaoHtml = possoEditarPost ? `
        <div style="display: flex; gap: 10px;">
            <button onclick="editarPost('${post.id}', ${index})" style="background: rgba(255,255,255,0.05); border: 1px solid var(--borda); color: var(--texto-claro); padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 13px;"><i data-lucide="pen-line"></i> Editar</button>
            <button onclick="deletarPost('${post.id}')" style="background: rgba(255,85,85,0.1); border: 1px solid #ff5555; color: #ff5555; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 13px;"><i data-lucide="trash-2"></i> Apagar</button>
        </div>
    ` : ``;

    const areaComentariosHtml = possoComentar ? `
        <div class="area-comentarios-input" style="display: flex; gap: 10px;">
            <input type="text" id="input-comentario-${post.id}" placeholder="Escreva e aperte Enter..." style="flex: 1; padding: 10px; background: var(--bg-principal); border: 1px solid var(--borda); color: white; border-radius: 4px;" onkeydown="if(event.key === 'Enter') enviarComentario('${post.id}')">
            <button onclick="enviarComentario('${post.id}')" style="background: var(--destaque); color: #121214; border: none; padding: 0 20px; border-radius: 4px; font-weight: bold; cursor: pointer;">Enviar</button>
        </div>
    ` : `<p style="color: var(--texto-mutado); font-size: 13px; font-style: italic;">Você possui apenas permissão de leitura.</p>`;

    let arrayImagens = [];
    try { arrayImagens = typeof post.imagens === 'string' ? JSON.parse(post.imagens) : (post.imagens || []); } catch(e) {}
    if (post.imagem_url && arrayImagens.length === 0) arrayImagens = [post.imagem_url];

    const mosaicoImagensHtml = gerarGridImagens(arrayImagens);
    let conteudoHtml = '';
    let tipoBadge = '';

    if (post.tipo === 'album' && post.album_itens) {
        tipoBadge = 'Álbum';
        
        const urlsAlbum = post.album_itens.map(item => item.imagem_url);
        const urlsStr = encodeURIComponent(JSON.stringify(urlsAlbum));

        conteudoHtml = post.album_itens.map((item, i) => `
            <div style="margin-bottom: 20px; border-bottom: 1px solid var(--borda); padding-bottom: 15px;">
                <img src="${item.imagem_url}" 
                     style="width: 100%; max-height: 400px; object-fit: contain; border-radius: 8px; background: #000; cursor: pointer; transition: 0.2s;" 
                     onmouseover="this.style.opacity='0.85'" 
                     onmouseout="this.style.opacity='1'" 
                     onclick="event.stopPropagation(); abrirModalNavegacao('${urlsStr}', ${i})"
                     title="Clique para ampliar">
                ${item.descricao ? `<p style="color: var(--texto-claro); margin-top: 10px;">${escapeHTML(item.descricao)}</p>` : ''}
            </div>
        `).join('');
        
    } else if (post.tipo === 'votacao' && post.opcoes) {
        tipoBadge = 'Votação';
        const totalGeral = post.opcoes.reduce((s, o) => s + (o.votos || 0), 0);
        conteudoHtml = `
        <div style="background: var(--bg-principal); padding: 15px; border-radius: 8px; margin-bottom: 10px;">
            <p style="font-size: 18px; font-weight: bold; color: var(--destaque); margin-bottom: 15px;">${escapeHTML(post.conteudo)}</p>
            <div>
                ${post.opcoes.map(op => {
                    const totalVotos = totalGeral || 1;
                    const porcentagem = Math.round(((op.votos || 0) / totalVotos) * 100);
                    return `
                        <div onclick="votar('${post.id}', '${op.id}')" style="display: flex; align-items: center; gap: 10px; padding: 12px; margin-bottom: 8px; background: rgba(255,255,255,0.03); border-radius: 4px; cursor: pointer; position: relative; overflow: hidden; border: 1px solid var(--borda);">
                            <div style="position: absolute; left: 0; top: 0; bottom: 0; width: ${porcentagem}%; background: rgba(152, 113, 245, 0.15); z-index: 0;"></div>
                            <span style="flex: 1; z-index: 1;">${escapeHTML(op.texto)}</span>
                            <span style="color: var(--texto-mutado); font-size: 12px; z-index: 1; font-weight: bold;">
                                ${op.votos || 0} voto${op.votos !== 1 ? 's' : ''} (${porcentagem}%)
                            </span>
                        </div>
                    `;
                }).join('')}
            </div>
            <p style="font-size: 11px; color: var(--texto-mutado); margin-top: 10px; text-align: center;">Total: ${totalGeral} voto(s)</p>
        </div>`;
    } else {
        tipoBadge = post.tipo === 'normal' ? '' : '';
        conteudoHtml = escapeHTML(post.conteudo);
    }

    const avatar = post.autor_avatar 
        ? `<img src="${post.autor_avatar}" style="width: 45px; height: 45px; border-radius: 50%; object-fit: cover; border: 2px solid var(--destaque); flex-shrink: 0;">`
        : `<div style="width: 45px; height: 45px; border-radius: 50%; background: var(--roxo-mago); display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 20px; color: white; border: 2px solid var(--destaque); flex-shrink: 0;">${inicial}</div>`;

    leituraPrincipal.innerHTML = `
        <div style="padding: 20px; background: var(--bg-card); border-bottom: 1px solid var(--borda);">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <div style="display: flex; align-items: center; gap: 15px;">
                    ${avatar}
                    <div>
                        <div style="font-weight: bold; font-size: 18px; color: var(--destaque);">${escapeHTML(post.autor_nome)}</div>
                        <div style="font-size: 12px; color: var(--texto-mutado);">${dataFormatada}</div>
                    </div>
                </div>
                ${botoesAcaoHtml}
            </div>
            ${post.tipo === 'normal' ? mosaicoImagensHtml : ''}
        </div>
        <div style="padding: 20px; font-size: 16px; line-height: 1.8; color: var(--texto-claro); white-space: pre-wrap; word-break: break-word;">${conteudoHtml}</div>
        <div style="margin-top: 40px; border-top: 1px dashed var(--borda); padding: 20px;">
            <h4 style="margin-top: 0; color: var(--texto-mutado);">Comentários</h4>
            <div id="lista-comentarios-${post.id}" style="margin-bottom: 15px;"></div>
            ${areaComentariosHtml}
        </div>
    `;
    carregarComentarios(post.id);
}

// ==========================================
// AÇÕES DE POSTAGEM E PUBLICAÇÃO
// ==========================================
window.publicarPost = async function() {
    if (!abaAtualId) return alert('Selecione uma aba primeiro.');
    let payload = { tipo: tipoPostSelecionado };
    
    try {
        if (tipoPostSelecionado === 'normal') {
            const conteudo = document.getElementById('texto-post').value.trim();
            const inputImg = document.getElementById('input-imagem');
            if (!conteudo && inputImg.files.length === 0) return alert('Escreva algo ou anexe uma imagem.');
            payload.conteudo = conteudo;
            
            if (inputImg.files.length > 0) {
                const formData = new FormData();
                formData.append('imagens', inputImg.files[0]);
                const resUpload = await API.fetch('/midia/upload/social', { method: 'POST', body: formData });
                const dataUpload = await resUpload.json();
                if (!resUpload.ok) throw new Error(dataUpload.erro);
                payload.imagem_url = dataUpload.urls?.[0] || dataUpload.url;
            }
        }
        else if (tipoPostSelecionado === 'album') {
            const itens = document.querySelectorAll('#album-itens > div');
            if (itens.length === 0) return alert('Adicione pelo menos uma imagem ao álbum.');
            payload.album_itens = [];
            for (let item of itens) {
                const id = item.id.split('-')[2];
                const descricao = document.getElementById(`album-desc-${id}`)?.value || '';
                const imgInput = document.getElementById(`album-img-${id}`);
                if (!imgInput.files.length) continue;
                
                const formData = new FormData();
                formData.append('imagens', imgInput.files[0]);
                const resUpload = await API.fetch('/midia/upload/social', { method: 'POST', body: formData });
                const dataUpload = await resUpload.json();
                if (!resUpload.ok) throw new Error(dataUpload.erro);
                payload.album_itens.push({ imagem_url: dataUpload.urls?.[0] || dataUpload.url, descricao: descricao });
            }
            if (payload.album_itens.length === 0) return alert('Selecione pelo menos uma imagem para cada item do álbum.');
        }
        else if (tipoPostSelecionado === 'votacao') {
            const pergunta = document.getElementById('votacao-pergunta').value.trim();
            if (!pergunta) return alert('Digite a pergunta da votação.');
            const opcoes = [...document.querySelectorAll('.opcao-votacao')].map(i => i.value.trim()).filter(v => v);
            if (opcoes.length < 2) return alert('Adicione pelo menos 2 opções.');
            payload.pergunta = pergunta;
            payload.opcoes = opcoes;
        }
        
        const res = await API.fetch(`/cronicas/${cronicaId}/abas/${abaAtualId}/posts`, {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        
        if (!res.ok) { const err = await res.json(); throw new Error(err.erro || 'Erro ao publicar.'); }
        
        // Limpar Campos
        document.getElementById('texto-post').value = '';
        if(document.getElementById('input-imagem')) document.getElementById('input-imagem').value = '';
        if(document.getElementById('album-itens')) document.getElementById('album-itens').innerHTML = '';
        if(document.getElementById('votacao-pergunta')) document.getElementById('votacao-pergunta').value = '';
        if(document.getElementById('votacao-opcoes')) document.getElementById('votacao-opcoes').innerHTML = `<input type="text" class="opcao-votacao" placeholder="Opção 1" style="width: 100%; padding: 8px; margin-bottom: 5px; background: var(--bg-principal); border: 1px solid var(--borda); color: #fff; border-radius: 4px;"><input type="text" class="opcao-votacao" placeholder="Opção 2" style="width: 100%; padding: 8px; margin-bottom: 5px; background: var(--bg-principal); border: 1px solid var(--borda); color: #fff; border-radius: 4px;">`;
        albumItensCount = 0;
        
        carregarPosts();
    } catch (err) { alert(err.message); }
}

window.deletarPost = async function(postId) {
    if(!confirm("Atenção: Esta ação apagará permanentemente o registro. Prosseguir?")) return;
    try {
        const res = await API.fetch(`/cronicas/${cronicaId}/abas/${abaAtualId}/posts/${postId}`, { method: 'DELETE' });
        if (res.ok) carregarPosts(); 
        else alert("Você não tem permissão.");
    } catch (err) { alert("Falha na matriz."); }
}

window.votar = async function(postId, opcaoId) {
    try {
        const res = await API.fetch(`/cronicas/${cronicaId}/posts/${postId}/votar`, {
            method: 'POST',
            body: JSON.stringify({ opcao_id: opcaoId })
        });
        const dados = await res.json();
        if (res.ok) {
            const post = postsAtuaisNaAba.find(p => p.id === postId);
            if (post && dados.opcoes) {
                post.opcoes = dados.opcoes;
                const index = postsAtuaisNaAba.findIndex(p => p.id === postId);
                if (index >= 0) exibirPostCompleto(index);
            }
        } else alert(dados.erro || 'Erro ao votar.');
    } catch (err) { alert('Erro de conexão.'); }
}

// ==========================================
// COMENTÁRIOS (ECOS)
// ==========================================
async function carregarComentarios(postId) {
    const divComentarios = document.getElementById(`lista-comentarios-${postId}`);
    divComentarios.innerHTML = '<span style="color: var(--texto-mutado); font-size: 13px;">Carregando ecos...</span>';
    
    try {
        const res = await API.fetch(`/cronicas/${cronicaId}/posts/${postId}/comentarios`);
        const comentarios = await res.json();

        if (comentarios.length === 0) {
            divComentarios.innerHTML = '<div style="font-size: 13px; color: var(--texto-mutado);">Ninguém ecoou nesta memória ainda.</div>';
            return;
        }

        divComentarios.innerHTML = comentarios.map(c => {
            const dataC = new Date(c.criado_em).toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
            const nomeAutor = c.autor_nome || 'Desconhecido';
            const inicial = nomeAutor.charAt(0).toUpperCase();

            const avatarHtml = c.autor_avatar 
                ? `<img src="${c.autor_avatar}" style="width: 24px; height: 24px; border-radius: 50%; object-fit: cover; border: 1px solid var(--destaque); flex-shrink: 0;">`
                : `<div style="width: 24px; height: 24px; border-radius: 50%; background: var(--roxo-mago); display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: bold; color: white; flex-shrink: 0;">${inicial}</div>`;

            return `
            <div style="background: rgba(255,255,255,0.02); padding: 12px; border-radius: 6px; margin-bottom: 8px; border: 1px solid rgba(255,255,255,0.05); display: flex; flex-direction: column;">
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 10px;">
                    ${avatarHtml} <strong style="color: var(--destaque); font-size: 13px;">${escapeHTML(nomeAutor)}</strong> <span style="font-size: 10px; color: var(--texto-mutado);">${dataC}</span>
                </div>
                <div id="comentario-texto-${c.id}" style="font-size: 14px; color: var(--texto-claro); white-space: pre-wrap; margin-bottom: 12px;">${escapeHTML(c.conteudo)}</div>
                <div style="display: flex; justify-content: flex-end; gap: 8px;">
                    <button onclick="editarComentario('${postId}', '${c.id}')" style="background: #202024; border: 1px solid #8d8d99; color: #e1e1e6; padding: 2px 8px; border-radius: 4px; cursor: pointer; font-size: 12px;">Editar</button>
                    <button onclick="deletarComentario('${postId}', '${c.id}')" style="background: #202024; border: 1px solid #ff5555; color: #ff5555; padding: 2px 8px; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: bold;"><i data-lucide="x"></i></button>
                </div>
            </div>`;
        }).join('');
    } catch (err) { divComentarios.innerHTML = '<div style="color: red; font-size: 13px;">Erro ao ler as tramas.</div>'; }
}

window.enviarComentario = async function(postId) {
    const input = document.getElementById(`input-comentario-${postId}`);
    const conteudo = input.value.trim();
    if (!conteudo) return;

    try {
        const res = await API.fetch(`/cronicas/${cronicaId}/posts/${postId}/comentarios`, {
            method: 'POST', body: JSON.stringify({ conteudo })
        });
        if (res.ok) { input.value = ''; carregarComentarios(postId); }
    } catch (err) { alert("Erro de conexão."); }
}

window.deletarComentario = async function(postId, comentarioId) {
    if (!confirm("Apagar permanentemente?")) return;
    try {
        const res = await API.fetch(`/cronicas/${cronicaId}/posts/${postId}/comentarios/${comentarioId}`, { method: 'DELETE' });
        if (res.ok) carregarComentarios(postId);
    } catch (err) { alert("Erro de conexão."); }
}

// ==========================================
// LÓGICA DE GALERIA E MODAIS DE IMAGEM
// ==========================================
window.gerarGridImagens = function(imagensUrls) {
    if (!imagensUrls || imagensUrls.length === 0) return '';
    let urls = [];
    if (typeof imagensUrls === 'string') { try { urls = imagensUrls.startsWith('[') ? JSON.parse(imagensUrls) : [imagensUrls]; } catch(e) { urls = [imagensUrls]; } } 
    else if (Array.isArray(imagensUrls)) { urls = imagensUrls; }
    
    urls = urls.filter(u => u && u.length > 5);
    const count = urls.length;
    if (count === 0) return '';

    const urlsFormatadas = urls.map(u => (u.startsWith('/') ? u : '/' + u));
    let gridCols = count === 1 ? "1fr" : (count === 2 ? "1fr 1fr" : "2fr 1fr");
    let gridRows = count >= 3 ? "1fr 1fr" : "1fr";
    let alturaGrid = count === 1 ? 'auto' : '350px';
    let maxAltura = count === 1 ? '500px' : 'none';
    const urlsStr = encodeURIComponent(JSON.stringify(urlsFormatadas));

    let html = `<div style="display: grid; gap: 5px; margin-top: 15px; border-radius: 8px; overflow: hidden; border: 1px solid var(--borda); grid-template-columns: ${gridCols}; grid-template-rows: ${gridRows}; height: ${alturaGrid}; max-height: ${maxAltura};">`;

    urlsFormatadas.forEach((url, i) => {
        if (i >= 3) return;
        let objFit = count === 1 ? 'contain' : 'cover';
        let bgStyle = count === 1 ? 'background: rgba(0,0,0,0.3);' : '';

        if (i === 2 && count > 3) {
            let ocultas = count - 3;
            html += `<div style="position: relative; width: 100%; height: 100%; cursor: pointer; ${bgStyle}" onclick="event.stopPropagation(); abrirModalNavegacao('${urlsStr}', ${i})">
                        <img src="${url}" style="width: 100%; height: 100%; object-fit: ${objFit}; display: block;">
                        <div style="position: absolute; inset: 0; background: rgba(0,0,0,0.7); display: flex; justify-content: center; align-items: center; font-size: 32px; font-weight: bold; color: white;">+${ocultas}</div>
                     </div>`;
        } else {
            html += `<div style="width: 100%; height: 100%; cursor: pointer; ${i === 0 && count >= 3 ? 'grid-row: span 2;' : ''} ${bgStyle}" onclick="event.stopPropagation(); abrirModalNavegacao('${urlsStr}', ${i})">
                        <img src="${url}" style="width: 100%; height: 100%; object-fit: ${objFit}; display: block; transition: 0.2s;" onmouseover="this.style.opacity='0.85'" onmouseout="this.style.opacity='1'">
                     </div>`;
        }
    });
    return html + `</div>`;
}

window.abrirModalNavegacao = function(urlsStrJSON, startIndex) {
    lightboxImagens = JSON.parse(decodeURIComponent(urlsStrJSON));
    lightboxIndex = startIndex;
    atualizarImagemModal();
    document.getElementById('modal-imagem').style.display = 'flex';
}

function atualizarImagemModal() {
    const imgEl = document.getElementById('imagem-ampliada');
    if (!imgEl) return;
    imgEl.src = lightboxImagens[lightboxIndex];
}

window.fecharModalImagem = function() { document.getElementById('modal-imagem').style.display = 'none'; }

window.mudarImagem = function(direcao) {
    if (lightboxImagens.length <= 1) return;
    lightboxIndex += direcao;
    if (lightboxIndex < 0) lightboxIndex = lightboxImagens.length - 1; 
    if (lightboxIndex >= lightboxImagens.length) lightboxIndex = 0;      
    atualizarImagemModal();
}

// ==========================================
// FUNÇÕES DE INTERFACE (UI) E FORMULÁRIOS
// ==========================================

window.selecionarTipoPost = function(tipo) {
    tipoPostSelecionado = tipo;
    
    // Esconde todos
    document.getElementById('form-post-normal').style.display = 'none';
    document.getElementById('form-post-album').style.display = 'none';
    document.getElementById('form-post-votacao').style.display = 'none';
    
    // Reseta botões
    ['normal', 'album', 'votacao'].forEach(t => {
        const btn = document.getElementById(`btn-tipo-${t}`);
        if(btn) {
            btn.style.background = 'transparent';
            btn.style.border = '1px solid var(--borda)';
            btn.style.color = 'var(--texto-claro)';
        }
    });
    
    // Mostra o selecionado
    document.getElementById(`form-post-${tipo}`).style.display = 'block';
    const btnAtivo = document.getElementById(`btn-tipo-${tipo}`);
    if(btnAtivo) {
        btnAtivo.style.background = 'var(--roxo-mago)';
        btnAtivo.style.color = 'white';
        btnAtivo.style.border = 'none';
    }
}

window.adicionarItemAlbum = function() {
    albumItensCount++;
    const div = document.createElement('div');
    div.id = `album-item-${albumItensCount}`;
    div.style.cssText = 'display: flex; gap: 10px; margin-bottom: 10px; padding: 10px; background: var(--bg-principal); border-radius: 4px; align-items: start;';
    div.innerHTML = `
        <div style="flex: 1;">
            <input type="file" id="album-img-${albumItensCount}" accept="image/*" style="margin-bottom: 5px; color: var(--texto-mutado); font-size: 13px;">
            <textarea id="album-desc-${albumItensCount}" placeholder="Descrição da imagem..." style="width: 100%; padding: 8px; background: var(--bg-principal); border: 1px solid var(--borda); color: #fff; border-radius: 4px; min-height: 40px; box-sizing: border-box; resize: vertical;"></textarea>
        </div>
        <button onclick="this.parentElement.remove()" style="background: transparent; border: 1px solid #ff5555; color: #ff5555; padding: 5px 10px; border-radius: 4px; cursor: pointer; flex-shrink: 0;"><i data-lucide="x"></i></button>
    `;
    document.getElementById('album-itens').appendChild(div);
}

window.adicionarOpcaoVotacao = function() {
    const container = document.getElementById('votacao-opcoes');
    const count = container.querySelectorAll('.opcao-votacao').length + 1;
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'opcao-votacao';
    input.placeholder = `Opção ${count}`;
    input.style.cssText = 'width: 100%; padding: 8px; margin-bottom: 5px; background: var(--bg-principal); border: 1px solid var(--borda); color: #fff; border-radius: 4px; box-sizing: border-box;';
    container.appendChild(input);
    input.focus();
}

window.limparUpload = function() {
    const input = document.getElementById('input-imagem');
    if(input) input.value = ''; 
    const previewContainer = document.getElementById('container-previews');
    if (previewContainer) previewContainer.innerHTML = '';
}

window.editarComentario = async function(postId, comentarioId) {
    const paragrafo = document.getElementById(`comentario-texto-${comentarioId}`);
    const conteudoAntigo = paragrafo.innerText;
    const novoConteudo = prompt("Edite as suas palavras:", conteudoAntigo);
    if (!novoConteudo || novoConteudo.trim() === '' || novoConteudo === conteudoAntigo) return;
    try {
        const res = await API.fetch(`/cronicas/${cronicaId}/posts/${postId}/comentarios/${comentarioId}`, {
            method: 'PUT',
            body: JSON.stringify({ conteudo: novoConteudo })
        });
        if (res.ok) carregarComentarios(postId);
        else alert("Você só pode editar os seus próprios comentários.");
    } catch (err) { alert("Erro de conexão."); }
}

window.editarPost = function(postId, index) {
    const post = postsAtuaisNaAba[index];
    if (!post) return;
    
    document.getElementById('edit-post-id').value = postId;
    document.getElementById('edit-post-index').value = index;
    
    if (post.tipo === 'normal' || !post.tipo) {
        document.getElementById('edit-post-texto').value = post.conteudo || '';
        document.getElementById('modal-editar-post').style.display = 'flex';
        return;
    }
    alert('A edição de álbuns e votações deve ser feita apagando e recriando o post.');
}

window.confirmarEdicaoPost = async function() {
    const postId = document.getElementById('edit-post-id').value;
    const index = document.getElementById('edit-post-index').value;
    const novoConteudo = document.getElementById('edit-post-texto').value.trim();

    try {
        const res = await API.fetch(`/cronicas/${cronicaId}/abas/${abaAtualId}/posts/${postId}`, {
            method: 'PUT',
            body: JSON.stringify({ conteudo: novoConteudo })
        });
        if (res.ok) {
            document.getElementById('modal-editar-post').style.display = 'none';
            postsAtuaisNaAba[index].conteudo = novoConteudo;
            exibirPostCompleto(index);
        } else {
            alert("Erro ao atualizar o post.");
        }
    } catch (err) { alert("Erro de conexão."); }
}

// ==========================================
// MODAL DE PERMISSÕES
// ==========================================
window.abrirModalPermissoes = async function(abaId) {
    document.getElementById('perm-aba-id').value = abaId;
    document.getElementById('modal-permissoes').style.display = 'flex';
    const selectJogadores = document.getElementById('perm-jogador-id');
    const listaPermissoes = document.getElementById('lista-permissoes-atuais');

    try {
        const res = await API.fetch(`/cronicas/${cronicaId}/abas/${abaId}/permissoes`);
        const dados = await res.json();
        
        selectJogadores.innerHTML = '<option value="">Selecione um Jogador...</option>';
        dados.jogadores.forEach(j => selectJogadores.innerHTML += `<option value="${escapeHTML(String(j.id))}">${escapeHTML(j.nome_usuario)}</option>`);

        listaPermissoes.innerHTML = dados.permissoes.map(p => `
            <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.05); padding: 8px 10px; margin-bottom: 5px; border-radius: 4px;">
                <div><strong>${escapeHTML(p.nome_usuario)}</strong> <span style="font-size: 12px; color: var(--texto-mutado); margin-left: 10px;">${escapeHTML(p.nivel_acesso).toUpperCase()}</span></div>
                <button onclick="revogarPermissao('${abaId}', '${p.jogador_id}')" style="background: transparent; color: #ff5555; border: 1px solid #ff5555; border-radius: 4px; cursor: pointer; padding: 2px 8px; font-size: 12px;">Revogar</button>
            </div>
        `).join('');
    } catch (err) { listaPermissoes.innerHTML = '<div style="color: red;">Erro.</div>'; }
}

window.fecharModalPermissoes = function() { document.getElementById('modal-permissoes').style.display = 'none'; }

window.salvarPermissaoAba = async function() {
    const abaId = document.getElementById('perm-aba-id').value;
    const jogadorId = document.getElementById('perm-jogador-id').value;
    const nivel = document.getElementById('perm-nivel').value;

    if (!jogadorId) return alert("Selecione um Desperto.");

    try {
        const res = await API.fetch(`/cronicas/${cronicaId}/abas/${abaId}/permissoes`, {
            method: 'PUT',
            body: JSON.stringify({ jogador_id: jogadorId, nivel_acesso: nivel })
        });
        if (res.ok) abrirModalPermissoes(abaId); 
        else {
            const dadosErro = await res.json();
            alert(dadosErro.erro || "Erro ao conceder acesso.");
        }
    } catch (err) { alert("Erro de conexão."); }
}

window.revogarPermissao = async function(abaId, jogadorId) {
    try {
        const res = await API.fetch(`/cronicas/${cronicaId}/abas/${abaId}/permissoes/${jogadorId}`, { method: 'DELETE' });
        if (res.ok) abrirModalPermissoes(abaId); 
    } catch (err) { alert("Erro de conexão."); }
}

// Suporte de teclado para a Galeria
document.addEventListener('keydown', (e) => {
    const modal = document.getElementById('modal-imagem');
    if (modal && modal.style.display === 'flex') {
        if (e.key === 'ArrowLeft') window.mudarImagem(-1);
        else if (e.key === 'ArrowRight') window.mudarImagem(1);
        else if (e.key === 'Escape') window.fecharModalImagem();
    }
});