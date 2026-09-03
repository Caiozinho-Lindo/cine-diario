// js/pages/home.js
import { requireSession, getCurrentProfile, getUserId } from '../auth.js';
import { getAllTitulosComAvaliacoes } from '../titulos.js';
import { calcularEstatisticas, calcularDestaques, formatarNota } from '../statistics.js?v=20260831.1';
import { normalizarModoAtivo, aplicarTema, nomeDoModo } from '../themes.js';
import { renderNavbar, renderTituloCard, safeImageSrc, escapeHtml, showToast } from '../ui.js';
import { getEspacoAtivo, getMembrosDoEspaco } from '../espacos.js';
import { getSessaoPendente } from '../sessoes.js';
import { initRecommend } from './recommend.js?v=20260902.3';

let membrosEspaco = [];
let usuarioIdAtual = null;

init();

async function init() {
  const session = await requireSession();
  if (!session) return;

  const perfilAtual = await getCurrentProfile(session);
  const espacoAtivo = await getEspacoAtivo();
  membrosEspaco = await getMembrosDoEspaco(espacoAtivo.id);
  usuarioIdAtual = getUserId(session);
  const modoAtivo = normalizarModoAtivo(membrosEspaco, usuarioIdAtual);
  aplicarTema(perfilAtual?.tema, perfilAtual?.cor_destaque);
  document.getElementById('hero-title').textContent = membrosEspaco.length === 1
    ? 'Seu histórico de filmes e séries'
    : `O histórico de ${espacoAtivo.nome}`;

  renderNavbar(document.getElementById('navbar'), {
    activePage: 'home',
    modoAtivo,
    perfilAtual,
    membros: membrosEspaco,
    usuarioId: usuarioIdAtual,
    onModoChange: novoModo => {
      renderTudo(novoModo);
    }
  });

  renderSessaoPendente().catch(error => console.error('[sessão pendente]', error));

  try {
    window._titulos = await getAllTitulosComAvaliacoes();
    renderTudo(modoAtivo);
    await initRecommend({
      embedded: true,
      session,
      perfilAtual,
      espacoAtivo,
      membros: membrosEspaco,
      usuarioId: usuarioIdAtual,
      historicoInicial: window._titulos
    });
  } catch (err) {
    console.error(err);
    showToast('Erro ao carregar dados. Verifique sua conexão e configuração do Supabase.', 'error');
  }
}

async function renderSessaoPendente() {
  const sessao = await getSessaoPendente();
  if (!sessao) return;
  const titulo = sessao.titulo;
  const minhaParticipacao = (sessao.participantes || [])
    .find(item => item.usuario_id === usuarioIdAtual);
  const precisoConfirmar = Boolean(minhaParticipacao) && !minhaParticipacao.confirmado_em;
  const banner = document.getElementById('pending-session-banner');
  banner.hidden = false;
  banner.innerHTML = `
    ${titulo?.capa_url ? `<img src="${safeImageSrc(titulo.capa_url)}" alt="" />` : '<span class="pending-session-icon">🎬</span>'}
    <div class="pending-session-copy">
      <span class="eyebrow">Sessão pendente</span>
      <strong>${escapeHtml(titulo?.nome || 'Título escolhido')}</strong>
      <small>${precisoConfirmar
        ? 'Confirme depois de assistir e registre sua nota.'
        : 'Aguardando a confirmação dos participantes.'}</small>
    </div>
    ${precisoConfirmar
      ? `<a class="btn btn-primary btn-sm" href="edit.html?edit=${encodeURIComponent(sessao.titulo_id)}&sessao=${encodeURIComponent(sessao.id)}">Confirmar e avaliar</a>`
      : `<a class="btn btn-secondary btn-sm" href="details.html?id=${encodeURIComponent(sessao.titulo_id)}">Ver título</a>`}`;
}

function renderTudo(modo) {
  const titulos = window._titulos || [];
  renderStats(titulos, modo);
  renderHighlights(titulos);
  renderCatalogoRecente(titulos, modo);
}

function renderCatalogoRecente(titulos, modo) {
  const grid = document.getElementById('home-catalog-grid');
  if (!grid) return;
  const recentes = [...titulos]
    .sort((a, b) => new Date(b.criado_em || 0) - new Date(a.criado_em || 0))
    .slice(0, 6);

  if (!recentes.length) {
    grid.innerHTML = '<div class="home-catalog-empty">O catálogo ainda está vazio.</div>';
    return;
  }

  grid.innerHTML = '';
  recentes.forEach(titulo => {
    const card = renderTituloCard(titulo, modo);
    card.tabIndex = 0;
    card.setAttribute('role', 'link');
    const abrir = () => { window.location.href = `details.html?id=${encodeURIComponent(titulo.id)}`; };
    card.addEventListener('click', abrir);
    card.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        abrir();
      }
    });
    grid.appendChild(card);
  });
}

