// js/pages/wishlist.js
// Lista "para assistir" do espaço + roleta para sortear o próximo título.

import { requireSession, getCurrentProfile, getUserId } from '../auth.js';
import { searchMulti, getDetails } from '../tmdb.js';
import { criarTitulo, getListaDesejos, excluirTitulo } from '../titulos.js';
import { normalizarModoAtivo, aplicarTema } from '../themes.js';
import { renderNavbar, safeImageSrc, escapeHtml, showToast, confirmarAcao, showSpinner } from '../ui.js';
import { getEspacoAtivo, getMembrosDoEspaco } from '../espacos.js';

let sessionAtual = null;
let desejos = [];
let girando = false;
let rotacaoAtual = 0;

const CORES_FATIA = ['var(--accent)', 'var(--accent-2)', 'var(--surface-elevated)'];

init();

async function init() {
  sessionAtual = await requireSession();
  if (!sessionAtual) return;

  const perfilAtual = await getCurrentProfile(sessionAtual);
  const usuarioId = getUserId(sessionAtual);
  const espacoAtivo = await getEspacoAtivo();
  const membros = await getMembrosDoEspaco(espacoAtivo.id);
  const modoAtivo = normalizarModoAtivo(membros, usuarioId);
  aplicarTema(perfilAtual?.tema, perfilAtual?.cor_destaque);

  renderNavbar(document.getElementById('navbar'), {
    activePage: 'catalog',
    modoAtivo,
    perfilAtual,
    membros,
    usuarioId,
    onModoChange: () => {}
  });

  ligarBusca();
  document.getElementById('spin-btn').addEventListener('click', girarRoleta);

  await carregarLista();
}

/* ==========================================================================
   Carregar / renderizar lista
   ========================================================================== */

async function carregarLista() {
  const grid = document.getElementById('wishlist-grid');
  showSpinner(grid);

  try {
    desejos = await getListaDesejos();
  } catch (err) {
    console.error(err);
    showToast('Erro ao carregar a lista de desejos.', 'error');
    desejos = [];
  }

  renderGrid();
  renderRoulette();
}

function renderGrid() {
  const grid = document.getElementById('wishlist-grid');

  if (!desejos.length) {
    grid.innerHTML = '<p class="empty-state">Nenhum título na lista ainda. Adicione um acima!</p>';
    return;
  }

  grid.innerHTML = '';
  desejos.forEach(t => {
    const card = document.createElement('article');
    card.className = 'wishlist-card';
    card.innerHTML = `
      <img src="${safeImageSrc(t.capa_url)}" alt="Capa de ${escapeHtml(t.nome)}" loading="lazy" />
      <div class="wishlist-card-body">
        <div class="wishlist-card-title">${escapeHtml(t.nome)}</div>
        <div class="wishlist-card-meta">${t.ano || '—'} · ${t.tipo === 'filme' ? 'Filme' : 'Série'}</div>
        <button type="button" class="btn btn-secondary btn-sm" data-remove="${t.id}">Remover</button>
      </div>
    `;
    grid.appendChild(card);
  });

  grid.querySelectorAll('[data-remove]').forEach(btn => {
    btn.addEventListener('click', () => removerDaLista(btn.dataset.remove));
  });
}

async function removerDaLista(id) {
  const titulo = desejos.find(t => t.id === id);
  const ok = await confirmarAcao({
    titulo: 'Remover da lista',
    mensagem: `Remover "${titulo?.nome || ''}" da lista de desejos?`,
    textoConfirmar: 'Remover'
  });
  if (!ok) return;

  try {
    await excluirTitulo(id);
    showToast('Removido da lista.');
    await carregarLista();
  } catch (err) {
    console.error(err);
    showToast('Erro ao remover.', 'error');
  }
}

/* ==========================================================================
   Busca no TMDB e adicionar à lista (sem exigir avaliação)
   ========================================================================== */

function ligarBusca() {
  const input = document.getElementById('wishlist-search-input');
  let debounceTimer = null;
  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => executarBusca(input.value), 400);
  });
}

async function executarBusca(query) {
  const container = document.getElementById('wishlist-search-results');

  if (!query || query.trim().length < 2) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = '<div class="spinner"></div>';

  try {
    const resultados = await searchMulti(query);
    if (!resultados.length) {
      container.innerHTML = '<p class="empty-state">Nenhum resultado encontrado.</p>';
      return;
    }
    container.innerHTML = '';
    resultados.forEach(r => {
      const card = document.createElement('div');
      card.className = 'search-result-card';
      card.innerHTML = `
        <img src="${safeImageSrc(r.capa_url)}" alt="Capa de ${escapeHtml(r.nome)}" loading="lazy" />
        <div class="src-body">
          <div class="src-title">${escapeHtml(r.nome)}</div>
          <div class="src-meta">${r.ano || '—'} · ${r.tipo === 'filme' ? 'Filme' : 'Série'}</div>
        </div>
      `;
      card.addEventListener('click', () => adicionarNaLista(r));
      container.appendChild(card);
    });
  } catch (err) {
    console.error(err);
    container.innerHTML = '<p class="empty-state">Erro ao buscar no TMDB. Verifique sua chave em config.js.</p>';
  }
}

async function adicionarNaLista(resumo) {
  if (desejos.some(t => t.tmdb_id === resumo.tmdb_id)) {
    showToast('Esse título já está na lista.', 'error');
    return;
  }

  try {
    const completos = await getDetails(resumo.tmdb_id, resumo.tipo);
    const usuarioId = getUserId(sessionAtual);

    const titulo = await criarTitulo({ ...completos, quero_assistir: true }, usuarioId);

    if (titulo.jaExistia) {
      showToast('Esse título já está cadastrado no catálogo.', 'error');
      return;
    }

    document.getElementById('wishlist-search-input').value = '';
    document.getElementById('wishlist-search-results').innerHTML = '';

    showToast(`"${completos.nome}" adicionado à lista!`);
    await carregarLista();
  } catch (err) {
    console.error(err);
    showToast('Erro ao adicionar título.', 'error');
  }
}

