import { requireSession, getCurrentProfile, getUserId } from '../auth.js';
import { getEspacoAtivo, getMembrosDoEspaco } from '../espacos.js';
import { getListaDesejos, getAllTitulosComAvaliacoes, criarTitulo } from '../titulos.js';
import { getDetails, discoverTitles } from '../tmdb.js';
import { getStreamingsDosUsuarios, SERVICOS_STREAMING } from '../streamings.js';
import { criarSessaoPendente, getSessaoPendente } from '../sessoes.js';
import { recomendarDaLista, formatarDuracao } from '../recommendations.js';
import { normalizarModoAtivo, aplicarTema } from '../themes.js';
import { renderNavbar, safeImageSrc, escapeHtml, showToast, confirmarAcao } from '../ui.js';

let session;
let perfilAtual;
let espacoAtivo;
let membros = [];
let usuarioId;
let desejos = [];
let historico = [];
let streamingsPorUsuario = {};
let tipo = 'filme';
let clima = 'rir';
let modoSerie = 'nova';
let finalistas = [];
let externos = false;
let idsExibidos = new Set();
const participantes = new Set();
const detalhesCache = new Map();

init();

async function init() {
  session = await requireSession();
  if (!session) return;

  perfilAtual = await getCurrentProfile(session);
  usuarioId = getUserId(session);
  espacoAtivo = await getEspacoAtivo();
  membros = await getMembrosDoEspaco(espacoAtivo.id);
  participantes.add(usuarioId);
  aplicarTema(perfilAtual?.tema, perfilAtual?.cor_destaque);

  renderNavbar(document.getElementById('navbar'), {
    activePage: 'recommend',
    modoAtivo: normalizarModoAtivo(membros, usuarioId),
    perfilAtual,
    membros,
    usuarioId,
    onModoChange: () => {}
  });

  ligarEventos();
  renderMembros();

  try {
    [desejos, historico, streamingsPorUsuario] = await Promise.all([
      getListaDesejos(),
      getAllTitulosComAvaliacoes(),
      getStreamingsDosUsuarios(membros.map(membro => membro.usuario_id))
    ]);
    renderStreamings();
    const pendente = await getSessaoPendente();
    if (pendente) renderSessao(pendente);
  } catch (error) {
    console.error(error);
    showToast('Não foi possível preparar o recomendador.', 'error');
  }
}

