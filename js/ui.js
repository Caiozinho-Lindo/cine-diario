// js/ui.js
// Componentes reutilizados: navegação, espaços, cards, toast e modal.

import { formatarNota } from './statistics.js';
import { resolveRootPath, logout } from './auth.js';
import { setModoAtivo } from './themes.js';
import { getEspacosDoUsuario, getEspacoAtivo, setEspacoAtivo } from './espacos.js';

const STATUS_LABEL = {
  assistiriamos: 'Assistiríamos novamente',
  nao_assistiriamos: 'Não assistiríamos novamente',
  aguardando_caio: 'Aguardando avaliação do Caio',
  aguardando_noemy: 'Aguardando avaliação da Noemy',
  sem_avaliacao: 'Aguardando avaliações'
};

export function renderNavbar(container, { activePage, modoAtivo, perfilLogado, onModoChange }) {
  const root = resolveRootPath('');
  const perfilLegado = perfilLogado === 'caio' || perfilLogado === 'noemy';
  const botoesModo = perfilLegado
    ? `<button data-mode-btn="caio" type="button">👤 Caio</button>
       <button data-mode-btn="noemy" type="button">🌷 Noemy</button>
       <button data-mode-btn="casal" type="button">✨ Casal</button>`
    : `<button data-mode-btn="pessoal" type="button">🎬 Meu diário</button>`;

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

      <div class="mode-switch" aria-label="Modo de visualização">${botoesModo}</div>

      <div class="navbar-links">
        <a href="${root}pages/home.html" data-page="home">Início</a>
        <a href="${root}pages/catalog.html" data-page="catalog">Catálogo</a>
        <a href="${root}pages/profile.html" data-page="profile">Perfil e espaços</a>
      </div>

      <div class="navbar-user">
        <span>${perfilLogado === 'caio' ? 'Caio' : perfilLogado === 'noemy' ? 'Noemy' : ''}</span>
        <button class="btn btn-secondary btn-sm" id="logout-btn" type="button">Sair</button>
      </div>
    </div>`;

  container.querySelectorAll(`[data-page="${activePage}"]`).forEach(a => a.classList.add('active'));
  container.querySelectorAll('[data-mode-btn]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.modeBtn === modoAtivo);
    btn.addEventListener('click', () => {
      const novoModo = btn.dataset.modeBtn;
      setModoAtivo(novoModo);
      if (onModoChange) onModoChange(novoModo);
    });
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

export function renderTituloCard(titulo, modo) {
  const paraAssistir = Boolean(titulo.quero_assistir);
  const notaPrincipal = obterNotaExibicao(titulo, modo);
  const capa = safeImageSrc(titulo.capa_url);
  const pendente = !paraAssistir && estaPendenteNoModo(titulo, modo);
  const statusChip = paraAssistir
    ? '<span class="chip chip-watchlist">Na lista</span>'
    : renderStatusChip(titulo.status, modo, pendente);
  const card = document.createElement('article');
  card.className = 'title-card';
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
        <div class="card-score${paraAssistir ? ' card-watchlist-label' : ''}">${paraAssistir ? '🎲 Para assistir' : `${notaPrincipal !== null ? formatarNota(notaPrincipal) : '—'}<small> /10</small>`}</div>
        ${statusChip}
      </div>
    </div>`;
  return card;
}

function obterNotaExibicao(titulo, modo) {
  if (modo === 'caio') return titulo.avaliacaoCaio ? Number(titulo.avaliacaoCaio.nota) : null;
  if (modo === 'noemy') return titulo.avaliacaoNoemy ? Number(titulo.avaliacaoNoemy.nota) : null;
  if (modo === 'pessoal') return titulo.avaliacaoAtual ? Number(titulo.avaliacaoAtual.nota) : null;
  return titulo.pendente ? null : titulo.media;
}

function estaPendenteNoModo(titulo, modo) {
  if (modo === 'caio') return !titulo.avaliacaoCaio;
  if (modo === 'noemy') return !titulo.avaliacaoNoemy;
  if (modo === 'pessoal') return !titulo.avaliacaoAtual;
  return titulo.pendente;
}

function renderStatusChip(status, modo, pendente) {
  if (modo === 'caio' || modo === 'noemy' || modo === 'pessoal') {
    return pendente
      ? '<span class="chip chip-pending">Pendente</span>'
      : '<span class="chip chip-yes">Avaliado</span>';
  }
  if (status === 'assistiriamos') return '<span class="chip chip-yes">🎬 Assistiríamos</span>';
  if (status === 'nao_assistiriamos') return '<span class="chip chip-no">Não assistiríamos</span>';
  return '<span class="chip chip-pending">Pendente</span>';
}

export function statusLabel(status) { return STATUS_LABEL[status] || ''; }

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
