// js/pages/home.js
import { requireSession, getProfileFromSession } from '../auth.js';
import { getAllTitulosComAvaliacoes } from '../titulos.js';
import { calcularEstatisticas, calcularDestaques, formatarNota } from '../statistics.js';
import { getModoAtivo, setModoAtivo, aplicarTema } from '../themes.js';
import { renderNavbar, placeholderCapa, escapeHtml, showToast } from '../ui.js';

init();

async function init() {
  const session = await requireSession();
  if (!session) return;

  const perfilLogado = getProfileFromSession(session);
  let modoAtivo = getModoAtivo();
  if (!sessionStorage.getItem('modo_definido') && perfilLogado) {
    modoAtivo = perfilLogado;
    setModoAtivo(modoAtivo);
    sessionStorage.setItem('modo_definido', '1');
  }
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
  const stats = calcularEstatisticas(titulos);
  document.getElementById('hero-subtitle').textContent =
    stats.totalTitulos > 0
      ? `${stats.totalTitulos} títulos registrados até agora`
      : 'Ainda não há títulos registrados — que tal adicionar o primeiro?';

  const grid = document.getElementById('stats-grid');
  grid.innerHTML = `
    ${statCard('🎬', stats.totalFilmes, 'filmes avaliados')}
    ${statCard('📺', stats.totalSeries, 'séries avaliadas')}
    ${statCard('🎞️', stats.totalTitulos, 'títulos ao todo')}
    ${statCard('✨', stats.assistiriamos, 'assistiríamos novamente')}
    ${statCard('🎥', stats.naoAssistiriamos, 'não assistiríamos novamente')}
    ${statCard('⭐', stats.mediaGeral !== null ? formatarNota(stats.mediaGeral) + '/10' : '—', 'média geral do casal')}
  `;
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
      <img src="${t.capa_url || placeholderCapa()}" alt="Capa de ${escapeHtml(t.nome)}" />
      <div>
        <div class="highlight-label">${label}</div>
        <div class="highlight-title">${escapeHtml(t.nome)}</div>
        <div class="highlight-meta">${metaFn(t)}</div>
      </div>
    </a>
  `).join('');
}