function renderStats(titulos, modo) {
  const stats = calcularEstatisticas(titulos, modo);
  const rotulos = rotulosEstatisticas(modo);
  document.getElementById('hero-subtitle').textContent =
    stats.totalTitulos > 0
      ? `${stats.totalTitulos} títulos registrados até agora`
      : 'Ainda não há títulos registrados — que tal adicionar o primeiro?';

  const grid = document.getElementById('stats-grid');
  grid.innerHTML = `
    ${statCard('🎬', stats.totalFilmes, rotulos.filmes)}
    ${statCard('📺', stats.totalSeries, rotulos.series)}
    ${statCard('🎞️', stats.totalTitulos, 'títulos ao todo')}
    ${statCard('✨', stats.assistiriamos, rotulos.assistiria)}
    ${statCard('🎥', stats.naoAssistiriamos, rotulos.naoAssistiria)}
    ${statCard('⭐', stats.mediaGeral !== null ? formatarNota(stats.mediaGeral) + '/10' : '—', rotulos.media)}
  `;
}

function rotulosEstatisticas(modo) {
  if (modo !== 'geral') {
    const nome = nomeDoModo(modo, membrosEspaco, usuarioIdAtual);
    const proprio = nome === 'Meu diário';
    return {
      filmes: proprio ? 'filmes que avaliei' : `filmes avaliados por ${nome}`,
      series: proprio ? 'séries que avaliei' : `séries avaliadas por ${nome}`,
      assistiria: proprio ? 'assistiria novamente' : `${nome} assistiria novamente`,
      naoAssistiria: proprio ? 'não assistiria novamente' : `${nome} não assistiria novamente`,
      media: proprio ? 'minha média geral' : `média geral de ${nome}`
    };
  }
  return {
    filmes: 'filmes avaliados pelo grupo',
    series: 'séries avaliadas pelo grupo',
    assistiria: 'o grupo assistiria novamente',
    naoAssistiria: 'o grupo não assistiria novamente',
    media: 'média geral do grupo'
  };
}

function statCard(icon, value, label) {
  return `
    <div class="stat-card">
      <div class="stat-icon">${icon}</div>
      <div class="stat-value">${value}</div>
      <div class="stat-label">${label}</div>
    </div>
  `;
}

function renderHighlights(titulos) {
  const d = calcularDestaques(titulos);
  const grid = document.getElementById('highlights-grid');
  const destaquesMembros = d.melhoresPorMembro.flatMap(({ membro, titulos: melhores }) => {
    const nome = membro.perfil?.nome_exibicao || membro.perfil?.nome || 'Participante';
    return highlightBlock(`⭐ Melhor avaliação de ${nome}`, melhores, titulo => {
      const avaliacao = titulo.avaliacoesMembros
        ?.find(item => item.membro.usuario_id === membro.usuario_id)?.avaliacao;
      return `Nota ${formatarNota(avaliacao?.nota)}/10`;
    });
  });

  grid.innerHTML = [
    highlightBlock('🏆 Melhor filme do grupo', d.melhorFilme, t => `Média ${formatarNota(t.media)}/10`),
    highlightBlock('📺 Melhor série do grupo', d.melhorSerie, t => `Média ${formatarNota(t.media)}/10`),
    highlightBlock('🎭 Maior discordância', d.maiorDiscordancia, t => `Diferença de ${formatarNota(t.diferenca)} pontos`),
    ...destaquesMembros,
    highlightBlock('🕒 Último título adicionado', d.ultimoAdicionado, t => new Date(t.criado_em).toLocaleDateString('pt-BR'))
  ].join('');
}

function highlightBlock(label, lista, metaFn) {
  if (!lista || !lista.length) {
    return `
      <div class="highlight-card">
        <div>
          <div class="highlight-label">${label}</div>
          <div class="highlight-empty">Ainda sem dados suficientes</div>
        </div>
      </div>
    `;
  }

  return lista.map(t => `
    <a class="highlight-card" href="details.html?id=${t.id}">
      <img src="${safeImageSrc(t.capa_url)}" alt="Capa de ${escapeHtml(t.nome)}" />
      <div>
        <div class="highlight-label">${label}</div>
        <div class="highlight-title">${escapeHtml(t.nome)}</div>
        <div class="highlight-meta">${metaFn(t)}</div>
      </div>
    </a>
  `).join('');
}