/* ==========================================================================
   Roleta
   ========================================================================== */

function renderRoulette() {
  const section = document.getElementById('roulette-section');
  const spinBtn = document.getElementById('spin-btn');
  const winnerBox = document.getElementById('roulette-winner');

  winnerBox.hidden = true;
  winnerBox.innerHTML = '';

  if (desejos.length < 2) {
    section.hidden = false;
    spinBtn.disabled = true;
    spinBtn.textContent = desejos.length === 0
      ? 'Adicione ao menos 2 títulos para girar'
      : 'Adicione mais 1 título para girar';
    document.getElementById('roulette-wheel').innerHTML = '';
    return;
  }

  section.hidden = false;
  spinBtn.disabled = false;
  spinBtn.textContent = '🎲 Girar a roleta';

  rotacaoAtual = 0;
  const wheel = document.getElementById('roulette-wheel');
  wheel.style.transition = 'none';
  wheel.style.transform = 'rotate(0deg)';
  wheel.innerHTML = construirFatiasSVG(desejos);
}

function construirFatiasSVG(lista) {
  const cx = 200, cy = 200, r = 195;
  const n = lista.length;
  const anguloFatia = 360 / n;
  let svg = '<defs>';

  lista.forEach((t, i) => {
    svg += `<clipPath id="clip-${i}"><circle cx="0" cy="0" r="28"/></clipPath>`;
  });
  svg += '</defs>';

  lista.forEach((t, i) => {
    const inicio = i * anguloFatia;
    const fim = inicio + anguloFatia;
    const meio = inicio + anguloFatia / 2;
    const cor = CORES_FATIA[i % CORES_FATIA.length];

    svg += `<path d="${descreverFatia(cx, cy, r, inicio, fim)}" fill="${cor}" fill-opacity="0.88" stroke="var(--card-border)" stroke-width="1.5" />`;

    // thumbnail da capa, posicionado a meio caminho do centro até a borda
    const posThumb = polarParaCartesiano(cx, cy, r * 0.68, meio);
    svg += `
      <g transform="translate(${posThumb.x}, ${posThumb.y})">
        <g clip-path="url(#clip-${i})">
          <image href="${safeImageSrc(t.capa_url)}" x="-28" y="-28" width="56" height="56" preserveAspectRatio="xMidYMid slice" />
        </g>
        <circle cx="0" cy="0" r="28" fill="none" stroke="#fff" stroke-opacity="0.6" stroke-width="2" />
      </g>
    `;
  });

  return svg;
}

function polarParaCartesiano(cx, cy, r, anguloGraus) {
  const rad = (anguloGraus - 90) * Math.PI / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function descreverFatia(cx, cy, r, anguloInicio, anguloFim) {
  const inicio = polarParaCartesiano(cx, cy, r, anguloFim);
  const fim = polarParaCartesiano(cx, cy, r, anguloInicio);
  const largeArc = anguloFim - anguloInicio <= 180 ? 0 : 1;
  return `M ${cx} ${cy} L ${inicio.x} ${inicio.y} A ${r} ${r} 0 ${largeArc} 0 ${fim.x} ${fim.y} Z`;
}

function girarRoleta() {
  if (girando || desejos.length < 2) return;
  girando = true;

  const spinBtn = document.getElementById('spin-btn');
  spinBtn.disabled = true;
  document.getElementById('roulette-winner').hidden = true;

  const n = desejos.length;
  const anguloFatia = 360 / n;
  const vencedorIndex = Math.floor(Math.random() * n);
  const anguloCentroVencedor = vencedorIndex * anguloFatia + anguloFatia / 2;

  const voltasExtras = 5 * 360;
  const offsetFinal = (360 - anguloCentroVencedor) % 360;
  rotacaoAtual += voltasExtras + offsetFinal;

  const wheel = document.getElementById('roulette-wheel');
  wheel.style.transition = 'transform 4.2s cubic-bezier(0.15, 0.65, 0.15, 1)';
  wheel.style.transform = `rotate(${rotacaoAtual}deg)`;

  const aoTerminar = () => {
    wheel.removeEventListener('transitionend', aoTerminar);
    girando = false;
    spinBtn.disabled = false;
    mostrarVencedor(desejos[vencedorIndex]);
  };
  wheel.addEventListener('transitionend', aoTerminar);
}

function mostrarVencedor(t) {
  const box = document.getElementById('roulette-winner');
  box.hidden = false;
  box.innerHTML = `
    <div class="roulette-winner-card">
      <img src="${safeImageSrc(t.capa_url)}" alt="Capa de ${escapeHtml(t.nome)}" />
      <div class="roulette-winner-info">
        <div class="roulette-winner-label">🎬 Vamos assistir:</div>
        <h3>${escapeHtml(t.nome)}</h3>
        <div class="wishlist-card-meta">${t.ano || '—'} · ${t.tipo === 'filme' ? 'Filme' : 'Série'}</div>
        ${t.sinopse ? `<p>${escapeHtml(t.sinopse)}</p>` : ''}
        <div style="display:flex; gap:10px; margin-top: 14px;">
          <a href="edit.html?edit=${t.id}" class="btn btn-primary">Assistimos! Avaliar agora</a>
          <button type="button" class="btn btn-secondary" id="spin-again-btn">Girar de novo</button>
        </div>
      </div>
    </div>
  `;
  box.querySelector('#spin-again-btn').addEventListener('click', girarRoleta);
  box.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
