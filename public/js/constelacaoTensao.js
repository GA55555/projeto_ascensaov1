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

    function statusDiplomatico(aId, bId, diplomacia) {
        const id1 = String(aId), id2 = String(bId);
        const dip = diplomacia.find((d) => (String(d.a) === id1 && String(d.b) === id2) || (String(d.a) === id2 && String(d.b) === id1));
        return dip ? dip.status : 'neutro';
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

        // Heurística B: Triângulo Diplomático Explosivo (A aliado de B e C, mas B e C são inimigos)
        if (aliados.length >= 2) {
            for (let i = 0; i < aliados.length; i++) {
                for (let j = i + 1; j < aliados.length; j++) {
                    const nucId1 = String(aliados[i].a) === idStr ? String(aliados[i].b) : String(aliados[i].a);
                    const nucId2 = String(aliados[j].a) === idStr ? String(aliados[j].b) : String(aliados[j].a);
                    const st = statusDiplomatico(nucId1, nucId2, diplomacia);
                    if (st === 'inimigo') {
                        const o1 = orbes.find((o) => String(o.id) === nucId1);
                        const o2 = orbes.find((o) => String(o.id) === nucId2);
                        if (o1 && o2) {
                            addTensao('git-merge', 'var(--link-inimigo)', 
                                `Triângulo Diplomático Explosivo: Vocês mantêm alianças com <strong>${escapeHTML(o1.nome)}</strong> e <strong>${escapeHTML(o2.nome)}</strong>, mas eles são inimigos jurados entre si! Uma guerra os forçará a trair um dos lados.`);
                        }
                    }
                }
            }
        }

        // Heurística C: Panela de Pressão (Isolamento) e Vácuo de Poder
        const inimigos = diplomacia.filter((d) => (String(d.a) === idStr || String(d.b) === idStr) && d.status === 'inimigo');
        if (inimigos.length >= 2 && aliados.length === 0) {
            addTensao('shield-alert', 'var(--link-inimigo)', 
                `Cerco Imminente: <strong>${escapeHTML(nuc.nome)}</strong> está cercado por ${inimigos.length} facções inimigas sem nenhum aliado formal para socorrê-los.`);
        } else if (aliados.length === 0 && membros.length >= 2) {
            const temProtetor = membros.some((m) => (Number(m.reputacao) || 0) >= 5);
            if (!temProtetor) {
                addTensao('shield-off', 'var(--destaque)', 
                    `Vácuo de Poder: Sem alianças externas e carecendo de figuras lendárias com grande fama na opinião pública, este núcleo é um reino vulnerável a investidas imperiais.`);
            }
        }

        // Heurística D: Cegueira Interna e O Segundo Sol (Ameaça à Liderança)
        for (const m of membros) {
            const rep = Number(m.reputacao) || 0;
            if (rep <= -5) {
                const amigosIntra = links.filter((l) => {
                    const oStr = String(l.origem), dStr = String(l.destino);
                    return (oStr === String(m.id) || dStr === String(m.id)) && idsMembros.has(oStr) && idsMembros.has(dStr) && valorReta(l) >= 6;
                });
                if (amigosIntra.length > 0) {
                    addTensao('eye-off', 'var(--roxo-mago)', 
                        `Cegueira Interna: <strong>${escapeHTML(m.nome)}</strong> carrega pesada infâmia no mundo, mas goza de profunda lealdade e proteção dentro da facção.`);
                }
            }

            // O Segundo Sol: acumula muitas sinapses e fama, gerando gravidade própria
            const sinapsesTotais = links.filter((l) => String(l.origem) === String(m.id) || String(l.destino) === String(m.id)).length;
            if (sinapsesTotais >= 4 && rep >= 5 && membros.length >= 3) {
                addTensao('sun', 'var(--dourado)', 
                    `Ameaça de Separatismo: <strong>${escapeHTML(m.nome)}</strong> concentrou extrema influência (${sinapsesTotais} sinapses e fama ${rep}), tornando-se um "segundo sol" capaz de liderar um cisma dentro da facção.`);
            }

            // Heurística E: Fidelidade por um Fio (Deserção)
            const inimigosIntra = links.filter((l) => {
                const oStr = String(l.origem), dStr = String(l.destino);
                return (oStr === String(m.id) || dStr === String(m.id)) && idsMembros.has(oStr) && idsMembros.has(dStr) && valorReta(l) <= -4;
            });
            if (inimigosIntra.length >= 2) {
                addTensao('alert-triangle', 'var(--link-inimigo)', 
                    `Risco de Motim: As inimizades internas e atritos crescentes de <strong>${escapeHTML(m.nome)}</strong> com seus pares o colocam à beira da deserção.`);
            }

            // Heurística F: Sinergia Arquetípica e Estagnação (Tarot)
            if (m.tarot && m.tarot.carta_num !== undefined) {
                const numA = Number(m.tarot.carta_num);
                const arcanosDeCrise = [0, 13, 15, 16]; // Louco, Morte, Diabo, Torre
                const arcanosDeSombras = [9, 12, 18];    // Eremita, Enforcado, Lua
                if (arcanosDeCrise.includes(numA)) {
                    addTensao('sparkles', 'var(--dourado)', 
                        `Preságio de Ruptura: A presença de <strong>${escapeHTML(m.nome)}</strong> sob o signo de <em>${nomeCarta(m.tarot)}</em> irradia uma inevitável força de caos ou transformação sobre o destino do grupo.`);
                } else if (arcanosDeSombras.includes(numA)) {
                    addTensao('moon', 'var(--roxo-mago)', 
                        `Estagnação Oculta: Regido por <em>${nomeCarta(m.tarot)}</em>, <strong>${escapeHTML(m.nome)}</strong> envolve a facção em sacrifícios silenciosos, segredos ou isolamento perigoso.`);
                }
            }
        }

        // IMPORTANTE: Se não houver tensões, retorna array VAZIO [].
        // Isso garante que a contagem do indicador seja exatamente 0!
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

        // Checa marcos (flags) vs Infâmia
        const flagsAtivas = (ent.flags || []).filter((f) => f && f.key && f.value).length;
        if (flagsAtivas > 0 && rep <= -5) {
            addTensao('flag', 'var(--destaque)', `Legado de Sangue: Seus ${flagsAtivas} marcos históricos estão manchados por sua notória infâmia, dividindo a opinião entre o terror e o respeito.`);
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
            } else if (val >= -3 && val <= -1) {
                // Resfriamento diplomático
                const st = statusDiplomatico(ent.nucleo_id, outro.nucleo_id, diplomacia);
                if (st === 'aliado' || ent.nucleo_id === outro.nucleo_id) {
                    addTensao('thermometer-snowflake', 'var(--roxo-mago)', `Frieza Relacional: A relação com <strong>${escapeHTML(outro.nome)}</strong> esfriou para desconfiança velada (${val}); um erro menor pode transformá-la em inimizade aberta.`);
                }
            }

            // O Santo e o Pecador (Extremos opostos conectados por laço positivo)
            if (val >= 4) {
                const repOutro = Number(outro.reputacao) || 0;
                if ((rep >= 6 && repOutro <= -6) || (rep <= -6 && repOutro >= 6)) {
                    addTensao('scale', 'var(--dourado)', `O Santo e o Pecador: O vínculo secreto com <strong>${escapeHTML(outro.nome)}</strong> unindo uma figura venerada a uma notória infâmia representa um escândalo iminente.`);
                }
            }

            // Sinergia de Tarot cruzada
            if (ent.tarot && outro.tarot && val <= -3) {
                addTensao('sparkles', 'var(--roxo-mago)', `Choque de Destinos: O arquétipo de <em>${nomeCarta(ent.tarot)}</em> em atrito com <em>${nomeCarta(outro.tarot)}</em> de <strong>${escapeHTML(outro.nome)}</strong> pressagia uma disputa dramática.`);
            }
        }

        // IMPORTANTE: Retorna array VAZIO [] se não detectar nada
        return tensoes;
    }

    // 3. Exibe o painel flutuante de tensões (Modal Glassmorphism)
    function abrirModalTensoes(titulo, tensoes) {
        const existente = document.getElementById('modal-tensoes-oraculo');
        if (existente) existente.remove();

        const vazia = (!tensoes || tensoes.length === 0);
        const listaHTML = vazia 
            ? `<div class="tensao-item" style="background:color-mix(in srgb, var(--azul-vida) 12%, transparent); border-color:var(--azul-vida);">
                 <span class="tensao-icon" style="color:var(--azul-vida)"><i data-lucide="check-circle-2"></i></span>
                 <span class="tensao-txt" style="color:var(--texto-claro);">Nenhuma contradição relacional grave, traição oculta ou presságio iminente detectado. O sistema repousa em equilíbrio.</span>
               </div>`
            : tensoes.map((t) => `
                <div class="tensao-item">
                    <span class="tensao-icon" style="color:${t.cor}"><i data-lucide="${t.icone}"></i></span>
                    <span class="tensao-txt">${t.texto}</span>
                </div>
            `).join('');

        const modal = document.createElement('div');
        modal.id = 'modal-tensoes-oraculo';
        modal.className = 'modal show';
        modal.innerHTML = `
            <div class="modal-box modal-box-md tensao-modal-box">
                <div class="modal-head">
                    <h3 class="modal-titulo flex-gap"><i data-lucide="zap" style="color:var(--dourado)"></i> ${escapeHTML(titulo)}</h3>
                    <button type="button" class="btn-fechar" data-fechar title="Fechar"><i data-lucide="x"></i></button>
                </div>
                <p class="texto-mutado tensao-sub">O Oráculo Matemático examinou as linhas de força, reputações, alianças e arcanos deste sistema:</p>
                <div class="tensao-lista">
                    ${listaHTML}
                </div>
                <div class="modal-foot" style="margin-top:16px; justify-content:space-between; display:flex; align-items:center;">
                    <button type="button" class="btn btn-outline btn-sm btn-tecer-ia" style="color:var(--dourado); border-color:var(--dourado); display:flex; align-items:center; gap:6px;" title="Tecer Evento de Conflito com IA"><i data-lucide="sparkles"></i> 🔮 Tecer Evento (IA)</button>
                    <button type="button" class="btn btn-primary" data-fechar>Entendido</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        if (window.lucide) lucide.createIcons();

        const fechar = () => modal.remove();
        modal.addEventListener('click', (e) => {
            const btnTecer = e.target.closest('.btn-tecer-ia');
            if (btnTecer && window.GeradorEnredo) {
                fechar();
                window.GeradorEnredo.abrirModalTecerProfecia({ focoTitulo: titulo, tensoes, entidades: window.entidadesAtual || [] });
                return;
            }
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
