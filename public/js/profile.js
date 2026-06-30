// ==========================================
// CONFIGURAÇÃO INICIAL
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    // Redirecionamento imediato se não houver sessão local; a validação real do cookie é feita pelo backend.
    if (!localStorage.getItem('m20_user')) {
        window.location.href = '/login.html';
        return;
    }
    carregarDashboard();
});

// Força recarregar quando volta pra página (cache do navegador)
window.addEventListener('pageshow', function(event) {
    if (event.persisted || performance.getEntriesByType('navigation')[0]?.type === 'back_forward') {
        carregarDashboard();
    }
});

// ==========================================
// FUNÇÕES DE UTILIZADOR
// ==========================================
window.fazerLogout = async function() {
    await fetch('/auth/logout', { method: 'POST', credentials: 'include' });
    localStorage.removeItem('m20_user');
    localStorage.removeItem('m20_tema');
    window.location.href = '/login.html';
}

window.uploadAvatarPerfil = async function() {
    const input = document.getElementById('input-avatar-perfil');
    if (!input.files || !input.files.length) return;

    const file = input.files[0];
    
    // Preview imediato
    const reader = new FileReader();
    reader.onload = function(e) {
        document.getElementById('img-avatar').src = e.target.result;
    };
    reader.readAsDataURL(file);

    // Upload usando FormData (a nossa API.fetch lida com FormData automaticamente sem precisarmos definir Headers!)
    const formData = new FormData();
    formData.append('imagens', file);

    try {
        const res = await API.fetch('/midia/upload/avatares', {
            method: 'POST',
            body: formData
        });
        const data = await res.json();

        if (res.ok && data.urls && data.urls.length) {
            await API.fetch('/perfil/avatar', {
                method: 'PUT',
                body: JSON.stringify({ avatar_url: data.urls[0] })
            });
        }
    } catch (err) {
        console.error('Erro no upload:', err);
    }
}

// ==========================================
// CARREGAMENTO DO HUB
// ==========================================
async function carregarDashboard() {
    try {
        // Carrega dados e perfil simultaneamente
        const [respostaDashboard, respostaPerfil] = await Promise.all([
            API.fetch('/auth/dashboard-resumo'),
            API.fetch('/perfil').catch(() => ({ ok: false })) // Impede que o perfil quebre se falhar
        ]);

        if (!respostaDashboard.ok) throw new Error("Erro ao aceder ao painel.");
        const dados = await respostaDashboard.json();

        if (respostaPerfil.ok) {
            const dadosPerfil = await respostaPerfil.json();
            if (dadosPerfil.usuario) {
                if (dadosPerfil.usuario.avatar_url) document.getElementById('img-avatar').src = dadosPerfil.usuario.avatar_url;
                if (dadosPerfil.usuario.nome_usuario) document.getElementById('txt-boas-vindas').innerText = `Saudações, ${dadosPerfil.usuario.nome_usuario}`;
            }
        }

        // 1. Renderiza as crônicas que ele narra
        const listaNarrador = document.getElementById('lista-cronicas-narrador');
        if (dados.narrando.length === 0) {
            listaNarrador.innerHTML = `<p class="cronica-vazio">Você ainda não criou nenhuma crônica como narrador.</p>`;
        } else {
            listaNarrador.innerHTML = dados.narrando.map(cronica => {
                const st = statusInfo(cronica.status);
                return `
                    <div class="card-item">
                        <div class="cronica-info">
                            <strong class="cronica-nome">${escapeHTML(cronica.nome)}</strong>
                            <div class="cronica-meta">
                                <span class="tag-status ${st.classe}">${st.rotulo}</span>
                                ${cronica.status === 'terminada' ? `<span class="cronica-aviso-exclusao"><i data-lucide="alert-triangle"></i> Apagando em 21 dias</span>` : ''}
                                <div class="cronica-menu" id="menu-${cronica.id}">
                                    <button class="cronica-menu-toggle" onclick="toggleDropdown('menu-${cronica.id}')" title="Opções da crônica"><i data-lucide="more-vertical"></i></button>
                                    <div class="cronica-menu-lista">
                                        <div class="cronica-menu-item cronica-menu-item--ativar" onclick="alterarStatus('${cronica.id}', 'ativa')">Ativar</div>
                                        <div class="cronica-menu-item cronica-menu-item--pausar" onclick="alterarStatus('${cronica.id}', 'inativa')">Pausar</div>
                                        <div class="cronica-menu-item cronica-menu-item--finalizar" onclick="alterarStatus('${cronica.id}', 'terminada')">Finalizar</div>
                                        <div class="cronica-menu-item cronica-menu-item--deletar" onclick="deletarCronica('${cronica.id}')"><i data-lucide="trash-2"></i> Deletar</div>
                                    </div>
                                </div>
                            </div>
                            <p class="cronica-sistema">Sistema: ${escapeHTML(cronica.sistema_nome || 'Não definido')}</p>
                        </div>
                        <div class="cronica-acoes">
                            <a href="/painel_narrador.html?id=${cronica.id}" class="btn btn-outline-primary btn-sm"><i data-lucide="layout-dashboard"></i> Gerenciar</a>
                            <a href="/painel_cronica.html?id=${cronica.id}" class="btn btn-outline-primary btn-sm"><i data-lucide="users"></i> Membros</a>
                        </div>
                    </div>
                `;
            }).join('');
        }

        // 2. Renderiza as crônicas onde ele joga
        const listaJogador = document.getElementById('lista-cronicas-jogador');
        if (dados.jogando.length === 0) {
            listaJogador.innerHTML = `<p class="cronica-vazio">Você não está participando de nenhuma crônica ativa como jogador.</p>`;
        } else {
            listaJogador.innerHTML = dados.jogando.map(item => {
                const st = statusInfo(item.status);
                return `
                <div class="card-item">
                    <div>
                        <strong class="cronica-nome">${escapeHTML(item.cronica_nome)}</strong>
                        <span class="tag-status ${st.classe}">${st.rotulo}</span>
                        <p class="cronica-sistema">Sistema: ${escapeHTML(item.sistema_nome || 'Não definido')}</p>
                    </div>
                    <div class="cronica-acoes">
                        <a href="/painel_narrador.html?id=${item.cronica_id}" class="btn btn-outline-primary btn-sm"><i data-lucide="layout-dashboard"></i> Acessar Mesa</a>
                        <button class="btn btn-danger btn-sm" title="Sair desta crônica" data-nome="${escapeHTML(item.cronica_nome)}" onclick="sairDaCronica('${item.cronica_id}', this.dataset.nome)"><i data-lucide="log-out"></i> Sair</button>
                    </div>
                </div>
            `; }).join('');
        }
        lucide.createIcons();
    } catch (err) {
        console.error("Erro ao carregar dados do hub de perfil", err);
    }
}

