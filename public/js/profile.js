// ==========================================
// CONFIGURAÇÃO INICIAL
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    // Apenas garante que o token existe. A classe API também verifica, mas isto permite redirecionamento imediato.
    if (!localStorage.getItem('m20_token')) {
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
window.fazerLogout = function() {
    localStorage.removeItem('m20_token');
    localStorage.removeItem('m20_role');
    localStorage.removeItem('m20_user');
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
            listaNarrador.innerHTML = `<p style="color: var(--texto-mutado); font-size:14px;">Você ainda não criou nenhuma crônica como narrador.</p>`;
        } else {
            listaNarrador.innerHTML = dados.narrando.map(cronica => {
                const statusCor = cronica.status === 'ativa' ? 'rgba(80,250,123,0.2)' : cronica.status === 'inativa' ? 'rgba(255,200,0,0.2)' : 'rgba(255,85,85,0.2)';
                const statusCorTexto = cronica.status === 'ativa' ? '#50fa7b' : cronica.status === 'inativa' ? '#ffc800' : '#ff5555';
                const statusNome = cronica.status === 'ativa' ? 'Ativa' : cronica.status === 'inativa' ? 'Pausada' : 'Finalizada';

                return `
                    <div class="card-item">
                        <div style="flex: 1;">
                            <strong style="color: #fff;">${cronica.nome}</strong>
                            <div style="display: flex; align-items: center; gap: 8px; margin-top: 4px;">
                                <span style="font-size: 11px; padding: 3px 8px; border-radius: 12px; font-weight: bold; background: ${statusCor}; color: ${statusCorTexto};">
                                    ${statusNome}
                                </span>
                                ${cronica.status === 'terminada' ? `<span style="font-size: 10px; color: #ff5555;"><i data-lucide="alert-triangle" style="width:12px;height:12px;"></i> Apagando em 21 dias</span>` : ''}
                                <div style="position: relative; margin-left: 5px;">
                                    <button onclick="toggleDropdown('drop-${cronica.id}')" style="background: transparent; border: 1px solid var(--borda); color: var(--texto-claro); padding: 2px 6px; border-radius: 3px; cursor: pointer; font-size: 10px;">▼</button>
                                    <div id="drop-${cronica.id}" style="display: none; position: absolute; top: 100%; left: 0; background: var(--bg-card); border: 1px solid var(--borda); border-radius: 4px; z-index: 100; min-width: 140px; box-shadow: 0 4px 12px rgba(0,0,0,0.5);">
                                        <div onclick="alterarStatus('${cronica.id}', 'ativa')" style="padding: 8px 12px; cursor: pointer; color: #50fa7b; font-size: 13px;" onmouseover="this.style.background='rgba(80,250,123,0.1)'" onmouseout="this.style.background='transparent'">Ativar</div>
                                        <div onclick="alterarStatus('${cronica.id}', 'inativa')" style="padding: 8px 12px; cursor: pointer; color: #ffc800; font-size: 13px;" onmouseover="this.style.background='rgba(255,200,0,0.1)'" onmouseout="this.style.background='transparent'">Pausar</div>
                                        <div onclick="alterarStatus('${cronica.id}', 'terminada')" style="padding: 8px 12px; cursor: pointer; color: #ff5555; font-size: 13px;" onmouseover="this.style.background='rgba(255,85,85,0.1)'" onmouseout="this.style.background='transparent'">Finalizar</div>
                                        <div onclick="deletarCronica('${cronica.id}')" style="padding: 8px 12px; cursor: pointer; color: #ff0000; font-size: 13px; border-top: 1px solid var(--borda);" onmouseover="this.style.background='rgba(255,0,0,0.1)'" onmouseout="this.style.background='transparent'"><i data-lucide="trash-2" style="width:13px;height:13px;"></i> Deletar</div>
                                    </div>
                                </div>
                            </div>
                            <p style="color: var(--texto-mutado); font-size: 12px; margin: 4px 0 0 0;">Sistema: Mago M20</p>
                        </div>
                        <div style="display: flex; gap: 12px; align-items: center;">
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
            listaJogador.innerHTML = `<p style="color: var(--texto-mutado); font-size:14px;">Você não está participando de nenhuma crônica ativa como jogador.</p>`;
        } else {
            listaJogador.innerHTML = dados.jogando.map(item => `
                <div class="card-item">
                    <div>
                        <strong style="color: #fff;">${item.cronica_nome}</strong>
                        <span class="tag-status status-ativa">${item.status || 'ativa'}</span>
                        <p style="color: var(--texto-mutado); font-size: 12px; margin: 4px 0 0 0;">Sistema: Mago M20</p>
                    </div>
                    <div style="display: flex; gap: 12px; align-items: center;">
                        <a href="/painel_narrador.html?id=${item.cronica_id}" class="btn btn-outline-primary btn-sm"><i data-lucide="layout-dashboard"></i> Acessar Mesa</a>
                        <button onclick="sairDaCronica('${item.cronica_id}', '${item.cronica_nome}')" class="btn btn-danger btn-sm" title="Sair desta crônica"><i data-lucide="log-out"></i> Sair</button>
                    </div>
                </div>
            `).join('');
        }
        lucide.createIcons();
    } catch (err) {
        console.error("Erro ao carregar dados do hub de perfil", err);
    }
}

// ==========================================
// FUNÇÕES DE STATUS E DELEÇÃO DA CRÓNICA
// ==========================================

// Fecha dropdowns quando clica fora
document.addEventListener('click', function(e) {
    if (!e.target.closest('[onclick^="toggleDropdown"]')) {
        document.querySelectorAll('[id^="drop-"]').forEach(d => d.style.display = 'none');
    }
});

window.toggleDropdown = function(id) {
    const dropdown = document.getElementById(id);
    if (dropdown) dropdown.style.display = dropdown.style.display === 'block' ? 'none' : 'block';
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
    if (!confirm('⚠️ Tem certeza? Esta ação apagará PERMANENTEMENTE a crônica e TODOS os seus dados!')) return;
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