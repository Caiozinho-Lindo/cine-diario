// js/pages/catalog.js
import { requireSession, getProfileFromSession } from '../auth.js';
import { getAllTitulosComAvaliacoes } from '../titulos.js';
import { aplicarFiltros, extrairGenerosUnicos, extrairAnosUnicos } from '../filters.js';
import { getModoAtivo, aplicarTema } from '../themes.js';
import { renderNavbar, renderTituloCard, showEmptyState, showSpinner, showToast } from '../ui.js';

let titulos = [];
let modoAtivo = 'casal';

init();

async function init() {
  const session = await requireSession();
  if (!session) return;

  modoAtivo = getModoAtivo();
  aplicarTema(modoAtivo);

  renderNavbar(document.getElementById('navbar'), {
    activePage: 'catalog',
    modoAtivo,
    perfilLogado: getProfileFromSession(session),
    onModoChange: novoModo => {
      modoAtivo = novoModo;
      aplicarTema(novoModo);
      renderResultados();
    }
  });

  const grid = document.getElementById('cards-grid');
  showSpinner(grid);

  try {
    titulos = await getAllTitulosComAvaliacoes();
  } catch (err) {
    console.error(err);
    showToast('Erro ao carregar títulos.', 'error');
    showEmptyState(grid, 'Não foi possível carregar os títulos.');
    return;
  }

  popularSelects();
  ligarFiltros();

  // Suporte a ?filtro=pendentes vindo de outras páginas
  const params = new URLSearchParams(window.location.search);
  if (params.get('filtro')) {
    document.getElementById('f-avaliacao').value = params.get('filtro');
  }

  renderResultados();
}

function popularSelects() {
  const generoSelect = document.getElementById('f-genero');
  extrairGenerosUnicos(titulos).forEach(g => {
    const opt = document.createElement('option');
    opt.value = g;
    opt.textContent = g;
    generoSelect.appendChild(opt);
  });

  const anoSelect = document.getElementById('f-ano');
  extrairAnosUnicos(titulos).forEach(a => {
    const opt = document.createElement('option');
    opt.value = a;
    opt.textContent = a;
    anoSelect.appendChild(opt);
  });
}

function ligarFiltros() {
  ['f-busca', 'f-tipo', 'f-avaliacao', 'f-genero', 'f-ano', 'f-ordenacao'].forEach(id => {
    const el = document.getElementById(id);
    el.addEventListener(id === 'f-busca' ? 'input' : 'change', renderResultados);
  });
}

function renderResultados() {
  const filtros = {
    busca: document.getElementById('f-busca').value,
    tipo: document.getElementById('f-tipo').value,
    avaliacao: document.getElementById('f-avaliacao').value,
    genero: document.getElementById('f-genero').value,
    ano: document.getElementById('f-ano').value,
    ordenacao: document.getElementById('f-ordenacao').value
  };

  const resultado = aplicarFiltros(titulos, filtros, modoAtivo);
  const grid = document.getElementById('cards-grid');
  grid.innerHTML = '';

  document.getElementById('results-count').textContent =
    `${resultado.length} título${resultado.length === 1 ? '' : 's'} encontrado${resultado.length === 1 ? '' : 's'}`;

  if (!resultado.length) {
    showEmptyState(grid, 'Nenhum título encontrado com esses filtros.');
    return;
  }

  resultado.forEach(t => {
    const card = renderTituloCard(t, modoAtivo);
    card.addEventListener('click', () => {
      window.location.href = `details.html?id=${t.id}`;
    });
    grid.appendChild(card);
  });
}
