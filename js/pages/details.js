// js/pages/details.js
import { requireSession, getCurrentProfile, getUserId } from '../auth.js';
import { getTituloComAvaliacoes, excluirTitulo } from '../titulos.js';
import { formatarNota } from '../statistics.js';
import {
  normalizarModoAtivo,
  aplicarTema,
  avaliacaoNoModo,
  nomeDoModo,
  usuarioDoModo
} from '../themes.js';
import { getEspacoAtivo, getMembrosDoEspaco } from '../espacos.js';
import {
  renderNavbar, safeImageSrc, escapeHtml,
  showToast, confirmarAcao
} from '../ui.js';

let titulo = null;
let modoAtivo = 'geral';
let abaAtiva = 'geral';
let perfilAtual = null;
let membrosEspaco = [];
let usuarioIdAtual = null;

init();

async function init() {
  const session = await requireSession();
  if (!session) return;

  perfilAtual = await getCurrentProfile(session);
  usuarioIdAtual = getUserId(session);
  const espacoAtivo = await getEspacoAtivo();
  membrosEspaco = await getMembrosDoEspaco(espacoAtivo.id);
  modoAtivo = normalizarModoAtivo(membrosEspaco, usuarioIdAtual);
  aplicarTema(perfilAtual?.tema, perfilAtual?.cor_destaque);
  abaAtiva = modoAtivo;

  renderNavbar(document.getElementById('navbar'), {
    activePage: 'details',
    modoAtivo,
    perfilAtual,
    membros: membrosEspaco,
    usuarioId: usuarioIdAtual,
    onModoChange: novoModo => {
      modoAtivo = novoModo;
      abaAtiva = novoModo;
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

    ${renderReviewTabs()}

    <div class="review-grid">
      ${t.avaliacoesMembros.map(({ membro, avaliacao }) => renderReviewPanel(membro, avaliacao)).join('')}
      ${membrosEspaco.length > 1 ? renderGroupReviewPanel(t) : ''}
    </div>

    <div class="details-actions">
      <a class="btn btn-secondary" href="edit.html?edit=${t.id}">Editar</a>
      <button class="btn btn-danger" id="delete-btn" type="button">Excluir</button>
    </div>
  `;

  ativarAba(abaAtiva);

  document.querySelectorAll('[data-toggle]').forEach(btn => {
    btn.addEventListener('click', () => ativarAba(btn.dataset.toggle));
  });

  document.getElementById('delete-btn').addEventListener('click', onDelete);
}

function renderReviewTabs() {
  if (membrosEspaco.length <= 1) return '';
  return `<div class="details-toggle" id="review-toggle">
    ${membrosEspaco.map(membro => `
      <button data-toggle="membro:${escapeHtml(membro.usuario_id)}" type="button">
        ${escapeHtml(membro.perfil?.nome_exibicao || membro.perfil?.nome || 'Participante')}
      </button>`).join('')}
    <button data-toggle="geral" type="button">✨ Geral</button>
  </div>`;
}

function renderStatusChip(t, modo) {
  if (usuarioDoModo(modo)) {
    const nome = nomeDoModo(modo, membrosEspaco, usuarioIdAtual);
    return avaliacaoNoModo(t, modo)
      ? `<span class="chip chip-yes">Avaliado por ${escapeHtml(nome)}</span>`
      : `<span class="chip chip-pending">Aguardando avaliação de ${escapeHtml(nome)}</span>`;
  }
  if (t.pendente) {
    const faltantes = t.avaliacoesMembros.filter(item => !item.avaliacao).length;
    return `<span class="chip chip-pending">${faltantes} avaliação${faltantes === 1 ? '' : 'ões'} pendente${faltantes === 1 ? '' : 's'}</span>`;
  }
  if (t.media >= 7) return '<span class="chip chip-yes">🎬 O grupo assistiria novamente</span>';
  return '<span class="chip chip-no">O grupo não assistiria novamente</span>';
}

function renderPendingBanner(t, modo) {
  if (usuarioDoModo(modo)) {
    if (avaliacaoNoModo(t, modo)) return '';
    const nome = nomeDoModo(modo, membrosEspaco, usuarioIdAtual);
    return `<div class="pending-banner">⏳ Aguardando avaliação de ${escapeHtml(nome)}.</div>`;
  }
  if (!t.pendente) return '';
  const nomes = t.avaliacoesMembros
    .filter(item => !item.avaliacao)
    .map(item => item.membro.perfil?.nome_exibicao || item.membro.perfil?.nome || 'Participante');
  return `<div class="pending-banner">⏳ Aguardando ${escapeHtml(nomes.join(', '))}. A média geral aparece quando todas as pessoas avaliarem.</div>`;
}

function renderReviewPanel(membro, avaliacao) {
  const nome = membro.perfil?.nome_exibicao || membro.perfil?.nome || 'Participante';
  const painel = `membro:${membro.usuario_id}`;
  return `
    <div class="review-panel" data-panel="${escapeHtml(painel)}" hidden>
      <h3>🎬 ${membro.usuario_id === usuarioIdAtual ? 'Sua avaliação' : `Avaliação de ${escapeHtml(nome)}`}</h3>
      ${avaliacao ? `
        <div class="review-score">${formatarNota(Number(avaliacao.nota))}<small> /10</small></div>
        ${avaliacao.observacao ? `<div class="review-note">“${escapeHtml(avaliacao.observacao)}”</div>` : ''}
        <div class="review-date">Avaliado em ${new Date(avaliacao.data_avaliacao + 'T00:00:00').toLocaleDateString('pt-BR')}</div>
      ` : `<p class="review-pending">Aguardando avaliação de ${escapeHtml(nome)}.</p>`}
    </div>
  `;
}

function renderGroupReviewPanel(t) {
  return `
    <div class="review-panel" data-panel="geral" hidden>
      <h3>✨ Visão geral</h3>
      ${!t.pendente && t.media !== null ? `
        <div class="review-score">${formatarNota(t.media)}<small> /10</small></div>
        <div class="review-date">Diferença entre as notas: ${formatarNota(t.diferenca)} ponto${t.diferenca === 1 ? '' : 's'}</div>
      ` : '<p class="review-pending">A média geral aparece aqui quando todas as pessoas avaliarem.</p>'}
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
