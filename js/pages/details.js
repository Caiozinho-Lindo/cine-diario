// js/pages/details.js
import { requireSession, getCurrentProfile, getProfileFromSession } from '../auth.js';
import { getTituloComAvaliacoes, excluirTitulo } from '../titulos.js';
import { formatarNota } from '../statistics.js';
import { normalizarModoAtivo, aplicarTema } from '../themes.js';
import {
  renderNavbar, statusLabel, safeImageSrc, escapeHtml,
  showToast, confirmarAcao
} from '../ui.js';

let titulo = null;
let modoAtivo = 'casal';
let abaAtiva = 'casal'; // aba de observações: caio | noemy | casal
let perfilAtual = null;

init();

async function init() {
  const session = await requireSession();
  if (!session) return;

  perfilAtual = await getCurrentProfile(session);
  const perfilLogado = getProfileFromSession(session);
  modoAtivo = normalizarModoAtivo(perfilLogado);
  aplicarTema(modoAtivo);
  abaAtiva = modoAtivo === 'caio' || modoAtivo === 'noemy' || modoAtivo === 'pessoal' ? modoAtivo : 'casal';

  renderNavbar(document.getElementById('navbar'), {
    activePage: 'details',
    modoAtivo,
    perfilLogado,
    onModoChange: novoModo => {
      modoAtivo = novoModo;
      abaAtiva = novoModo === 'caio' || novoModo === 'noemy' || novoModo === 'pessoal' ? novoModo : 'casal';
      if (titulo) render();
    }
  });

  const id = new URLSearchParams(window.location.search).get('id');
  const root = document.getElementById('details-root');

  if (!id) {
    root.innerHTML = '<div class="empty-state">Título não especificado.</div>';
    return;
  }

  try {
    titulo = await getTituloComAvaliacoes(id);
    render();
  } catch (err) {
    console.error(err);
    root.innerHTML = '<div class="empty-state">Não foi possível carregar este título.</div>';
  }
}

function render() {
  const root = document.getElementById('details-root');
  const t = titulo;

  root.innerHTML = `
    <div class="details-hero">
      ${t.backdrop_url ? `<img class="backdrop-img" src="${safeImageSrc(t.backdrop_url)}" alt="" />` : ''}
      <div class="details-hero-overlay"></div>
      <div class="details-hero-content">
        <img class="poster" src="${safeImageSrc(t.capa_url)}" alt="Capa de ${escapeHtml(t.nome)}" />
        <div class="details-hero-info">
          <h1>${escapeHtml(t.nome)}</h1>
          ${t.nome_original && t.nome_original !== t.nome ? `<div class="original-name">${escapeHtml(t.nome_original)}</div>` : ''}
          <div class="genre-tags">
            ${(t.generos || []).map(g => `<span class="genre-tag">${escapeHtml(g)}</span>`).join('')}
          </div>
        </div>
      </div>
    </div>

    <div class="details-meta-row">
      <span>${t.tipo === 'filme' ? '🎬 Filme' : '📺 Série'}</span>
      <span>${t.ano || 'Ano desconhecido'}</span>
      ${t.data_assistido ? `<span>Assistido em ${new Date(t.data_assistido + 'T00:00:00').toLocaleDateString('pt-BR')}</span>` : ''}
      <span>Cadastrado em ${new Date(t.criado_em).toLocaleDateString('pt-BR')}</span>
      ${renderStatusChip(t, modoAtivo)}
    </div>

    ${t.sinopse ? `<p>${escapeHtml(t.sinopse)}</p>` : ''}

    ${renderPendingBanner(t, modoAtivo)}

    ${modoAtivo === 'pessoal' ? '' : `<div class="details-toggle" id="review-toggle">
      <button data-toggle="caio" type="button">👤 Caio</button>
      <button data-toggle="noemy" type="button">🌷 Noemy</button>
      <button data-toggle="casal" type="button">✨ Casal</button>
    </div>`}

    <div class="review-grid">
      ${modoAtivo === 'pessoal'
        ? renderReviewPanel('pessoal', t.avaliacaoAtual)
        : `${renderReviewPanel('caio', t.avaliacaoCaio)}
           ${renderReviewPanel('noemy', t.avaliacaoNoemy)}
           ${renderCoupleReviewPanel(t)}`}
    </div>

    <div class="details-actions">
      <a class="btn btn-secondary" href="add.html?edit=${t.id}">Editar</a>
      <button class="btn btn-danger" id="delete-btn" type="button">Excluir</button>
    </div>
  `;

  ativarAba(abaAtiva);

  document.querySelectorAll('[data-toggle]').forEach(btn => {
    btn.addEventListener('click', () => ativarAba(btn.dataset.toggle));
  });

  document.getElementById('delete-btn').addEventListener('click', onDelete);
}

