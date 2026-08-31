// js/pages/home.js
import { requireSession, getCurrentProfile, getUserId } from '../auth.js';
import { getAllTitulosComAvaliacoes } from '../titulos.js';
import { calcularEstatisticas, calcularDestaques, formatarNota } from '../statistics.js';
import { normalizarModoAtivo, aplicarTema, nomeDoModo } from '../themes.js';
import { renderNavbar, safeImageSrc, escapeHtml, showToast } from '../ui.js';
import { getEspacoAtivo, getMembrosDoEspaco } from '../espacos.js';

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

  try {
    window._titulos = await getAllTitulosComAvaliacoes();
    renderTudo(modoAtivo);
  } catch (err) {
    console.error(err);
    showToast('Erro ao carregar dados. Verifique sua conexão e configuração do Supabase.', 'error');
  }
}

function renderTudo(modo) {
  const titulos = window._titulos || [];
  renderStats(titulos, modo);
  renderHighlights(titulos);
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
