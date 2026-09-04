import { requireSession, getCurrentProfile, getUserId } from '../auth.js';
import { getEspacoAtivo, getMembrosDoEspaco } from '../espacos.js';
import { getListaDesejos, getAllTitulosComAvaliacoes, criarTitulo } from '../titulos.js';
import { getDetails, getTitlesByTmdbIds, discoverTitles } from '../tmdb.js?v=20260903.1';
import { getStreamingsDosUsuarios, SERVICOS_STREAMING } from '../streamings.js';
import { criarSessaoPendente, getSessaoPendente } from '../sessoes.js';
import {
  recomendarDaLista,
  misturarOrigens,
  motivosDaRecomendacao,
  formatarDuracao
} from '../recommendations.js?v=20260903.1';
import { getSugestoesDeUsuariosCompativeis } from '../compatibility.js?v=20260903.1';
import { normalizarModoAtivo, aplicarTema } from '../themes.js';
import { renderNavbar, safeImageSrc, escapeHtml, showToast } from '../ui.js';

let session;
let perfilAtual;
let espacoAtivo;
let membros = [];
let usuarioId;
let desejos = [];
let historico = [];
let historicoEnriquecido = [];
let streamingsPorUsuario = {};
let tipo = 'filme';
let clima = 'rir';
let origem = 'lista';
let modoSerie = 'nova';
let referencia = null;
let finalistas = [];
let idsExibidos = new Set();
let paginaDescoberta = 1;
let inicializado = false;
const participantes = new Set();
const streamingsAtivos = new Set();
const detalhesCache = new Map();

if (document.body.dataset.page === 'recommend') initRecommend();

export async function initRecommend(contexto = {}) {
  if (inicializado) return;
  inicializado = true;
  session = contexto.session || await requireSession();
  if (!session) return;

  perfilAtual = contexto.perfilAtual || await getCurrentProfile(session);
  usuarioId = contexto.usuarioId || getUserId(session);
  espacoAtivo = contexto.espacoAtivo || await getEspacoAtivo();
  membros = contexto.membros || await getMembrosDoEspaco(espacoAtivo.id);
  participantes.clear();
  membros.forEach(membro => participantes.add(membro.usuario_id));
  aplicarTema(perfilAtual?.tema, perfilAtual?.cor_destaque);

  if (!contexto.embedded) {
    renderNavbar(document.getElementById('navbar'), {
      activePage: 'recommend',
      modoAtivo: normalizarModoAtivo(membros, usuarioId),
      perfilAtual,
      membros,
      usuarioId,
      onModoChange: () => {}
    });
  }

  ligarEventos();

  try {
    [desejos, historico, streamingsPorUsuario] = await Promise.all([
      getListaDesejos(),
      contexto.historicoInicial
        ? Promise.resolve(contexto.historicoInicial)
        : getAllTitulosComAvaliacoes(),
      getStreamingsDosUsuarios(membros.map(membro => membro.usuario_id))
    ]);
    historicoEnriquecido = historico;
    iniciarStreamings();
    renderStreamings();
    renderReferencias();
    atualizarContextoDaBusca();
    const pendente = await getSessaoPendente();
    if (pendente) renderSessao(pendente);
  } catch (error) {
    console.error(error);
    showToast('Não foi possível preparar o recomendador.', 'error');
  }
}