function ligarEventos() {
  document.querySelectorAll('[data-type]').forEach(button => button.addEventListener('click', () => {
    tipo = button.dataset.type;
    ativarUnico('[data-type]', button);
    document.getElementById('series-mode-field').hidden = tipo !== 'serie';
  }));
  document.querySelectorAll('[data-mood]').forEach(button => button.addEventListener('click', () => {
    clima = button.dataset.mood;
    ativarUnico('[data-mood]', button);
  }));
  document.querySelectorAll('[data-series-mode]').forEach(button => button.addEventListener('click', () => {
    modoSerie = button.dataset.seriesMode;
    ativarUnico('[data-series-mode]', button);
  }));

  document.getElementById('recommend-find').addEventListener('click', buscarNaLista);
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

function renderMembros() {
  const container = document.getElementById('recommend-members');
  container.innerHTML = membros.map(membro => {
    const nome = nomeMembro(membro);
    const avatar = membro.perfil?.avatar_url;
    const selecionado = membro.usuario_id === usuarioId;
    return `<button class="choice-pill member-choice ${selecionado ? 'active' : ''}" data-member="${escapeHtml(membro.usuario_id)}" type="button">
      ${avatar ? `<img src="${safeImageSrc(avatar)}" alt="" />` : `<span aria-hidden="true">${escapeHtml(nome.charAt(0))}</span>`}
      ${escapeHtml(nome)}${selecionado ? ' (você)' : ''}
    </button>`;
  }).join('');

  container.querySelectorAll('[data-member]').forEach(button => button.addEventListener('click', () => {
    const id = button.dataset.member;
    if (id === usuarioId) return;
    if (participantes.has(id)) participantes.delete(id);
    else participantes.add(id);
    button.classList.toggle('active', participantes.has(id));
    renderStreamings();
  }));
}

function renderStreamings() {
  const slugs = streamingsSelecionados();
  const container = document.getElementById('recommend-streamings');
  if (!slugs.length) {
    container.innerHTML = '<p class="streaming-empty">Nenhum serviço cadastrado. <a href="profile.html#streamings">Cadastrar no perfil</a>; por enquanto a busca considerará qualquer disponibilidade.</p>';
    return;
  }
  container.innerHTML = slugs.map(slug => {
    const nome = SERVICOS_STREAMING.find(item => item.slug === slug)?.nome || slug;
    return `<span class="streaming-tag">✓ ${escapeHtml(nome)}</span>`;
  }).join('');
}

function streamingsSelecionados() {
  return [...new Set([...participantes].flatMap(id => streamingsPorUsuario[id] || []))];
}

async function buscarNaLista() {
  mostrarEtapa('results');
  alternarCarregamento(true);
  externos = false;
  idsExibidos = new Set();
  try {
    const continuarSerie = tipo === 'serie' && modoSerie === 'continuar';
    const origem = continuarSerie
      ? historico.filter(titulo => titulo.tipo === 'serie')
      : desejos;
    const candidatos = await enriquecerTitulos(origem);
    finalistas = recomendar(candidatos);
    renderResultados({ continuarSerie });
  } catch (error) {
    console.error(error);
    renderVazio('Não foi possível buscar as opções', 'Confira sua conexão e tente novamente.', false);
  } finally {
    alternarCarregamento(false);
  }
}

async function enriquecerTitulos(lista) {
  const relevantes = lista.filter(titulo => titulo.tipo === tipo && !idsExibidos.has(String(titulo.id)));
  const respostas = await Promise.all(relevantes.map(async titulo => {
    if (!titulo.tmdb_id) return { ...titulo, duracao_minutos: null, provedores: [] };
    const chave = `${titulo.tipo}:${titulo.tmdb_id}`;
    if (!detalhesCache.has(chave)) detalhesCache.set(chave, getDetails(titulo.tmdb_id, titulo.tipo));
    try {
      return { ...titulo, ...(await detalhesCache.get(chave)) };
    } catch {
      return { ...titulo, duracao_minutos: null, provedores: [] };
    }
  }));
  return respostas;
}

function recomendar(candidatos) {
  return recomendarDaLista({
    candidatos,
    historico,
    participantes: [...participantes],
    tipo,
    clima,
    streamings: streamingsSelecionados()
  });
}

function renderResultados({ continuarSerie = tipo === 'serie' && modoSerie === 'continuar' } = {}) {
  if (!finalistas.length) {
    if (continuarSerie) {
      renderVazio(
        'Nenhuma série do histórico combina com essa busca',
        'Tente aumentar o tempo, mudar o clima ou escolher “Começar uma nova”.',
        false
      );
      return;
    }
    renderVazio(
      'Nada da lista combina com essa busca',
      'Podemos procurar sugestões novas fora da lista, mas só faremos isso com sua permissão.',
      true
    );
    return;
  }

  document.getElementById('recommend-empty').hidden = true;
  document.getElementById('recommend-finalists').hidden = false;
  document.getElementById('recommend-more').hidden = false;
  document.getElementById('recommend-raffle').hidden = false;
  document.querySelector('.results-heading h2').textContent = continuarSerie
    ? 'Três séries para continuar'
    : 'Três opções da sua lista';
  document.getElementById('results-summary').textContent = resumoBusca();
  document.getElementById('recommend-finalists').innerHTML = finalistas.map(renderFinalista).join('');
}

function renderFinalista(titulo) {
  const provedor = (titulo.provedores || []).find(item => streamingsSelecionados().includes(item.slug))
    || titulo.provedores?.[0];
  const criador = membros.find(membro => membro.usuario_id === titulo.criado_por);
  return `<article class="finalist-card" data-finalist="${escapeHtml(String(titulo.id || titulo.tmdb_id))}">
    <div class="finalist-poster">
      <img src="${safeImageSrc(titulo.backdrop_url || titulo.capa_url)}" alt="Capa de ${escapeHtml(titulo.nome)}" />
      <span class="finalist-source">${rotuloOrigemFinalista()}</span>
    </div>
    <div class="finalist-body">
      <h3>${escapeHtml(titulo.nome)}</h3>
      <div class="finalist-meta">${titulo.ano || '—'} · ${formatarDuracao(titulo.duracao_minutos)} · ${titulo.tipo === 'filme' ? 'Filme' : 'Série'}</div>
      <p class="finalist-synopsis">${escapeHtml(titulo.sinopse || 'Sinopse não informada.')}</p>
      <div class="finalist-provider">${provedor ? `✓ Disponível no ${escapeHtml(provedor.nome)}` : 'Disponibilidade não informada'}</div>
      ${origemFinalista(titulo, criador)}
      <button class="btn btn-primary" data-choose="${escapeHtml(String(titulo.id || titulo.tmdb_id))}" type="button">Escolher este</button>
    </div>
  </article>`;
}

function renderVazio(titulo, texto, permitirExternos) {
  document.getElementById('recommend-finalists').hidden = true;
  document.getElementById('recommend-more').hidden = true;
  document.getElementById('recommend-raffle').hidden = true;
  const vazio = document.getElementById('recommend-empty');
  vazio.hidden = false;
  vazio.innerHTML = `<h3>${escapeHtml(titulo)}</h3><p>${escapeHtml(texto)}</p>
    ${permitirExternos ? '<button class="btn btn-primary" id="discover-new" type="button">Procurar sugestões novas</button>' : ''}`;
  vazio.querySelector('#discover-new')?.addEventListener('click', buscarExternosComPermissao);
}

async function buscarExternosComPermissao() {
  const permitido = await confirmarAcao({
    titulo: 'Procurar fora da lista?',
    mensagem: 'O Cine Diário buscará três sugestões novas que combinem com suas respostas.',
    textoConfirmar: 'Procurar',
    destrutivo: false
  });
  if (!permitido) return;

  await buscarExternos();
}

async function mostrarOutras() {
  finalistas.forEach(titulo => idsExibidos.add(String(titulo.id || titulo.tmdb_id)));
  alternarCarregamento(true);
  try {
    if (externos) {
      const descobertos = await descobrirExternos();
      finalistas = recomendar(descobertos.filter(titulo => !idsExibidos.has(String(titulo.tmdb_id))));
    } else {
      const origem = tipo === 'serie' && modoSerie === 'continuar'
        ? historico.filter(titulo => titulo.tipo === 'serie')
        : desejos;
      finalistas = recomendar(await enriquecerTitulos(origem));
    }
    if (!finalistas.length) {
      idsExibidos.clear();
      showToast('Essas eram todas as opções compatíveis. Voltamos ao início da seleção.');
      return externos ? buscarExternos() : buscarNaLista();
    }
    renderResultados();
  } finally {
    alternarCarregamento(false);
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
  const total = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? cards.length : cards.length * 4 + vencedor + 1;
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
  }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 20 : 130);
}