function avaliacaoNoModo(t, modo) {
  if (modo === 'caio') return t.avaliacaoCaio;
  if (modo === 'noemy') return t.avaliacaoNoemy;
  if (modo === 'pessoal') return t.avaliacaoAtual;
  return null;
}

function renderStatusChip(t, modo) {
  if (modo === 'caio' || modo === 'noemy' || modo === 'pessoal') {
    const nome = modo === 'caio' ? 'Caio' : modo === 'noemy' ? 'Noemy' : (perfilAtual?.nome_exibicao || 'você');
    return avaliacaoNoModo(t, modo)
      ? `<span class="chip chip-yes">Avaliado por ${nome}</span>`
      : `<span class="chip chip-pending">Aguardando avaliação de ${nome}</span>`;
  }
  if (t.status === 'assistiriamos') return `<span class="chip chip-yes">🎬🎬 Assistiríamos novamente</span>`;
  if (t.status === 'nao_assistiriamos') return `<span class="chip chip-no">Não assistiríamos novamente</span>`;
  return `<span class="chip chip-pending">${escapeHtml(statusLabel(t.status))}</span>`;
}

function renderPendingBanner(t, modo) {
  if (modo === 'caio' || modo === 'noemy' || modo === 'pessoal') {
    if (avaliacaoNoModo(t, modo)) return '';
    const nome = modo === 'caio' ? 'Caio' : modo === 'noemy' ? 'Noemy' : (perfilAtual?.nome_exibicao || 'você');
    return `<div class="pending-banner">⏳ Aguardando avaliação de ${nome}.</div>`;
  }
  return t.pendente
    ? `<div class="pending-banner">⏳ ${statusLabel(t.status)} — a média do casal só é calculada quando as duas notas estiverem preenchidas.</div>`
    : '';
}

function renderReviewPanel(pessoa, avaliacao) {
  const nome = pessoa === 'caio' ? 'Caio' : pessoa === 'noemy' ? 'Noemy' : (perfilAtual?.nome_exibicao || 'Você');
  const icone = pessoa === 'caio' ? '👤' : pessoa === 'noemy' ? '🌷' : '🎬';
  return `
    <div class="review-panel" data-panel="${pessoa}" ${pessoa === 'pessoal' ? '' : 'hidden'}>
      <h3>${icone} ${pessoa === 'pessoal' ? 'Sua avaliação' : `Avaliação de ${nome}`}</h3>
      ${avaliacao ? `
        <div class="review-score">${formatarNota(Number(avaliacao.nota))}<small> /10</small></div>
        ${avaliacao.observacao ? `<div class="review-note">“${escapeHtml(avaliacao.observacao)}”</div>` : ''}
        <div class="review-date">Avaliado em ${new Date(avaliacao.data_avaliacao + 'T00:00:00').toLocaleDateString('pt-BR')}</div>
      ` : `<p class="review-pending">Aguardando avaliação de ${nome}.</p>`}
    </div>
  `;
}

function renderCoupleReviewPanel(t) {
  return `
    <div class="review-panel" data-panel="casal" hidden>
      <h3>✨ Visão do casal</h3>
      ${!t.pendente && t.media !== null ? `
        <div class="review-score">${formatarNota(t.media)}<small> /10</small></div>
        <div class="review-date">Diferença entre as notas: ${formatarNota(t.diferenca)} ponto${t.diferenca === 1 ? '' : 's'}</div>
      ` : `<p class="review-pending">A média do casal aparece aqui assim que os dois avaliarem.</p>`}
    </div>
  `;
}

function ativarAba(aba) {
  abaAtiva = aba;
  document.querySelectorAll('[data-toggle]').forEach(b => b.classList.toggle('active', b.dataset.toggle === aba));
  document.querySelectorAll('[data-panel]').forEach(p => { p.hidden = p.dataset.panel !== aba; });
}

async function onDelete() {
  const ok = await confirmarAcao({
    titulo: 'Excluir título',
    mensagem: `Tem certeza que deseja excluir "${titulo.nome}"? Essa ação não pode ser desfeita.`,
    textoConfirmar: 'Excluir'
  });
  if (!ok) return;

  try {
    await excluirTitulo(titulo.id);
    showToast('Título excluído.');
    window.location.href = 'catalog.html';
  } catch (err) {
    console.error(err);
    showToast('Erro ao excluir título.', 'error');
  }
}