function ligarEventos() {
  document.querySelectorAll('[data-source]').forEach(button => button.addEventListener('click', () => {
    origem = button.dataset.source;
    ativarUnico('[data-source]', button);
    atualizarContextoDaBusca();
  }));
  document.querySelectorAll('[data-type]').forEach(button => button.addEventListener('click', () => {
    tipo = button.dataset.type;
    referencia = null;
    document.getElementById('recommend-reference').value = '';
    ativarUnico('[data-type]', button);
    document.getElementById('series-mode-field').hidden = tipo !== 'serie';
    renderReferencias();
    atualizarContextoDaBusca();
  }));
  document.querySelectorAll('[data-mood]').forEach(button => button.addEventListener('click', () => {
    clima = button.dataset.mood;
    ativarUnico('[data-mood]', button);
  }));
  document.querySelectorAll('[data-series-mode]').forEach(button => button.addEventListener('click', () => {
    modoSerie = button.dataset.seriesMode;
    ativarUnico('[data-series-mode]', button);
    atualizarContextoDaBusca();
  }));

  document.getElementById('recommend-reference').addEventListener('input', atualizarReferencia);
  document.getElementById('recommend-streamings').addEventListener('click', event => {
    const button = event.target.closest('[data-streaming]');
    if (!button) return;
    const slug = button.dataset.streaming;
    if (streamingsAtivos.has(slug)) streamingsAtivos.delete(slug);
    else streamingsAtivos.add(slug);
    button.classList.toggle('active', streamingsAtivos.has(slug));
    button.setAttribute('aria-pressed', String(streamingsAtivos.has(slug)));
  });

  document.getElementById('recommend-find').addEventListener('click', () => buscarRecomendacoes({ reiniciar: true }));
  document.querySelector('[data-action="back"]').addEventListener('click', () => mostrarEtapa('setup'));
  document.getElementById('recommend-more').addEventListener('click', mostrarOutras);
  document.getElementById('recommend-raffle').addEventListener('click', sortearFinalista);
  document.getElementById('recommend-finalists').addEventListener('click', event => {
    const id = event.target.closest('[data-choose]')?.dataset.choose;
    if (id) escolherTitulo(id);
  });
}

function ativarUnico(seletor, ativo) {
  document.querySelectorAll(seletor).forEach(button => button.classList.toggle('active', button === ativo));
}

function iniciarStreamings() {
  streamingsAtivos.clear();
  membros.forEach(membro => {
    (streamingsPorUsuario[membro.usuario_id] || []).forEach(slug => streamingsAtivos.add(slug));
  });
}

function renderStreamings() {
  const container = document.getElementById('recommend-streamings');
  container.innerHTML = SERVICOS_STREAMING.map(servico => {
    const ativo = streamingsAtivos.has(servico.slug);
    return `<button class="streaming-choice ${ativo ? 'active' : ''}" data-streaming="${escapeHtml(servico.slug)}" aria-pressed="${ativo}" type="button">${escapeHtml(servico.nome)}</button>`;
  }).join('');
}

function renderReferencias() {
  const opcoes = historico
    .filter(titulo => titulo.tipo === tipo && titulo.tmdb_id)
    .sort((a, b) => melhorNota(b) - melhorNota(a) || a.nome.localeCompare(b.nome, 'pt-BR'));
  document.getElementById('recommend-reference-options').innerHTML = opcoes
    .map(titulo => `<option value="${escapeHtml(titulo.nome)}"></option>`)
    .join('');
  document.getElementById('recommend-reference').placeholder = opcoes.length
    ? 'Busque um título do histórico'
    : `Nenhum${tipo === 'filme' ? ' filme' : 'a série'} no histórico`;
}

function atualizarReferencia(event) {
  const valor = normalizarTexto(event.target.value);
  referencia = historico.find(titulo => titulo.tipo === tipo && normalizarTexto(titulo.nome) === valor) || null;
  const dica = document.getElementById('recommend-reference-hint');
  dica.textContent = referencia
    ? `“${referencia.nome}” terá o maior peso nesta busca.`
    : 'O histórico completo continuará sendo considerado.';
}

function atualizarContextoDaBusca() {
  const continuar = tipo === 'serie' && modoSerie === 'continuar';
  document.querySelectorAll('[data-source]').forEach(button => {
    button.disabled = continuar;
  });
  const hint = document.getElementById('recommend-source-hint');
  if (continuar) {
    hint.textContent = 'Para continuar uma série, a busca usa somente o histórico do espaço.';
    return;
  }
  hint.textContent = ({
    lista: 'A busca usará somente os títulos da lista “Para assistir”.',
    novas: 'A busca procurará sugestões novas relacionadas ao histórico.',
    'tanto-faz': 'O resultado terá opções da lista e sugestões novas.'
  })[origem];
}

