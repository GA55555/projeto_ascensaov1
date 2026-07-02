// public/js/geradorEnredo.js
// Módulo Vanilla JavaScript para o Gerador de Enredo ("Tecelagem de Destinos").
// Regra 1.1 (Zero Frameworks), Regra 2.4 (Camada de Rede via OraculoApi), Regra 2.5 (Glassmorphism / Tokens).

(function() {
    const esc = (str) => {
        if (window.escapeHTML) return window.escapeHTML(str);
        if (str === null || str === undefined) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    };

    const getCronicaId = () => window.cronicaAtual || window.cronicaId || new URLSearchParams(window.location.search).get('id');

    const GeradorEnredo = {
        // ── Pílulas de Enredo (1-Click Flags) ──────────────────────────────────────────
        async abrirModalSugerirMarcos(nodeId, nomeEntidade, tipoEntidade, marcosAtuais = [], notasReputacao = '', callbackAdicionar) {
            const cronicaId = getCronicaId();
            if (!cronicaId) {
                if (window.mostrarToast) mostrarToast('ID da crônica não encontrado.', 'erro');
                return;
            }

            const existente = document.getElementById('modal-sugerir-marcos-oraculo');
            if (existente) existente.remove();

            const modal = document.createElement('div');
            modal.id = 'modal-sugerir-marcos-oraculo';
            modal.className = 'modal show';
            modal.innerHTML = `
                <div class="modal-box modal-box-md" style="border-color:var(--dourado);">
                    <div class="modal-head">
                        <h3 class="modal-titulo flex-gap"><i data-lucide="sparkles" style="color:var(--dourado)"></i> Sugerir Marcos: ${esc(nomeEntidade)}</h3>
                        <button type="button" class="btn-fechar" data-fechar title="Fechar"><i data-lucide="x"></i></button>
                    </div>
                    <p class="texto-mutado" style="font-size:0.85rem; margin-bottom:16px;">
                        O Oráculo analisa a história, arquetipos e tensões de <strong>${esc(nomeEntidade)}</strong> para sugerir marcos narrativos de 1-Clique.
                    </p>
                    <div id="container-pilulas-conteudo">
                        <div style="text-align:center; padding:32px; color:var(--texto-mutado);">
                            <i data-lucide="loader" class="spin" style="width:28px; height:28px; color:var(--dourado); margin-bottom:8px;"></i>
                            <p>Consultando o tear dos destinos...</p>
                        </div>
                    </div>
                    <div class="modal-foot" style="margin-top:16px; justify-content:flex-end;">
                        <button type="button" class="btn btn-primary" data-fechar>Concluir</button>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);
            if (window.lucide) lucide.createIcons();

            const fechar = () => modal.remove();
            modal.addEventListener('click', (e) => {
                if (e.target === modal || (e.target.closest && e.target.closest('[data-fechar]'))) fechar();
            });

            // Requisição ao Oráculo
            try {
                const marcosFormatados = marcosAtuais.map(f => typeof f === 'object' ? (f.label || f.key || '') : String(f)).filter(Boolean);
                const resp = await OraculoApi.sugerirMarcos(cronicaId, {
                    entidade_id: nodeId,
                    nome_entidade: nomeEntidade,
                    tipo_entidade: tipoEntidade || 'Entidade',
                    marcos_atuais: marcosFormatados,
                    notas_reputacao: notasReputacao
                });

                const cont = document.getElementById('container-pilulas-conteudo');
                if (!cont) return;

                const sugestoes = resp.sugestoes || [];
                if (!sugestoes.length) {
                    cont.innerHTML = `<p class="texto-mutado" style="text-align:center; padding:20px;">Nenhuma nova sugestão gerada no momento. Os marcos atuais já cobrem os principais conflitos!</p>`;
                    return;
                }

                cont.innerHTML = `
                    <div class="sugestoes-lista" style="display:flex; flex-direction:column; gap:12px; max-height:380px; overflow-y:auto; padding-right:4px;">
                        ${sugestoes.map((s, idx) => {
                            const nomeMarco = s.label || s.marco || s.key || 'Marco Sugerido';
                            const pesoMarco = s.peso_estimado || s.peso || 2;
                            const motivoMarco = s.motivo || s.descricao || `Sugerido pelo Oráculo para ${esc(nomeEntidade)}`;
                            const iconeMarco = s.icone || 'flag';
                            return `
                            <div class="sugestao-card">
                                <div class="sugestao-info" style="flex:1;">
                                    <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
                                        <span class="sessao-pill" style="background:color-mix(in srgb, var(--dourado) 15%, var(--bg-card)); border-color:var(--dourado); color:var(--texto-claro); pointer-events:none;">
                                            <i data-lucide="${esc(iconeMarco)}" style="color:var(--dourado)"></i> ${esc(nomeMarco)}
                                        </span>
                                        <span style="font-size:0.72rem; color:var(--texto-mutado); background:var(--bg-input); padding:2px 6px; border-radius:4px;">Peso ${pesoMarco}</span>
                                    </div>
                                    <p style="font-size:0.8rem; color:var(--texto-mutado); margin:0; line-height:1.4;">${esc(motivoMarco)}</p>
                                </div>
                                <button type="button" class="btn btn-sm btn-outline btn-adicionar-pilula" data-idx="${idx}" data-marco="${esc(nomeMarco)}" style="flex-shrink:0; display:flex; align-items:center; gap:4px;">
                                    <i data-lucide="plus"></i> Inserir
                                </button>
                            </div>
                        `;}).join('')}
                    </div>
                    <div style="margin-top:16px; display:flex; justify-content:space-between; align-items:center; border-top:1px solid var(--borda); padding-top:12px;">
                        <button type="button" class="btn btn-outline btn-sm btn-adicionar-todos"><i data-lucide="layers"></i> Inserir Todos (${sugestoes.length})</button>
                        <span style="font-size:0.75rem; color:var(--texto-mutado);">Clique em "Inserir" para acoplar à entidade.</span>
                    </div>
                `;

                if (window.lucide) lucide.createIcons();

                // Listeners dos botões de inserção
                const btnTodos = cont.querySelector('.btn-adicionar-todos');
                const btnsIn = Array.from(cont.querySelectorAll('.btn-adicionar-pilula'));

                const inserirMarcoUI = async (btn) => {
                    if (btn.disabled) return;
                    const marco = btn.dataset.marco;
                    btn.disabled = true;
                    btn.innerHTML = `<i data-lucide="loader" class="spin"></i>`;
                    if (window.lucide) lucide.createIcons();

                    try {
                        if (callbackAdicionar) await callbackAdicionar(marco);
                        btn.innerHTML = `<i data-lucide="check"></i> Inserido`;
                        btn.style.background = 'color-mix(in srgb, var(--azul-vida) 20%, transparent)';
                        btn.style.borderColor = 'var(--azul-vida)';
                        btn.style.color = 'var(--azul-vida)';
                        if (window.lucide) lucide.createIcons();
                    } catch (err) {
                        btn.disabled = false;
                        btn.innerHTML = `<i data-lucide="plus"></i> Inserir`;
                        if (window.mostrarToast) mostrarToast(err.message || 'Erro ao inserir marco.', 'erro');
                        if (window.lucide) lucide.createIcons();
                    }
                };

                btnsIn.forEach(btn => {
                    btn.addEventListener('click', () => inserirMarcoUI(btn));
                });

                if (btnTodos) {
                    btnTodos.addEventListener('click', async () => {
                        btnTodos.disabled = true;
                        for (const b of btnsIn) {
                            if (!b.disabled) await inserirMarcoUI(b);
                        }
                    });
                }

            } catch (err) {
                const cont = document.getElementById('container-pilulas-conteudo');
                if (cont) {
                    cont.innerHTML = `<p style="color:var(--vermelho-dano); text-align:center; padding:20px;">Falha ao consultar o Oráculo: ${esc(err.message)}</p>`;
                }
            }
        },

        // ── Tecer Profecia / Evento de Conflito com IA ─────────────────────────────────
        async abrirModalTecerProfecia(opcoes = {}) {
            const cronicaId = getCronicaId();
            if (!cronicaId) {
                if (window.mostrarToast) mostrarToast('ID da crônica não encontrado.', 'erro');
                return;
            }

            const existente = document.getElementById('modal-tecer-profecia-oraculo');
            if (existente) existente.remove();

            if ((!opcoes.entidades || opcoes.entidades.length === 0) && (!window.entidadesAtual || window.entidadesAtual.length === 0)) {
                try {
                    const res = await API.fetch(`/cronicas/${cronicaId}/constelacao`);
                    if (res.ok) {
                        const snap = await res.json();
                        window.entidadesAtual = snap.entidades || [];
                    }
                } catch (e) { console.error('Erro ao buscar entidades p/ profecia:', e); }
            }
            const entidades = opcoes.entidades || window.entidadesAtual || [];
            const focoId = opcoes.focoId || window.focoAtualId || '';
            const focoTitulo = opcoes.focoTitulo || 'Sistema Geral';

            const modal = document.createElement('div');
            modal.id = 'modal-tecer-profecia-oraculo';
            modal.className = 'modal show';
            modal.innerHTML = `
                <div class="modal-box modal-box-lg" style="border-color:var(--dourado); max-width:680px;">
                    <div class="modal-head">
                        <h3 class="modal-titulo flex-gap"><i data-lucide="sparkles" style="color:var(--dourado)"></i> Tecer Destinos com Oráculo IA</h3>
                        <button type="button" class="btn-fechar" data-fechar title="Fechar"><i data-lucide="x"></i></button>
                    </div>
                    <p class="texto-mutado" style="font-size:0.85rem; margin-bottom:16px;">
                        Configure os parâmetros narrativos e deixe a IA tecer um Evento de Conflito interligado aos marcos de suas entidades, embasado nas últimas sessões da mesa.
                    </p>
                    
                    <div id="tecer-etapa-form">
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:14px;">
                            <div>
                                <label style="font-size:0.8rem; font-weight:600; display:block; margin-bottom:4px; color:var(--texto-claro);">Arquétipo Narrativo</label>
                                <select id="tecer-arquetipo" class="input-full input-sm">
                                    <option value="conflito">Conflito & Guerra</option>
                                    <option value="misterio">Mistério & Investigação</option>
                                    <option value="revelacao">Revelação & Segredo Expoto</option>
                                    <option value="tragedia">Tragédia & Perda</option>
                                    <option value="gloria">Glória & Ascensão</option>
                                </select>
                            </div>
                            <div>
                                <label style="font-size:0.8rem; font-weight:600; display:block; margin-bottom:4px; color:var(--texto-claro);">Escopo de Impacto</label>
                                <select id="tecer-escopo" class="input-full input-sm">
                                    <option value="local">Local (Uma facção / Núcleo)</option>
                                    <option value="regional" selected>Regional (Múltiplas entidades)</option>
                                    <option value="global">Global (Toda a Crônica)</option>
                                </select>
                            </div>
                        </div>

                        <div style="margin-bottom:14px;">
                            <label style="font-size:0.8rem; font-weight:600; display:block; margin-bottom:4px; color:var(--texto-claro);">Entidades Foco</label>
                            <div style="max-height:120px; overflow-y:auto; border:1px solid var(--borda); border-radius:6px; padding:8px; background:var(--bg-input); display:flex; flex-wrap:wrap; gap:6px;">
                                ${entidades.map(ent => `
                                    <label class="sessao-pill" style="font-size:0.78rem; cursor:pointer; margin:0;">
                                        <input type="checkbox" name="ent-foco" value="${ent.id}" ${String(ent.id) === String(focoId) || String(ent.nucleo_id) === String(focoId) ? 'checked' : ''} style="margin-right:4px;">
                                        ${esc(ent.nome)}
                                    </label>
                                `).join('') || '<span style="font-size:0.8rem; color:var(--texto-mutado);">Nenhuma entidade disponível</span>'}
                            </div>
                        </div>

                        <div style="margin-bottom:16px;">
                            <label style="font-size:0.8rem; font-weight:600; display:block; margin-bottom:4px; color:var(--texto-claro);">Instrução Adicional ao Narrador (Opcional)</label>
                            <textarea id="tecer-instrucao" class="input-full input-sm" rows="2" placeholder="Ex: Faça com que a Inquisição seja a principal culpada pelo evento..."></textarea>
                        </div>

                        <div style="display:flex; justify-content:flex-end; gap:8px; border-top:1px solid var(--borda); padding-top:14px;">
                            <button type="button" class="btn btn-outline" data-fechar>Cancelar</button>
                            <button type="button" id="btn-disparar-tecelagem" class="btn btn-primary" style="background:var(--destaque); color:#fff; display:flex; align-items:center; gap:6px;">
                                <i data-lucide="sparkles"></i> Consultar Oraculo & Tecer
                            </button>
                        </div>
                    </div>

                    <div id="tecer-etapa-loading" style="display:none; text-align:center; padding:40px 20px;">
                        <i data-lucide="loader" class="spin" style="width:32px; height:32px; color:var(--dourado); margin-bottom:12px;"></i>
                        <h4 style="color:var(--texto-claro); margin-bottom:4px;">Tecendo os fios do destino...</h4>
                        <p class="texto-mutado" style="font-size:0.85rem;">Cruzando diários de sessão, marcos históricos e tensões matemáticas.</p>
                    </div>

                    <div id="tecer-etapa-resultado" style="display:none;"></div>
                </div>
            `;

            document.body.appendChild(modal);
            if (window.lucide) lucide.createIcons();

            const fechar = () => modal.remove();
            modal.addEventListener('click', (e) => {
                if (e.target === modal || (e.target.closest && e.target.closest('[data-fechar]'))) fechar();
            });

            const btnDisparar = document.getElementById('btn-disparar-tecelagem');
            if (btnDisparar) {
                btnDisparar.addEventListener('click', async () => {
                    const chks = Array.from(modal.querySelectorAll('input[name="ent-foco"]:checked'));
                    const entidadesFoco = chks.map(c => c.value).filter(Boolean);
                    const arquetipo = document.getElementById('tecer-arquetipo')?.value || 'conflito';
                    const escopo = document.getElementById('tecer-escopo')?.value || 'regional';
                    const instrucao = document.getElementById('tecer-instrucao')?.value?.trim() || '';

                    document.getElementById('tecer-etapa-form').style.display = 'none';
                    document.getElementById('tecer-etapa-loading').style.display = 'block';

                    try {
                        const resp = await OraculoApi.tecerProfecia(cronicaId, {
                            entidades_foco: entidadesFoco,
                            arquetipo,
                            escopo,
                            instrucao_narrador: instrucao
                        });

                        document.getElementById('tecer-etapa-loading').style.display = 'none';
                        const contRes = document.getElementById('tecer-etapa-resultado');
                        contRes.style.display = 'block';

                        const prof = resp.profecia || resp.evento_gerado || resp || {};
                        const ev = prof.evento_sugestao || prof.evento || prof || {};
                        let gatilhosBrutos = prof.gatilhos_por_entidade || prof.gatilhos || ev.gatilhos || [];
                        if (!Array.isArray(gatilhosBrutos)) gatilhosBrutos = [];
                        let gatilhos = gatilhosBrutos.map(g => ({
                            node_id: g.node_id || g.entidade_id || '',
                            nome_entidade: g.nome_entidade || g.nome || '',
                            papel: g.papel_arquetipico || g.papel || '',
                            marco: typeof g.marco_sugerido === 'object' ? (g.marco_sugerido.label || g.marco_sugerido.key || '') : (g.marco_sugerido || g.marco || ''),
                            peso_na_pool: g.peso_na_pool || g.peso || 2
                        }));
                        const trechos = resp.trechos_usados || '';

                        const renderCard = () => {
                            contRes.innerHTML = `
                                <div class="card-profecia-ia">
                                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                                        <span class="sessao-pill" style="background:color-mix(in srgb, var(--dourado) 25%, transparent); border-color:var(--dourado); color:var(--dourado); font-weight:600;"><i data-lucide="sparkles"></i> Profecia Gerada</span>
                                        <span style="font-size:0.75rem; color:var(--texto-mutado);">Pode editar antes de confirmar</span>
                                    </div>

                                    <div style="margin-bottom:10px;">
                                        <label style="font-size:0.75rem; color:var(--texto-mutado); display:block; margin-bottom:2px;">Nome do Evento</label>
                                        <input type="text" id="prof-nome" class="input-full input-sm" value="${esc(ev.nome || 'Novo Destino')}" style="font-weight:600; font-size:0.95rem; color:var(--dourado);">
                                    </div>

                                    <div style="margin-bottom:10px;">
                                        <label style="font-size:0.75rem; color:var(--texto-mutado); display:block; margin-bottom:2px;">Descrição Curta</label>
                                        <textarea id="prof-desc" class="input-full input-sm" rows="2">${esc(ev.descricao_curta || '')}</textarea>
                                    </div>

                                    <div style="display:flex; align-items:center; gap:12px; margin-bottom:12px;">
                                        <label style="font-size:0.8rem; color:var(--texto-claro); font-weight:600;">Pool Máxima (Teto):</label>
                                        <input type="number" id="prof-pool" class="input-sm" value="${parseInt(ev.pool_maxima, 10) || 15}" min="1" max="100" style="width:80px;">
                                    </div>

                                    ${trechos ? `
                                        <div style="background:color-mix(in srgb, var(--dourado) 12%, transparent); border-left:3px solid var(--dourado); padding:8px 12px; border-radius:4px; margin-bottom:14px; font-size:0.8rem;">
                                            <strong style="color:var(--dourado); display:block; margin-bottom:4px;"><i data-lucide="anchor" style="width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:4px;"></i>Ancorado nos Diários & Destinos:</strong>
                                            <span style="color:var(--texto-claro); line-height:1.4;">${esc(Array.isArray(trechos) ? trechos.join(' • ') : trechos)}</span>
                                        </div>
                                    ` : ''}

                                    <div style="margin-bottom:14px;">
                                        <label style="font-size:0.8rem; color:var(--texto-claro); font-weight:600; display:block; margin-bottom:6px;">Marcos / Gatilhos Atrelados (${gatilhos.length})</label>
                                        <div id="prof-gatilhos-lista" style="max-height:160px; overflow-y:auto; padding-right:4px;">
                                            ${gatilhos.map((g, idx) => `
                                                <div class="gatilho-row" data-idx="${idx}">
                                                    <span style="font-size:0.78rem; color:var(--dourado); width:120px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${esc(g.nome_entidade || 'Entidade')}">${esc(g.nome_entidade || 'Entidade #'+g.node_id)}</span>
                                                    <input type="text" class="gat-marco input-sm" value="${esc(g.marco)}" style="flex:1;" placeholder="Nome do marco">
                                                    <label style="font-size:0.75rem; color:var(--texto-mutado);">Peso:</label>
                                                    <input type="number" class="gat-peso input-sm" value="${parseInt(g.peso_na_pool, 10) || 2}" min="1" max="20" style="width:60px;">
                                                    <button type="button" class="btn-ghost btn-del-gatilho" data-idx="${idx}" title="Remover gatilho" style="color:var(--vermelho-dano);"><i data-lucide="trash-2"></i></button>
                                                </div>
                                            `).join('') || '<p style="font-size:0.8rem; color:var(--texto-mutado);">Nenhum gatilho atrelado.</p>'}
                                        </div>
                                    </div>

                                    <div style="margin-bottom:16px; background:var(--bg-input); padding:8px 10px; border-radius:6px; border:1px solid var(--borda);">
                                        <label style="font-size:0.82rem; color:var(--texto-claro); display:flex; align-items:center; gap:8px; cursor:pointer; margin:0;">
                                            <input type="checkbox" id="chk-anexar-sessao" checked>
                                            Anexar automaticamente à Sessão em Andamento/Planejada (Fatia D)
                                        </label>
                                    </div>

                                    <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid var(--borda); padding-top:12px;">
                                        <button type="button" class="btn btn-outline btn-sm btn-gerar-novamente"><i data-lucide="rotate-ccw"></i> Tecer Outra</button>
                                        <div style="display:flex; gap:8px;">
                                            <button type="button" class="btn btn-outline btn-sm" data-fechar>Cancelar</button>
                                            <button type="button" id="btn-confirmar-mesa" class="btn btn-primary" style="background:var(--destaque); color:#fff; display:flex; align-items:center; gap:6px;"><i data-lucide="check-circle"></i> Confirmar na Mesa</button>
                                        </div>
                                    </div>
                                </div>
                            `;

                            if (window.lucide) lucide.createIcons();

                            // Listeners do Card
                            contRes.querySelectorAll('.btn-del-gatilho').forEach(b => {
                                b.addEventListener('click', () => {
                                    const idx = parseInt(b.dataset.idx, 10);
                                    gatilhos.splice(idx, 1);
                                    renderCard();
                                });
                            });

                            const btnRegerar = contRes.querySelector('.btn-gerar-novamente');
                            if (btnRegerar) {
                                btnRegerar.addEventListener('click', () => {
                                    document.getElementById('tecer-etapa-resultado').style.display = 'none';
                                    document.getElementById('tecer-etapa-form').style.display = 'block';
                                });
                            }

                            const btnConf = document.getElementById('btn-confirmar-mesa');
                            if (btnConf) {
                                btnConf.addEventListener('click', async () => {
                                    btnConf.disabled = true;
                                    btnConf.innerHTML = `<i data-lucide="loader" class="spin"></i> Gravando...`;
                                    if (window.lucide) lucide.createIcons();

                                    // Coletar dados editados
                                    const rows = Array.from(contRes.querySelectorAll('.gatilho-row'));
                                    const gatilhosEditados = rows.map(r => {
                                        const idx = parseInt(r.dataset.idx, 10);
                                        const gOrig = gatilhos[idx] || {};
                                        return {
                                            node_id: gOrig.node_id,
                                            nome_entidade: gOrig.nome_entidade,
                                            marco: r.querySelector('.gat-marco')?.value?.trim() || gOrig.marco,
                                            peso_na_pool: parseInt(r.querySelector('.gat-peso')?.value, 10) || 2
                                        };
                                    }).filter(g => g.node_id && g.marco);

                                    const payloadMesa = {
                                        evento: {
                                            nome: document.getElementById('prof-nome')?.value?.trim() || 'Novo Destino',
                                            descricao_curta: document.getElementById('prof-desc')?.value?.trim() || '',
                                            pool_maxima: parseInt(document.getElementById('prof-pool')?.value, 10) || 15
                                        },
                                        gatilhos: gatilhosEditados,
                                        nucleo_foco_id: focoId || null,
                                        anexar_sessao_ativa: document.getElementById('chk-anexar-sessao')?.checked || false
                                    };

                                    try {
                                        const resConf = await OraculoApi.confirmarTecelagem(cronicaId, payloadMesa);
                                        if (window.mostrarToast) mostrarToast(resConf.mensagem || 'Tecelagem confirmada com sucesso!', 'sucesso');
                                        modal.remove();

                                        if (window.recarregarEventos) window.recarregarEventos();
                                        if (window.Constelacao && window.Constelacao.recarregarEventos) window.Constelacao.recarregarEventos();
                                        if (typeof carregarEventos === 'function') carregarEventos();

                                        if (opcoes.callbackConfirmado) {
                                            opcoes.callbackConfirmado(resConf);
                                        } else {
                                            if (window.Constelacao && window.Constelacao.entrar && !window.focoAtualId) window.Constelacao.entrar(cronicaId);
                                        }
                                    } catch (errConf) {
                                        btnConf.disabled = false;
                                        btnConf.innerHTML = `<i data-lucide="check-circle"></i> Confirmar na Mesa`;
                                        if (window.mostrarToast) mostrarToast(errConf.message || 'Erro ao confirmar tecelagem.', 'erro');
                                        if (window.lucide) lucide.createIcons();
                                    }
                                });
                            }
                        };

                        renderCard();

                    } catch (err) {
                        document.getElementById('tecer-etapa-loading').style.display = 'none';
                        const contRes = document.getElementById('tecer-etapa-resultado');
                        contRes.style.display = 'block';
                        contRes.innerHTML = `
                            <div style="background:color-mix(in srgb, var(--vermelho-dano) 15%, var(--bg-card)); border:1px solid var(--vermelho-dano); border-radius:8px; padding:16px; text-align:center;">
                                <p style="color:var(--vermelho-dano); margin-bottom:12px;"><i data-lucide="alert-triangle"></i> Falha ao tecer profecia: ${esc(err.message)}</p>
                                <button type="button" class="btn btn-outline btn-sm" onclick="document.getElementById('tecer-etapa-resultado').style.display='none'; document.getElementById('tecer-etapa-form').style.display='block';"><i data-lucide="rotate-ccw"></i> Tentar Novamente</button>
                            </div>
                        `;
                        if (window.lucide) lucide.createIcons();
                    }
                });
            }
        }
    };

    window.GeradorEnredo = GeradorEnredo;
})();
