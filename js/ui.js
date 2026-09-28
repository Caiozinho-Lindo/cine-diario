// js/ui.js
// Componentes reutilizados: navegação, espaços, cards, toast e modal.

import { formatarNota } from './statistics.js?v=20260919.2';
import { resolveRootPath, logout } from './auth.js';
import { nomeDoModo, notaNoModo, setModoAtivo } from './themes.js?v=20260910.1';

export function renderNavbar(container, {
  activePage,
  modoAtivo,
  perfilAtual,
  membros = [],
  usuarioId,
  onModoChange
}) {
  container.classList.remove('navbar-snapshot');
  const root = resolveRootPath('');
  const nomeUsuario = perfilAtual?.nome_exibicao || perfilAtual?.nome || 'Cineasta';
  const avatar = perfilAtual?.avatar_url
    ? `<img src="${safeImageSrc(perfilAtual.avatar_url)}" alt="" />`
    : `<span aria-hidden="true">${escapeHtml(nomeUsuario.slice(0, 1).toUpperCase())}</span>`;

  container.innerHTML = `
    <div class="navbar-inner">
      <a class="navbar-brand" href="${root}pages/home.html">
        <span class="navbar-brand-mark" aria-hidden="true">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path d="M5.5 4.75h13a1.75 1.75 0 0 1 1.75 1.75v11a1.75 1.75 0 0 1-1.75 1.75h-13a1.75 1.75 0 0 1-1.75-1.75v-11A1.75 1.75 0 0 1 5.5 4.75Z" stroke="currentColor" stroke-width="1.5"/>
          <path d="m9.75 9 5 3-5 3V9Z" fill="currentColor"/>
        </svg>
        </span>
        <span>Cine Diário</span>
      </a>

      <div class="navbar-links">
        <a href="${root}pages/home.html" data-page="home">Início</a>
        <a href="${root}pages/catalog.html" data-page="catalog">Catálogo</a>
      </div>

      <div class="navbar-user">
        <button class="navbar-user-trigger" data-user-trigger type="button" aria-haspopup="menu" aria-expanded="false">
          <span class="navbar-avatar">${avatar}</span>
          <span class="navbar-user-name">${escapeHtml(nomeUsuario)}</span>
          <span class="navbar-user-chevron" aria-hidden="true"></span>
        </button>
        <div class="navbar-user-menu" data-user-menu role="menu" hidden>
          <a href="${root}pages/profile.html" role="menuitem">Perfil e espaços</a>
          <button id="logout-btn" type="button" role="menuitem">Sair</button>
        </div>
      </div>

      <button class="navbar-menu-toggle" type="button" aria-label="Abrir menu" aria-expanded="false">
        <span></span><span></span>
      </button>
    </div>`;

  container.querySelectorAll(`[data-page="${activePage}"]`).forEach(a => a.classList.add('active'));
  const seletorModo = container.querySelector('[data-mode-select]');
  seletorModo?.addEventListener('change', () => {
    setModoAtivo(seletorModo.value);
    if (onModoChange) onModoChange(seletorModo.value);
  });
  container.querySelector('#logout-btn').addEventListener('click', async event => {
    const confirmarSaida = window.cineDiarioConfirmarSaida;
    if (typeof confirmarSaida === 'function' && !(await confirmarSaida())) return;
    logout();
  });
  const menuToggle = container.querySelector('.navbar-menu-toggle');
  menuToggle?.addEventListener('click', () => {
    const aberto = container.classList.toggle('menu-open');
    menuToggle.setAttribute('aria-expanded', String(aberto));
    menuToggle.setAttribute('aria-label', aberto ? 'Fechar menu' : 'Abrir menu');
  });
  configurarMenusNavbar(container);
  prepararNavegacaoLeve(container);
}

function prepararNavegacaoLeve(container) {
  const links = [...container.querySelectorAll('.navbar-brand, .navbar-links a')]
    .map(link => link.href)
    .filter(Boolean);
  const visitados = new Set();
  const preparar = href => {
    if (visitados.has(href)) return;
    visitados.add(href);
    const prefetch = document.createElement('link');
    prefetch.rel = 'prefetch';
    prefetch.href = href;
    document.head.appendChild(prefetch);
  };

  container.querySelectorAll('.navbar-brand, .navbar-links a').forEach(link => {
    link.addEventListener('click', event => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const continuar = () => {
        sessionStorage.setItem('cine_diario_navegacao_interna', '1');
        salvarSnapshotNavbar(container, link.href);
        if (link.matches('.navbar-links a') && !link.classList.contains('active')) {
          animarIndicadorNavegacao(event, link, container);
        } else {
          window.location.assign(link.href);
        }
      };
      const confirmarSaida = window.cineDiarioConfirmarSaida;
      if (typeof confirmarSaida === 'function') {
        event.preventDefault();
        confirmarSaida().then(ok => {
          if (!ok) return;
          sessionStorage.setItem('cine_diario_navegacao_interna', '1');
          salvarSnapshotNavbar(container, link.href);
          window.location.assign(link.href);
        });
        return;
      }
      continuar();
    });
    ['pointerenter', 'focus', 'touchstart'].forEach(evento => {
      link.addEventListener(evento, () => preparar(link.href), { once: true, passive: true });
    });
  });

  const prepararTodas = () => links.forEach(preparar);
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(prepararTodas, { timeout: 1600 });
  } else {
    window.setTimeout(prepararTodas, 1200);
  }
}