async function buscarRecomendacoes({ reiniciar }) {
  if (reiniciar) {
    idsExibidos = new Set();
    paginaDescoberta = 1;
  }
  mostrarEtapa('results');
  alternarCarregamento(true);

  try {
    const continuarSerie = tipo === 'serie' && modoSerie === 'continuar';
    const referenciaCompleta = await enriquecerReferencia();
    historicoEnriquecido = await prepararHistorico();

    if (continuarSerie) {
      const candidatos = await enriquecerTitulos(
        historico.filter(titulo => titulo.tipo === 'serie'),
        'historico'
      );
      finalistas = recomendar(candidatos, referenciaCompleta, 3);
    } else if (origem === 'lista') {
      finalistas = recomendar(await carregarLista(), referenciaCompleta, 3);
    } else if (origem === 'novas') {
      finalistas = recomendar(await carregarNovas(referenciaCompleta), referenciaCompleta, 3);
    } else {
      const [lista, novas] = await Promise.all([
        carregarLista(),
        carregarNovas(referenciaCompleta)
      ]);
      finalistas = misturarOrigens(
        recomendar(lista, referenciaCompleta, 6),
        recomendar(novas, referenciaCompleta, 6),
        { limite: 3 }
      );
    }
    renderResultados({ continuarSerie, referenciaCompleta });
  } catch (error) {
    console.error(error);
    renderVazio('Não foi possível buscar as opções', 'Confira sua conexão e tente novamente.');
  } finally {
    alternarCarregamento(false);
  }
}

async function carregarLista() {
  return enriquecerTitulos(desejos, 'lista');
}

async function carregarNovas(referenciaCompleta) {
  const [compativeis, descobertos] = await Promise.all([
    getSugestoesDeUsuariosCompativeis(espacoAtivo.id, tipo, 12)
      .then(getTitlesByTmdbIds)
      .catch(error => {
        console.warn('[compatibilidade]', error);
        return [];
      }),
    discoverTitles({
      tipo,
      clima,
      provedores: streamingsSelecionados(),
      referencia: referenciaCompleta,
      page: paginaDescoberta
    })
  ]);

  const combinados = new Map();
  [...descobertos, ...compativeis].forEach(titulo => {
    const chave = chaveTitulo(titulo);
    combinados.set(chave, { ...(combinados.get(chave) || {}), ...titulo });
  });

  return [...combinados.values()]
    .map(mesclarComHistoricoDoEspaco)
    .filter(Boolean)
    .filter(titulo => !desejos.some(item => mesmaObra(item, titulo)))
    .filter(titulo => !idsExibidos.has(chaveTitulo(titulo)))
    .map(titulo => ({ ...titulo, origem_recomendacao: 'nova' }));
}

async function enriquecerTitulos(lista, origemTitulo) {
  const relevantes = lista
    .filter(titulo => titulo.tipo === tipo)
    .filter(titulo => !idsExibidos.has(chaveTitulo(titulo)));
  return Promise.all(relevantes.map(async titulo => {
    if (!titulo.tmdb_id) return { ...titulo, origem_recomendacao: origemTitulo, duracao_minutos: null, provedores: [] };
    try {
      const detalhes = await obterDetalhes(titulo.tmdb_id, titulo.tipo);
      return { ...titulo, ...detalhes, id: titulo.id, origem_recomendacao: origemTitulo };
    } catch {
      return { ...titulo, origem_recomendacao: origemTitulo, duracao_minutos: null, provedores: [] };
    }
  }));
}

async function enriquecerReferencia() {
  if (!referencia?.tmdb_id) return referencia;
  try {
    return { ...referencia, ...await obterDetalhes(referencia.tmdb_id, referencia.tipo), id: referencia.id };
  } catch {
    return referencia;
  }
}

async function prepararHistorico() {
  const prioritarios = historico
    .filter(titulo => titulo.tipo === tipo && titulo.tmdb_id)
    .sort((a, b) => melhorNota(b) - melhorNota(a))
    .slice(0, 8);
  const enriquecidos = await Promise.all(prioritarios.map(async titulo => {
    try {
      return { ...titulo, ...await obterDetalhes(titulo.tmdb_id, titulo.tipo), id: titulo.id };
    } catch {
      return titulo;
    }
  }));
  const porId = new Map(enriquecidos.map(titulo => [titulo.id, titulo]));
  return historico.map(titulo => porId.get(titulo.id) || titulo);
}

function obterDetalhes(tmdbId, tipoTitulo) {
  const chave = `${tipoTitulo}:${tmdbId}`;
  if (!detalhesCache.has(chave)) detalhesCache.set(chave, getDetails(tmdbId, tipoTitulo));
  return detalhesCache.get(chave);
}