async function escolherTitulo(id) {
  let titulo = finalistas.find(item => String(item.id || item.tmdb_id) === id);
  if (!titulo) return;
  const botao = [...document.querySelectorAll('[data-choose]')]
    .find(item => item.dataset.choose === id);
  if (botao) botao.disabled = true;

  try {
    if (externos && !titulo.id) {
      titulo = await criarTitulo({ ...titulo, quero_assistir: true }, usuarioId);
    }
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

function resumoBusca() {
  const climaTexto = ({ rir: 'para rir', emocao: 'com emoção', tensao: 'com tensão', pensar: 'para pensar', qualquer: 'para qualquer clima' })[clima];
  return `${tipo === 'filme' ? 'Filmes' : 'Séries'} ${climaTexto}.`;
}

function nomeMembro(membro) {
  return membro?.perfil?.nome_exibicao || membro?.perfil?.nome || '';
}

function origemFinalista(titulo, criador) {
  if (externos) return '<div class="finalist-origin">Uma descoberta para o espaço</div>';
  if (tipo === 'serie' && modoSerie === 'continuar') {
    return '<div class="finalist-origin">Já registrada no histórico do espaço</div>';
  }
  return criador
    ? `<div class="finalist-origin">Adicionado por ${escapeHtml(nomeMembro(criador))}</div>`
    : '<div class="finalist-origin">Da lista do espaço</div>';
}

function rotuloOrigemFinalista() {
  if (externos) return 'Sugestão nova';
  return tipo === 'serie' && modoSerie === 'continuar' ? 'Do histórico' : 'Da sua lista';
}

async function descobrirExternos() {
  return discoverTitles({
    tipo,
    clima,
    provedores: streamingsSelecionados()
  });
}

async function buscarExternos() {
  alternarCarregamento(true);
  try {
    externos = true;
    finalistas = recomendar(await descobrirExternos());
    renderResultados();
  } catch (error) {
    console.error(error);
    renderVazio('Não foi possível buscar novidades', 'Tente novamente daqui a pouco.', false);
  } finally {
    alternarCarregamento(false);
  }
}
