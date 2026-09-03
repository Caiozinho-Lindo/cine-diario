// js/ui.js
// Componentes reutilizados: navegação, espaços, cards, toast e modal.

import { formatarNota } from './statistics.js';
import { resolveRootPath, logout } from './auth.js';
import { nomeDoModo, notaNoModo, setModoAtivo } from './themes.js';
import { getEspacosDoUsuario, getEspacoAtivo, setEspacoAtivo } from './espacos.js';

export function renderNavbar(container, {
  activePage,
  modoAtivo,
  perfilAtual,
  membros = [],
  usuarioId,
  onModoChange
}) {
  const root = resolveRootPath('');
  const nomeUsuario = perfilAtual?.nome_exibicao || perfilAtual?.nome || 'Cineasta';
  const avatar = perfilAtual?.avatar_url
    ? `<img src="${safeImageSrc(perfilAtual.avatar_url)}" alt="" />`
    : `<span aria-hidden="true">${escapeHtml(nomeUsuario.slice(0, 1).toUpperCase())}</span>`;
  const opcoesModo = [
    ...(membros.length > 1 ? [{ valor: 'geral', nome: 'Visão geral' }] : []),
    ...membros.map(membro => ({
      valor: `membro:${membro.usuario_id}`,
      nome: nomeDoModo(`membro:${membro.usuario_id}`, membros, usuarioId)
    }))
  ];

  container.innerHTML = `
    <div class="navbar-inner">
      <a class="navbar-brand" href="${root}pages/home.html">
        <svg width="26" height="26" viewBox="0 0 48 48" fill="none" aria-hidden="true">
          <rect x="4" y="10" width="40" height="28" rx="3" stroke="currentColor" stroke-width="2"/>
          <path d="M4 18h40M12 10v8M20 10v8M28 10v8M36 10v8" stroke="currentColor" stroke-width="2"/>
        </svg>
        <span>Cine Diário</span>
      </a>

      <label class="space-picker" hidden>
        <span class="sr-only">Espaço ativo</span>
        <select data-space-picker aria-label="Espaço ativo"></select>
      </label>

      <label class="view-picker" ${opcoesModo.length <= 1 ? 'hidden' : ''}>
        <span>Visão</span>
        <select data-mode-select aria-label="Visão das avaliações">
          ${opcoesModo.map(opcao => `
            <option value="${escapeHtml(opcao.valor)}" ${opcao.valor === modoAtivo ? 'selected' : ''}>
              ${escapeHtml(opcao.nome)}
            </option>`).join('')}
        </select>
      </label>

      <div class="navbar-links">
        <a href="${root}pages/home.html" data-page="home">Início</a>
        <a href="${root}pages/catalog.html" data-page="catalog">Catálogo</a>
        <a href="${root}pages/profile.html" data-page="profile">Perfil e espaços</a>
      </div>

      <div class="navbar-user">
        <span class="navbar-avatar">${avatar}</span>
        <span class="navbar-user-name">${escapeHtml(nomeUsuario)}</span>
        <button class="btn btn-secondary btn-sm" id="logout-btn" type="button">Sair</button>
      </div>
    </div>`;

  container.querySelectorAll(`[data-page="${activePage}"]`).forEach(a => a.classList.add('active'));
  const seletorModo = container.querySelector('[data-mode-select]');
  seletorModo?.addEventListener('change', () => {
    setModoAtivo(seletorModo.value);
    if (onModoChange) onModoChange(seletorModo.value);
  });
  container.querySelector('#logout-btn').addEventListener('click', logout);
  hidratarEspacos(container).catch(error => console.error('[espaços]', error));
}

async function hidratarEspacos(container) {
  const [espacos, ativo] = await Promise.all([getEspacosDoUsuario(), getEspacoAtivo()]);
  const wrapper = container.querySelector('.space-picker');
  const select = container.querySelector('[data-space-picker]');
  select.innerHTML = espacos
    .map(espaco => `<option value="${escapeHtml(espaco.id)}" ${espaco.id === ativo.id ? 'selected' : ''}>${escapeHtml(espaco.nome)}</option>`)
    .join('');
  wrapper.hidden = false;
  select.addEventListener('change', async () => {
    await setEspacoAtivo(select.value);
    window.location.reload();
  });
}