function recomendar(candidatos, referenciaCompleta, limite) {
  return recomendarDaLista({
    candidatos,
    historico: historicoEnriquecido,
    participantes: [...participantes],
    tipo,
    clima,
    streamings: streamingsSelecionados(),
    referencia: referenciaCompleta,
    limite
  });
}

function renderResultados({ continuarSerie = false, referenciaCompleta = referencia } = {}) {
  if (!finalistas.length) {
    const mensagem = continuarSerie
      ? 'Nenhuma série iniciada combina com essa busca.'
      : origem === 'lista'
        ? 'Nenhum título da lista combina com os filtros escolhidos.'
        : 'Nenhuma sugestão compatível foi encontrada agora.';
    renderVazio('Nada encontrado', `${mensagem} Altere as escolhas e tente novamente.`);
    return;
  }

  document.getElementById('recommend-empty').hidden = true;
  document.getElementById('recommend-finalists').hidden = false;
  document.getElementById('recommend-more').hidden = false;
  document.getElementById('recommend-raffle').hidden = false;
  document.querySelector('.results-heading h2').textContent = continuarSerie
    ? 'Três séries para continuar'
    : origem === 'lista'
      ? 'Três opções da sua lista'
      : origem === 'novas'
        ? 'Três sugestões novas'
        : 'Três opções para hoje';
  document.getElementById('results-summary').textContent = resumoBusca(referenciaCompleta);
  document.getElementById('recommend-finalists').innerHTML = finalistas
    .map(titulo => renderFinalista(titulo, referenciaCompleta))
    .join('');
}

function renderFinalista(titulo, referenciaCompleta) {
  const selecionados = streamingsSelecionados();
  const provedor = (titulo.provedores || []).find(item => selecionados.includes(item.slug))
    || titulo.provedores?.[0];
  const criador = membros.find(membro => membro.usuario_id === titulo.criado_por);
  const motivos = motivosDaRecomendacao(titulo, {
    historico: historicoEnriquecido,
    participantes: [...participantes],
    referencia: referenciaCompleta,
    clima
  });
  return `<article class="finalist-card" data-finalist="${escapeHtml(chaveTitulo(titulo))}">
    <div class="finalist-poster">
      <img src="${safeImageSrc(titulo.backdrop_url || titulo.capa_url)}" alt="Capa de ${escapeHtml(titulo.nome)}" />
      <span class="finalist-source">${rotuloOrigemFinalista(titulo)}</span>
    </div>
    <div class="finalist-body">
      <h3>${escapeHtml(titulo.nome)}</h3>
      <div class="finalist-meta">${titulo.ano || '—'} · ${formatarDuracao(titulo.duracao_minutos)} · ${titulo.tipo === 'filme' ? 'Filme' : 'Série'}</div>
      <p class="finalist-synopsis">${escapeHtml(titulo.sinopse || 'Sinopse não informada.')}</p>
      <div class="finalist-provider">${provedor ? `✓ Disponível no ${escapeHtml(provedor.nome)}` : 'Disponibilidade não informada'}</div>
      ${origemFinalista(titulo, criador)}
      ${titulo.assistido_por?.length ? `<div class="finalist-watched">Já assistido por ${escapeHtml(titulo.assistido_por.join(', '))}</div>` : ''}
      <div class="finalist-reasons">${motivos.map(motivo => `<span class="finalist-reason">${escapeHtml(motivo)}</span>`).join('')}</div>
      <button class="btn btn-primary" data-choose="${escapeHtml(chaveTitulo(titulo))}" type="button">Escolher este</button>
    </div>
  </article>`;
}

function renderVazio(titulo, texto) {
  document.getElementById('recommend-finalists').hidden = true;
  document.getElementById('recommend-more').hidden = true;
  document.getElementById('recommend-raffle').hidden = true;
  const vazio = document.getElementById('recommend-empty');
  vazio.hidden = false;
  vazio.innerHTML = `<h3>${escapeHtml(titulo)}</h3><p>${escapeHtml(texto)}</p><button class="btn btn-secondary" data-empty-back type="button">Alterar escolhas</button>`;
  vazio.querySelector('[data-empty-back]').addEventListener('click', () => mostrarEtapa('setup'));
}