function salvarSnapshotNavbar(container, destinoHref) {
  const copia = container.cloneNode(true);
  copia.classList.remove('menu-open', 'navbar-snapshot');
  copia.querySelector('.navbar-links')?.classList.remove('nav-is-moving');
  copia.querySelector('.nav-moving-indicator')?.remove();
  copia.querySelectorAll('.navbar-links a').forEach(link => {
    link.classList.toggle('active', link.href === destinoHref);
  });
  sessionStorage.setItem('cine_diario_nav_snapshot', copia.innerHTML);
}

function animarIndicadorNavegacao(event, destino, container) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const links = container.querySelector('.navbar-links');
  const atual = links?.querySelector('a.active');
  if (!links || !atual || links.classList.contains('nav-is-moving')) return;

  event.preventDefault();
  const area = links.getBoundingClientRect();
  const origem = atual.getBoundingClientRect();
  const chegada = destino.getBoundingClientRect();
  const indicador = document.createElement('span');
  indicador.className = 'nav-moving-indicator';
  indicador.style.width = `${origem.width - 28}px`;
  indicador.style.transform = `translateX(${origem.left - area.left + 14}px)`;
  links.appendChild(indicador);
  links.classList.add('nav-is-moving');

  requestAnimationFrame(() => {
    indicador.style.width = `${chegada.width - 28}px`;
    indicador.style.transform = `translateX(${chegada.left - area.left + 14}px)`;
  });

  window.setTimeout(() => window.location.assign(destino.href), 190);
}

function configurarMenusNavbar(container) {
  const userTrigger = container.querySelector('[data-user-trigger]');
  const userMenu = container.querySelector('[data-user-menu]');
  const fechar = () => {
    if (userMenu) { userMenu.hidden = true; userTrigger?.setAttribute('aria-expanded', 'false'); }
  };
  userTrigger?.addEventListener('click', event => {
    event.stopPropagation();
    const aberto = userMenu && !userMenu.hidden;
    fechar();
    if (userMenu) { userMenu.hidden = aberto; userTrigger.setAttribute('aria-expanded', String(!aberto)); }
  });
  document.addEventListener('click', event => {
    if (!container.contains(event.target)) fechar();
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

export function confirmarAcao({ titulo, mensagem, textoConfirmar = 'Confirmar', textoCancelar = 'Cancelar', valorCancelar = false, destrutivo = true, textoObrigatorio = '' }) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-box">
        <h3>${escapeHtml(titulo)}</h3><p>${escapeHtml(mensagem)}</p>
        ${textoObrigatorio ? `<label class="confirm-text-label">Digite <strong>${escapeHtml(textoObrigatorio)}</strong> para confirmar<input data-confirm-text type="text" autocomplete="off" /></label>` : ''}
        <div class="modal-actions">
          <button class="btn btn-secondary" data-action="cancel" type="button">${escapeHtml(textoCancelar)}</button>
          <button class="btn ${destrutivo ? 'btn-danger' : 'btn-primary'}" data-action="confirm" type="button">${escapeHtml(textoConfirmar)}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', event => {
      if (event.target === overlay) {
        overlay.remove(); resolve(false);
      }
      if (event.target.dataset.action === 'cancel') {
        overlay.remove(); resolve(valorCancelar);
      }
      if (event.target.dataset.action === 'confirm') {
        const campo = overlay.querySelector('[data-confirm-text]');
        if (campo && campo.value.trim() !== textoObrigatorio) {
          campo.setCustomValidity(`Digite exatamente: ${textoObrigatorio}`);
          campo.reportValidity();
          return;
        }
        overlay.remove(); resolve(true);
      }
    });
  });
}

export function showEmptyState(container, message) {
  container.innerHTML = `<div class="empty-state">${escapeHtml(message)}</div>`;
}
export function showSpinner(container) { container.innerHTML = '<div class="spinner"></div>'; }

export function showCardSkeletons(container, quantidade = 8) {
  container.innerHTML = Array.from({ length: quantidade }, () => `
    <article class="title-card title-card-skeleton" aria-hidden="true">
      <div class="poster-wrap"></div>
      <div class="card-body">
        <div class="skeleton-line skeleton-line-title"></div>
        <div class="skeleton-line skeleton-line-short"></div>
      </div>
    </article>`).join('');
}

export function concluirCarregamentoInicial() {
  document.body.classList.remove('app-loading');
  document.body.classList.remove('app-navigation');
  document.body.classList.add('app-ready');
  const carregamento = document.getElementById('app-startup');
  if (carregamento) carregamento.hidden = true;
}