export function renderTituloCard(titulo, modo, { compactoCatalogo = false } = {}) {
  const paraAssistir = Boolean(titulo.quero_assistir);
  const notaPrincipal = notaNoModo(titulo, modo);
  const capa = safeImageSrc(titulo.capa_url);
  const pendente = !paraAssistir && estaPendenteNoModo(titulo, modo);
  const statusChip = compactoCatalogo
    ? ''
    : paraAssistir
      ? '<span class="chip chip-watchlist">Na lista</span>'
      : renderStatusChip(titulo, modo, pendente);
  const card = document.createElement('article');
  card.className = `title-card${compactoCatalogo ? ' catalog-title-card' : ''}`;
  card.dataset.id = titulo.id;
  card.innerHTML = `
    <div class="poster-wrap">
      <img src="${capa}" alt="Capa de ${escapeHtml(titulo.nome)}" loading="lazy" />
      <span class="badge-type">${titulo.tipo === 'filme' ? 'Filme' : 'Série'}</span>
      ${pendente ? '<span class="badge-pending">Pendente</span>' : ''}
    </div>
    <div class="card-body">
      <div class="card-title">${escapeHtml(titulo.nome)}</div>
      <div class="card-meta">${titulo.ano || '—'}${titulo.generos?.length ? ' · ' + escapeHtml(titulo.generos.slice(0, 2).join(', ')) : ''}</div>
      <div class="card-footer">
        <div class="card-score${paraAssistir ? ' card-watchlist-label' : ''}">${paraAssistir ? 'Para assistir' : `${notaPrincipal !== null ? formatarNota(notaPrincipal) : '—'}<small> /10</small>`}</div>
        ${statusChip}
      </div>
    </div>`;
  return card;
}

function estaPendenteNoModo(titulo, modo) {
  return notaNoModo(titulo, modo) === null;
}

function renderStatusChip(titulo, modo, pendente) {
  if (modo !== 'geral') {
    return pendente
      ? '<span class="chip chip-pending">Pendente</span>'
      : '<span class="chip chip-yes">Avaliado</span>';
  }
  if (titulo.pendente || titulo.media === null) return '<span class="chip chip-pending">Pendente</span>';
  if (titulo.media >= 7) return '<span class="chip chip-yes">🎬 O grupo assistiria</span>';
  return '<span class="chip chip-no">O grupo não assistiria</span>';
}

export function placeholderCapa() {
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="300" height="450" viewBox="0 0 300 450">
      <rect width="300" height="450" fill="#241a30"/>
      <text x="50%" y="50%" fill="#7a6690" font-family="Georgia" font-size="18" text-anchor="middle" dy=".3em">Sem capa</text>
    </svg>`);
}

export function safeImageSrc(url) {
  if (!url) return placeholderCapa();
  try {
    const parsed = new URL(url, window.location.href);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') return escapeHtml(parsed.href);
  } catch { /* usa placeholder */ }
  return placeholderCapa();
}

export function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

let toastTimeout = null;
export function showToast(message, type = 'default') {
  let el = document.getElementById('app-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'app-toast';
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.className = `toast show ${type === 'error' ? 'error' : ''}`;
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => el.classList.remove('show'), 3200);
}

export function confirmarAcao({ titulo, mensagem, textoConfirmar = 'Confirmar', destrutivo = true }) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-box">
        <h3>${escapeHtml(titulo)}</h3><p>${escapeHtml(mensagem)}</p>
        <div class="modal-actions">
          <button class="btn btn-secondary" data-action="cancel" type="button">Cancelar</button>
          <button class="btn ${destrutivo ? 'btn-danger' : 'btn-primary'}" data-action="confirm" type="button">${escapeHtml(textoConfirmar)}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', event => {
      if (event.target === overlay || event.target.dataset.action === 'cancel') {
        overlay.remove(); resolve(false);
      }
      if (event.target.dataset.action === 'confirm') {
        overlay.remove(); resolve(true);
      }
    });
  });
}

export function showEmptyState(container, message) {
  container.innerHTML = `<div class="empty-state">${escapeHtml(message)}</div>`;
}
export function showSpinner(container) { container.innerHTML = '<div class="spinner"></div>'; }