async function mostrarOutras() {
  finalistas.forEach(titulo => idsExibidos.add(chaveTitulo(titulo)));
  paginaDescoberta += 1;
  const quantidadeAnterior = idsExibidos.size;
  await buscarRecomendacoes({ reiniciar: false });
  if (!finalistas.length && quantidadeAnterior) {
    idsExibidos = new Set();
    paginaDescoberta = 1;
    showToast('Essas eram todas as opções compatíveis. Voltamos ao início da seleção.');
    await buscarRecomendacoes({ reiniciar: false });
  }
}

function sortearFinalista() {
  if (!finalistas.length) return;
  const cards = [...document.querySelectorAll('.finalist-card')];
  cards.forEach(card => {
    card.classList.remove('roulette-winner', 'roulette-active');
    card.querySelector('.winner-badge')?.remove();
  });

  const vencedor = Math.floor(Math.random() * cards.length);
  let passo = 0;
  const reduzirMovimento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const total = reduzirMovimento ? cards.length : cards.length * 4 + vencedor + 1;
  const timer = window.setInterval(() => {
    cards.forEach(card => card.classList.remove('roulette-active'));
    cards[passo % cards.length].classList.add('roulette-active');
    passo += 1;
    if (passo >= total) {
      window.clearInterval(timer);
      cards.forEach(card => card.classList.remove('roulette-active'));
      const card = cards[vencedor];
      card.classList.add('roulette-winner');
      const selo = document.createElement('span');
      selo.className = 'winner-badge';
      selo.textContent = 'Sorteado para hoje';
      card.appendChild(selo);
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, reduzirMovimento ? 20 : 130);
}

async function escolherTitulo(chave) {
  let titulo = finalistas.find(item => chaveTitulo(item) === chave);
  if (!titulo) return;
  const botao = [...document.querySelectorAll('[data-choose]')]
    .find(item => item.dataset.choose === chave);
  if (botao) botao.disabled = true;

  try {
    if (!titulo.id) titulo = await criarTitulo({ ...titulo, quero_assistir: true }, usuarioId);
    const sessaoPendente = await criarSessaoPendente({ titulo, participantes: [...participantes] });
    renderSessao(sessaoPendente);
  } catch (error) {
    console.error(error);
    showToast('Não foi possível preparar a sessão.', 'error');
    if (botao) botao.disabled = false;
  }
}

function renderSessao(sessaoPendente) {
  const titulo = sessaoPendente.titulo;
  const participacoes = sessaoPendente.participantes || [];
  const ids = participacoes.map(item => item.usuario_id || item);
  const nomes = ids.map(id => nomeMembro(membros.find(membro => membro.usuario_id === id))).filter(Boolean);
  const minhaParticipacao = participacoes.find(item => (item.usuario_id || item) === usuarioId);
  const possoConfirmar = Boolean(minhaParticipacao) && !minhaParticipacao?.confirmado_em;
  mostrarEtapa('session');
  document.getElementById('recommend-session').innerHTML = `<div class="session-layout">
    <article class="recommend-panel">
      <div class="session-status">
        <span class="session-status-icon">✓</span>
        <div><span class="eyebrow">Escolha feita</span><h2>${escapeHtml(titulo?.nome || 'Título escolhido')}</h2>
        <p>A sessão foi preparada, mas ainda não entrou no histórico.</p></div>
      </div>
      <div class="session-data">
        <div><span>Quando</span><strong>Hoje</strong></div>
        <div><span>Participantes</span><strong>${escapeHtml(nomes.join(' e ') || nomeMembro(membros.find(m => m.usuario_id === usuarioId)))}</strong></div>
        <div><span>Status</span><strong>Sessão pendente</strong></div>
      </div>
      <div class="session-actions">
        ${possoConfirmar
          ? `<a class="btn btn-primary" href="edit.html?edit=${encodeURIComponent(sessaoPendente.titulo_id || titulo?.id)}&sessao=${encodeURIComponent(sessaoPendente.id)}">Confirmar e avaliar</a>`
          : `<a class="btn btn-primary" href="details.html?id=${encodeURIComponent(sessaoPendente.titulo_id || titulo?.id)}">Ver título</a>`}
        <button class="btn btn-secondary" data-restart type="button">Escolher outro</button>
      </div>
    </article>
    <aside class="recommend-panel session-side">
      <span class="eyebrow">Na próxima visita</span>
      <h3>Sessão pendente</h3>
      <p>Um aviso discreto aparecerá no Início. O título só será marcado como assistido depois da confirmação e da avaliação obrigatória.</p>
    </aside>
  </div>`;
  document.querySelector('[data-restart]').addEventListener('click', () => mostrarEtapa('setup'));
}

function mostrarEtapa(etapa) {
  document.querySelectorAll('[data-step]').forEach(section => { section.hidden = section.dataset.step !== etapa; });
  document.querySelectorAll('[data-progress]').forEach(item => item.classList.toggle('active', item.dataset.progress === etapa));
}

function alternarCarregamento(carregando) {
  document.getElementById('recommend-loading').hidden = !carregando;
  if (carregando) {
    document.getElementById('recommend-finalists').hidden = true;
    document.getElementById('recommend-empty').hidden = true;
  }
}

function resumoBusca(referenciaCompleta) {
  const climaTexto = ({
    rir: 'para rir',
    chorar: 'para chorar',
    pensar: 'para pensar',
    tensao: 'com tensão',
    acao: 'com ação',
    medo: 'para sentir medo',
    leve: 'para relaxar',
    qualquer: 'para qualquer clima'
  })[clima];
  const fonte = tipo === 'serie' && modoSerie === 'continuar'
    ? 'Do histórico'
    : ({ lista: 'Da lista', novas: 'Sugestões novas', 'tanto-faz': 'Lista e sugestões novas' })[origem];
  const base = referenciaCompleta ? ` · parecido com “${referenciaCompleta.nome}”` : '';
  const servicos = streamingsSelecionados();
  const streaming = servicos.length ? ` · ${servicos.length} streaming${servicos.length === 1 ? '' : 's'}` : ' · todos os streamings';
  return `${fonte} · ${tipo === 'filme' ? 'filmes' : 'séries'} ${climaTexto}${base}${streaming}.`;
}

function mesclarComHistoricoDoEspaco(titulo) {
  const local = historico.find(item => mesmaObra(item, titulo));
  if (!local) return titulo;
  const assistiram = (local.avaliacoesMembros || [])
    .filter(item => item.avaliacao)
    .map(item => nomeMembro(item.membro))
    .filter(Boolean);
  if (assistiram.length >= membros.length) return null;
  return { ...titulo, ...local, ...titulo, id: local.id, assistido_por: assistiram };
}

function origemFinalista(titulo, criador) {
  if (titulo.origem_recomendacao === 'nova') return '<div class="finalist-origin">Uma descoberta relacionada ao histórico</div>';
  if (titulo.origem_recomendacao === 'historico') return '<div class="finalist-origin">Já registrada no histórico do espaço</div>';
  return criador
    ? `<div class="finalist-origin">Adicionado por ${escapeHtml(nomeMembro(criador))}</div>`
    : '<div class="finalist-origin">Da lista do espaço</div>';
}

function rotuloOrigemFinalista(titulo) {
  if (titulo.origem_recomendacao === 'nova') return 'Sugestão nova';
  if (titulo.origem_recomendacao === 'historico') return 'Do histórico';
  return 'Da sua lista';
}

function streamingsSelecionados() {
  return [...streamingsAtivos];
}

function melhorNota(titulo) {
  const notas = (titulo.avaliacoesMembros || [])
    .filter(item => item.avaliacao)
    .map(item => Number(item.avaliacao.nota));
  return notas.length ? Math.max(...notas) : -1;
}

function mesmaObra(a, b) {
  return a.tipo === b.tipo && a.tmdb_id && b.tmdb_id && String(a.tmdb_id) === String(b.tmdb_id);
}

function chaveTitulo(titulo) {
  return `${titulo.tipo}:${titulo.tmdb_id || titulo.id}`;
}

function nomeMembro(membro) {
  return membro?.perfil?.nome_exibicao || membro?.perfil?.nome || '';
}

function normalizarTexto(valor) {
  return String(valor || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}