// ==========================================
// FUNÇÕES DE STATUS E DELEÇÃO DA CRÓNICA
// ==========================================

// Mapeia o status da crônica → classe de cor (tokens) + rótulo. Fonte única (DRY) p/ as duas listas.
function statusInfo(status) {
    if (status === 'inativa') return { classe: 'status-pausada', rotulo: 'Pausada' };
    if (status === 'terminada') return { classe: 'status-finalizada', rotulo: 'Finalizada' };
    return { classe: 'status-ativa', rotulo: 'Ativa' };
}

// Fecha o menu de contexto quando clica fora dele.
document.addEventListener('click', function(e) {
    if (!e.target.closest('.cronica-menu-toggle')) {
        document.querySelectorAll('.cronica-menu.aberto').forEach(m => m.classList.remove('aberto'));
    }
});

window.toggleDropdown = function(id) {
    const menu = document.getElementById(id);
    if (!menu) return;
    const abrir = !menu.classList.contains('aberto');
    document.querySelectorAll('.cronica-menu.aberto').forEach(m => m.classList.remove('aberto')); // só um aberto por vez
    if (abrir) menu.classList.add('aberto');
}

window.alterarStatus = async function(cronicaId, novoStatus) {
    try {
        const res = await API.fetch(`/cronicas/${cronicaId}/status`, {
            method: 'PUT',
            body: JSON.stringify({ status: novoStatus })
        });
        if (res.ok) carregarDashboard(); 
        else {
            const dados = await res.json();
            alert(dados.erro || 'Erro ao alterar status.');
        }
    } catch (err) { alert('Erro de conexão ao alterar status.'); }
}

window.deletarCronica = async function(cronicaId) {
    if (!confirm('Tem certeza? Esta ação apagará PERMANENTEMENTE a crônica e TODOS os seus dados!')) return;
    if (!confirm('ATENÇÃO: Esta ação é IRREVERSÍVEL. Deseja continuar?')) return;

    try {
        const res = await API.fetch(`/cronicas/${cronicaId}`, { method: 'DELETE' });
        if (res.ok) {
            alert('Crônica deletada com sucesso.');
            carregarDashboard();
        } else {
            const dados = await res.json();
            alert(dados.erro || 'Erro ao deletar.');
        }
    } catch (err) { alert('Erro de conexão ao deletar crônica.'); }
}

window.sairDaCronica = async function(cronicaId, nomeCronica) {
    if (!confirm(`Tem certeza que deseja SAIR da crônica "${nomeCronica}"?`)) return;
    if (!confirm('Você perderá o acesso a esta mesa. Confirma?')) return;

    try {
        const res = await API.fetch(`/cronicas/${cronicaId}/sair`, { method: 'DELETE' });
        const dados = await res.json();

        if (res.ok) {
            alert(dados.mensagem);
            carregarDashboard(); 
        } else {
            alert(dados.erro || 'Erro ao sair.');
        }
    } catch (err) { alert('Erro de conexão ao sair da crônica.'); }
}