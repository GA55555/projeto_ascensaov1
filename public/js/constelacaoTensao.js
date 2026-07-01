// public/js/constelacaoTensao.js
// Motor Algorítmico de Tensões (Oráculo Matemático sem IA) — F2.3c
// Avalia os grafos de núcleos, entidades, sinapses, diplomacia e arcanos em memória para detectar
// padrões narrativos (traição, cerco, cegueira interna, preságios de tarot) instantaneamente e offline.
// Vanilla, zero libs (Regra 1), seguro contra XSS (Regra 6.1) e Lucide-compliant (Regra 2.3).

(function () {
    const CARTAS = [
        'O Louco', 'O Mago', 'A Sacerdotisa', 'A Imperatriz', 'O Imperador', 'O Hierofante',
        'Os Enamorados', 'A Carruagem', 'A Força', 'O Eremita', 'A Roda da Fortuna', 'A Justiça',
        'O Enforcado', 'A Morte', 'A Temperança', 'O Diabo', 'A Torre', 'A Estrela',
        'A Lua', 'O Sol', 'O Julgamento', 'O Mundo'
    ];

    function nomeCarta(tarotObj) {
        if (!tarotObj || typeof tarotObj !== 'object') return '';
        const num = Number(tarotObj.carta_num);
        return CARTAS[num] || 'Arcano Desconhecido';
    }

    function valorReta(l) {
        if (!l) return 0;
        if (typeof l.reta === 'number') return l.reta;
        if (typeof l.reta === 'string') return Number(l.reta) || 0;
        if (l.reta && typeof l.reta === 'object') return Number(l.reta.posicao || l.reta.valencia || 0);
        return 0;
    }

    // 1. Detecta tensões no escopo de um NÚCLEO (Astrolábio)
    function detectarTensoesNucleo(nucleoId, orbes = [], entidades = [], links = [], diplomacia = []) {
        const idStr = String(nucleoId);
        const nuc = orbes.find((o) => String(o.id) === idStr) || { nome: 'Este Núcleo' };
        const membros = entidades.filter((e) => String(e.nucleo_id) === idStr);
        const idsMembros = new Set(membros.map((m) => String(m.id)));
        const tensoes = [];
        const seen = new Set();

        const addTensao = (icone, cor, texto) => {
            if (seen.has(texto)) return;
            seen.add(texto);
            tensoes.push({ icone, cor, texto });
        };

        // Heurística A: Aliança Contraditória (Traição Interna)
        const aliados = diplomacia.filter((d) => (String(d.a) === idStr || String(d.b) === idStr) && (d.status === 'aliado' || d.status === 'pacto'));
        for (const dip of aliados) {
            const outroNucId = String(dip.a) === idStr ? String(dip.b) : String(dip.a);
            const outroNuc = orbes.find((o) => String(o.id) === outroNucId);
            const membrosOutro = entidades.filter((e) => String(e.nucleo_id) === outroNucId);
            const idsOutro = new Set(membrosOutro.map((m) => String(m.id)));

            for (const l of links) {
                const oStr = String(l.origem), dStr = String(l.destino);
                const isInter = (idsMembros.has(oStr) && idsOutro.has(dStr)) || (idsMembros.has(dStr) && idsOutro.has(oStr));
                if (isInter && valorReta(l) <= -4) {
                    const entA = entidades.find((e) => String(e.id) === (idsMembros.has(oStr) ? oStr : dStr));
                    const entB = entidades.find((e) => String(e.id) === (idsOutro.has(oStr) ? oStr : dStr));
                    if (entA && entB && outroNuc) {
                        addTensao('zap', 'var(--destaque)', 
                            `Traição Silenciosa: Aliança oficial com <strong>${escapeHTML(outroNuc.nome)}</strong>, mas o ódio entre <strong>${escapeHTML(entA.nome)}</strong> e <strong>${escapeHTML(entB.nome)}</strong> pode romper o pacto a qualquer momento.`);
                    }
                }
            }
        }

        // Heurística B: Panela de Pressão (Isolamento)
        const inimigos = diplomacia.filter((d) => (String(d.a) === idStr || String(d.b) === idStr) && d.status === 'inimigo');
        if (inimigos.length >= 2 && aliados.length === 0) {
            addTensao('shield-alert', 'var(--link-inimigo)', 
                `Cerco Imminente: <strong>${escapeHTML(nuc.nome)}</strong> está cercado por ${inimigos.length} facções inimigas sem nenhum aliado formal para socorrê-los.`);
        }

        // Heurística C: Cegueira Interna / Lobo em Pele de Cordeiro
        for (const m of membros) {
            const rep = Number(m.reputacao) || 0;
            if (rep <= -5) {
                // Checa se tem relação forte com alguém do mesmo núcleo
                const amigosIntra = links.filter((l) => {
                    const oStr = String(l.origem), dStr = String(l.destino);
                    return (oStr === String(m.id) || dStr === String(m.id)) && idsMembros.has(oStr) && idsMembros.has(dStr) && valorReta(l) >= 6;
                });
                if (amigosIntra.length > 0) {
                    addTensao('eye-off', 'var(--roxo-mago)', 
                        `Cegueira Interna: <strong>${escapeHTML(m.nome)}</strong> carrega pesada infâmia no mundo, mas goza de profunda lealdade e proteção dentro da facção.`);
                }
            }

            // Heurística D: Fidelidade por um Fio (Deserção)
            const inimigosIntra = links.filter((l) => {
                const oStr = String(l.origem), dStr = String(l.destino);
                return (oStr === String(m.id) || dStr === String(m.id)) && idsMembros.has(oStr) && idsMembros.has(dStr) && valorReta(l) <= -4;
            });
            if (inimigosIntra.length >= 2) {
                addTensao('alert-triangle', 'var(--link-inimigo)', 
                    `Risco de Motim: As inimizades internas e atritos crescentes de <strong>${escapeHTML(m.nome)}</strong> com seus pares o colocam à beira da deserção.`);
            }

            // Heurística E: Sinergia Arquetípica (Tarot)
            if (m.tarot && m.tarot.carta_num !== undefined) {
                const numA = Number(m.tarot.carta_num);
                const arcanosDeCrise = [0, 13, 15, 16]; // Louco, Morte, Diabo, Torre
                if (arcanosDeCrise.includes(numA)) {
                    addTensao('sparkles', 'var(--dourado)', 
                        `Preságio Arquetípico: A presença de <strong>${escapeHTML(m.nome)}</strong> sob o signo de <em>${nomeCarta(m.tarot)}</em> irradia uma inevitável força de ruptura ou transformação sobre o destino do grupo.`);
                }
            }
        }

        if (tensoes.length === 0) {
            tensoes.push({ icone: 'check-circle-2', cor: 'var(--azul-vida)', texto: 'Nenhuma contradição relacional grave ou crise iminente detectada nas sinapses deste núcleo.' });
        }

        return tensoes;
    }

    // 2. Detecta tensões no escopo de uma ENTIDADE individual (Feixe holográfico)
    function detectarTensoesEntidade(entId, orbes = [], entidades = [], links = [], diplomacia = []) {
        const idStr = String(entId);
        const ent = entidades.find((e) => String(e.id) === idStr);
        if (!ent) return [];
        const tensoes = [];
        const seen = new Set();

        const addTensao = (icone, cor, texto) => {
            if (seen.has(texto)) return;
            seen.add(texto);
            tensoes.push({ icone, cor, texto });
        };

        const rep = Number(ent.reputacao) || 0;
        if (rep <= -5) {
            addTensao('skull', 'var(--link-inimigo)', `Infâmia Pública: Seus atos sombrios o tornam um alvo visado por caçadores, rivalidades e justiceiros.`);
        } else if (rep >= 7) {
            addTensao('crown', 'var(--dourado)', `Fama Excepcional: Sua grande lealdade e reputação atraem pedidos de ajuda urgentes, mas também inveja política.`);
        }

        // Analisa links da entidade
        const meusLinks = links.filter((l) => String(l.origem) === idStr || String(l.destino) === idStr);
        for (const l of meusLinks) {
            const outroId = String(l.origem) === idStr ? String(l.destino) : String(l.origem);
            const outro = entidades.find((e) => String(e.id) === outroId);
            if (!outro) continue;
            const val = valorReta(l);

            if (val <= -6) {
                addTensao('swords', 'var(--link-inimigo)', `Inimizade Mortal com <strong>${escapeHTML(outro.nome)}</strong>: Um confronto direto ou sabotagem pode explodir a qualquer momento.`);
            } else if (val >= 8 && ent.nucleo_id !== outro.nucleo_id) {
                const nucOutro = orbes.find((o) => String(o.id) === String(outro.nucleo_id));
                addTensao('heart-handshake', 'var(--destaque)', `Lealdade Transgressora: Forte vínculo com <strong>${escapeHTML(outro.nome)}</strong> (${nucOutro ? escapeHTML(nucOutro.nome) : 'outra facção'}), gerando suspeitas de lealdade dividida.`);
            }

            // Sinergia de Tarot cruzada
            if (ent.tarot && outro.tarot && val <= -3) {
                addTensao('sparkles', 'var(--roxo-mago)', `Choque de Destinos: O arquétipo de <em>${nomeCarta(ent.tarot)}</em> em atrito com <em>${nomeCarta(outro.tarot)}</em> de <strong>${escapeHTML(outro.nome)}</strong> pressagia uma disputa dramática.`);
            }
        }

        if (tensoes.length === 0) {
            tensoes.push({ icone: 'shield-check', cor: 'var(--texto-mutado)', texto: 'Relações estáveis e sem presságios imediatos de conflito.' });
        }

        return tensoes;
    }

    // 3. Exibe o painel flutuante de tensões (Modal Glassmorphism)
    function abrirModalTensoes(titulo, tensoes) {
        const existente = document.getElementById('modal-tensoes-oraculo');
        if (existente) existente.remove();

        const modal = document.createElement('div');
        modal.id = 'modal-tensoes-oraculo';
        modal.className = 'modal show';
        modal.innerHTML = `
            <div class="modal-box modal-box-md tensao-modal-box">
                <div class="modal-head">
                    <h3 class="modal-titulo flex-gap"><i data-lucide="zap" style="color:var(--dourado)"></i> ${escapeHTML(titulo)}</h3>
                    <button type="button" class="btn-fechar" data-fechar title="Fechar"><i data-lucide="x"></i></button>
                </div>
                <p class="texto-mutado tensao-sub">O Oráculo Matemático examinou as linhas de força, reputações e arcanos deste sistema:</p>
                <div class="tensao-lista">
                    ${tensoes.map((t) => `
                        <div class="tensao-item">
                            <span class="tensao-icon" style="color:${t.cor}"><i data-lucide="${t.icone}"></i></span>
                            <span class="tensao-txt">${t.texto}</span>
                        </div>
                    `).join('')}
                </div>
                <div class="modal-foot" style="margin-top:16px; justify-content:flex-end;">
                    <button type="button" class="btn btn-primary" data-fechar>Entendido</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        if (window.lucide) lucide.createIcons();

        const fechar = () => modal.remove();
        modal.addEventListener('click', (e) => {
            if (e.target === modal || (e.target.closest && e.target.closest('[data-fechar]'))) fechar();
        });
        document.addEventListener('keydown', function escListener(e) {
            if (e.key === 'Escape') { fechar(); document.removeEventListener('keydown', escListener); }
        });
    }

    window.ConstelacaoTensao = {
        detectarTensoesNucleo,
        detectarTensoesEntidade,
        abrirModalTensoes
    };
})();
