// ==========================================
// CONFIGURAÇÃO INICIAL
// ==========================================
const urlParams = new URLSearchParams(window.location.search);
const cronicaId = urlParams.get('id');

if (!cronicaId) {
    window.location.href = '/profile.html';
}

document.addEventListener('DOMContentLoaded', async () => {
    const temAcesso = await verificarAcesso();
    if (temAcesso) {
        carregarJogadores();
    }
});

// ==========================================
// FUNÇÕES DE GESTÃO DA CRÓNICA
// ==========================================

async function verificarAcesso() {
    try {
        const res = await API.fetch(`/cronicas/${cronicaId}/comunidade`);
        if (!res.ok) throw new Error();

        const dados = await res.json();
        if (!dados.is_narrador) {
            alert("Apenas o Narrador pode gerenciar os jogadores desta crônica.");
            window.location.href = '/profile.html';
            return false;
        }
        return true;
    } catch (err) {
        window.location.href = '/profile.html';
        return false;
    }
}

async function carregarJogadores() {
    const lista = document.getElementById('lista-jogadores');

    try {
        const resposta = await API.fetch(`/cronicas/${cronicaId}/jogadores`);
        const jogadores = await resposta.json();

        if (!resposta.ok) throw new Error("Erro ao buscar jogadores");

        if (jogadores.length === 0) {
            lista.innerHTML = '<p class="texto-mutado">Nenhum jogador nesta crônica ainda.</p>';
            return;
        }

        lista.innerHTML = jogadores.map(jog => `
            <li class="item-interativo" style="display: flex; justify-content: space-between; align-items: center; margin-top: 10px;">
                <span><strong>${escapeHTML(jog.nome_usuario)}</strong></span>
                <div style="display: flex; align-items: center; gap: 12px;">
                    <span class="badge">${escapeHTML(jog.papel).toUpperCase()}</span>
                    <button
                        data-id="${escapeHTML(String(jog.id))}"
                        data-nome="${escapeHTML(jog.nome_usuario)}"
                        onclick="removerJogador(this.dataset.id, this.dataset.nome)"
                        class="btn btn-danger btn-sm"
                        title="Remover jogador">
                        <i data-lucide="user-x"></i>
                    </button>
                </div>
            </li>
        `).join('');
        lucide.createIcons();

    } catch (err) {
        console.error(err);
        lista.innerHTML = '<p class="texto-erro">Falha ao carregar jogadores.</p>';
    }
}

async function adicionarJogador() {
    const inputEmail = document.getElementById('email-novo-jogador');
    const email = inputEmail.value.trim();

    if (!email) {
        alert("Digite um e-mail.");
        return;
    }

    try {
        const resposta = await API.fetch(`/cronicas/${cronicaId}/adicionar-jogador`, {
            method: 'POST',
            body: JSON.stringify({ email_jogador: email })
        });

        const dados = await resposta.json();
        if (!resposta.ok) throw new Error(dados.erro || 'Erro ao adicionar.');

        alert(dados.mensagem);
        inputEmail.value = '';
        carregarJogadores();

    } catch (err) {
        alert(err.message);
    }
}

async function removerJogador(jogadorId, nomeJogador) {
    if (!confirm(`Tem certeza que deseja remover ${nomeJogador} desta crônica?`)) return;

    try {
        const resposta = await API.fetch(`/cronicas/${cronicaId}/jogadores/${jogadorId}`, {
            method: 'DELETE'
        });

        const dados = await resposta.json();
        if (!resposta.ok) throw new Error(dados.erro || 'Erro ao remover.');

        alert(dados.mensagem);
        carregarJogadores();

    } catch (err) {
        alert(err.message);
    }
}
