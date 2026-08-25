// js/pages/home.js
import { requireSession, getProfileFromSession } from '../auth.js';
import { getAllTitulosComAvaliacoes } from '../titulos.js';
import { calcularEstatisticas, calcularDestaques, formatarNota } from '../statistics.js';
import { normalizarModoAtivo, aplicarTema } from '../themes.js';
import { renderNavbar, safeImageSrc, escapeHtml, showToast } from '../ui.js';

init();

async function init() {
  const session = await requireSession();
  if (!session) return;

  const perfilLogado = getProfileFromSession(session);
  const modoAtivo = normalizarModoAtivo(perfilLogado);
  aplicarTema(modoAtivo);

  renderNavbar(document.getElementById('navbar'), {
    activePage: 'home',
    modoAtivo,
    perfilLogado,
    onModoChange: novoModo => {
      aplicarTema(novoModo);
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
  if (modo === 'caio') {
    return {
      filmes: 'filmes avaliados pelo Caio',
      series: 'séries avaliadas pelo Caio',
      assistiria: 'Caio assistiria novamente',
      naoAssistiria: 'Caio não assistiria novamente',
      media: 'média geral do Caio'
    };
  }
  if (modo === 'noemy') {
    return {
      filmes: 'filmes avaliados pela Noemy',
      series: 'séries avaliadas pela Noemy',
      assistiria: 'Noemy assistiria novamente',
      naoAssistiria: 'Noemy não assistiria novamente',
      media: 'média geral da Noemy'
    };
  }
  if (modo === 'pessoal') {
    return {
      filmes: 'filmes que avaliei',
      series: 'séries que avaliei',
      assistiria: 'assistiria novamente',
      naoAssistiria: 'não assistiria novamente',
      media: 'minha média geral'
    };
  }
  return {
    filmes: 'filmes avaliados pelo casal',
    series: 'séries avaliadas pelo casal',
    assistiria: 'assistiríamos novamente',
    naoAssistiria: 'não assistiríamos novamente',
    media: 'média geral do casal'
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

  grid.innerHTML = [
    highlightBlock('🏆 Melhor filme do casal', d.melhorFilme, t => `Média ${formatarNota(t.media)}/10`),
    highlightBlock('📺 Melhor série do casal', d.melhorSerie, t => `Média ${formatarNota(t.media)}/10`),
    highlightBlock('🎭 Maior discordância', d.maiorDiscordancia, t => `Diferença de ${formatarNota(t.diferenca)} pontos`),
    highlightBlock('⭐ Melhor avaliação do Caio', d.melhorAvaliacaoCaio, t => `Nota ${formatarNota(t.avaliacaoCaio.nota)}/10`),
    highlightBlock('🌷 Melhor avaliação da Noemy', d.melhorAvaliacaoNoemy, t => `Nota ${formatarNota(t.avaliacaoNoemy.nota)}/10`),
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
