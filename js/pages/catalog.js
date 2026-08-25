// js/pages/catalog.js
import {
  requireSession,
  getCurrentProfile,
  getProfileFromSession,
  getUserId
} from '../auth.js';
import { searchMulti, getDetails } from '../tmdb.js';
import {
  getAllTitulosComAvaliacoes,
  criarTitulo,
  salvarAvaliacao
} from '../titulos.js';
import { aplicarFiltros, extrairGenerosUnicos, extrairAnosUnicos } from '../filters.js';
import { normalizarModoAtivo, aplicarTema } from '../themes.js';
import {
  renderNavbar,
  renderTituloCard,
  safeImageSrc,
  escapeHtml,
  showEmptyState,
  showSpinner,
  showToast
} from '../ui.js';

let titulos = [];
let modoAtivo = 'casal';
let sessionAtual = null;
let perfilAtual = null;
let dadosSelecionados = null;
let buscaExternaTimer = null;

init();

async function init() {
  sessionAtual = await requireSession();
  if (!sessionAtual) return;

  const perfilLogado = getProfileFromSession(sessionAtual);
  perfilAtual = await getCurrentProfile(sessionAtual);
  modoAtivo = normalizarModoAtivo(perfilLogado);
  aplicarTema(modoAtivo);

  renderNavbar(document.getElementById('navbar'), {
    activePage: 'catalog',
    modoAtivo,
    perfilLogado,
    onModoChange: novoModo => {
      modoAtivo = novoModo;
      aplicarTema(novoModo);
      atualizarTituloAvaliacao();
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
  ligarAdicaoInline();

  // Suporte a ?filtro=pendentes vindo de outras páginas
  const params = new URLSearchParams(window.location.search);
  if (params.get('filtro')) {
    document.getElementById('f-avaliacao').value = params.get('filtro');
  }

  renderResultados();

  if (params.get('adicionar') === '1') {
    abrirAdicionar(document.getElementById('f-busca').value);
  }
}

function popularSelects() {
  const generoSelect = document.getElementById('f-genero');
  generoSelect.querySelectorAll('option:not(:first-child)').forEach(opt => opt.remove());
  extrairGenerosUnicos(titulos).forEach(g => {
    const opt = document.createElement('option');
    opt.value = g;
    opt.textContent = g;
    generoSelect.appendChild(opt);
  });

  const anoSelect = document.getElementById('f-ano');
  anoSelect.querySelectorAll('option:not(:first-child)').forEach(opt => opt.remove());
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
    const busca = filtros.busca.trim();
    if (busca.length >= 2) {
      grid.innerHTML = `
        <div class="catalog-empty-action">
          <div class="catalog-empty-icon">🎬</div>
          <h3>Não encontramos “${escapeHtml(busca)}” no seu catálogo</h3>
          <p>Quer procurar esse título e adicioná-lo agora?</p>
          <button class="btn btn-primary" id="search-to-add" type="button">Buscar para adicionar</button>
        </div>`;
      document.getElementById('search-to-add').addEventListener('click', () => abrirAdicionar(busca));
    } else {
      showEmptyState(grid, 'Nenhum título encontrado com esses filtros.');
    }
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

/* ==========================================================================
   Adição dentro do catálogo
   ========================================================================== */

function ligarAdicaoInline() {
  document.getElementById('open-add-view').addEventListener('click', () => abrirAdicionar());
  document.getElementById('close-add-view').addEventListener('click', fecharAdicionar);
  document.getElementById('catalog-cancel-add').addEventListener('click', fecharAdicionar);
  document.getElementById('catalog-change-title').addEventListener('click', voltarParaBuscaAdicionar);
  document.getElementById('catalog-add-form').addEventListener('submit', salvarTituloDoCatalogo);

  const nota = document.getElementById('catalog-rating');
  nota.addEventListener('input', atualizarDisplayNota);
  atualizarDisplayNota();
  atualizarTituloAvaliacao();

  const busca = document.getElementById('catalog-add-search');
  busca.addEventListener('input', () => {
    clearTimeout(buscaExternaTimer);
    buscaExternaTimer = setTimeout(() => buscarParaAdicionar(busca.value), 400);
  });
}

function abrirAdicionar(query = '') {
  document.getElementById('catalog-view').hidden = true;
  document.getElementById('catalog-add-view').hidden = false;
  document.getElementById('open-add-view').hidden = true;
  document.getElementById('catalog-add-form').hidden = true;
  document.getElementById('catalog-add-search-step').hidden = false;
  dadosSelecionados = null;

  const busca = document.getElementById('catalog-add-search');
  busca.value = query;
  document.getElementById('catalog-add-results').innerHTML = '';
  document.getElementById('catalog-review-date').value = new Date().toISOString().slice(0, 10);
  atualizarTituloAvaliacao();

  history.replaceState(null, '', 'catalog.html?adicionar=1');
  window.scrollTo({ top: 0, behavior: 'smooth' });

  if (query.trim().length >= 2) buscarParaAdicionar(query);
  else busca.focus();
}

function fecharAdicionar() {
  clearTimeout(buscaExternaTimer);
  dadosSelecionados = null;
  document.getElementById('catalog-add-form').reset();
  document.getElementById('catalog-add-form').hidden = true;
  document.getElementById('catalog-add-search-step').hidden = false;
  document.getElementById('catalog-add-search').value = '';
  document.getElementById('catalog-add-results').innerHTML = '';
  document.getElementById('catalog-add-view').hidden = true;
  document.getElementById('catalog-view').hidden = false;
  document.getElementById('open-add-view').hidden = false;
  history.replaceState(null, '', 'catalog.html');
  atualizarDisplayNota();
}

async function buscarParaAdicionar(query) {
  const container = document.getElementById('catalog-add-results');
  const termo = query.trim();

  if (termo.length < 2) {
    container.innerHTML = '';
    return;
  }

  showSpinner(container);

  try {
    const resultados = await searchMulti(termo);
    if (!resultados.length) {
      showEmptyState(container, 'Nenhum filme ou série encontrado.');
      return;
    }

    container.innerHTML = '';
    resultados.forEach(resultado => {
      const existente = encontrarTituloExistente(resultado);
      const card = document.createElement('button');
      card.type = 'button';
      card.className = `search-result-card${existente ? ' already-added' : ''}`;
      card.innerHTML = `
        <img src="${safeImageSrc(resultado.capa_url)}" alt="Capa de ${escapeHtml(resultado.nome)}" loading="lazy" />
        <span class="src-body">
          <span class="src-title">${escapeHtml(resultado.nome)}</span>
          <span class="src-meta">${resultado.ano || '—'} · ${resultado.tipo === 'filme' ? 'Filme' : 'Série'}</span>
          <span class="src-status">${existente ? '✓ Já está no catálogo' : '+ Adicionar ao catálogo'}</span>
        </span>`;
      card.addEventListener('click', () => {
        if (existente) window.location.href = `details.html?id=${existente.id}`;
        else selecionarParaAdicionar(resultado);
      });
      container.appendChild(card);
    });
  } catch (error) {
    console.error(error);
    showEmptyState(container, 'Não foi possível buscar agora. Tente novamente.');
  }
}

function encontrarTituloExistente(resultado) {
  return titulos.find(titulo =>
    String(titulo.tmdb_id) === String(resultado.tmdb_id)
    && titulo.tipo === resultado.tipo
  );
}

async function selecionarParaAdicionar(resultado) {
  const container = document.getElementById('catalog-add-results');
  showSpinner(container);

  try {
    dadosSelecionados = await getDetails(resultado.tmdb_id, resultado.tipo);
    mostrarFormularioAdicionar();
  } catch (error) {
    console.error(error);
    showToast('Não foi possível carregar os detalhes desse título.', 'error');
    await buscarParaAdicionar(document.getElementById('catalog-add-search').value);
  }
}

function mostrarFormularioAdicionar() {
  const titulo = dadosSelecionados;
  document.getElementById('catalog-add-search-step').hidden = true;
  document.getElementById('catalog-add-form').hidden = false;
  document.getElementById('catalog-selected-preview').innerHTML = `
    <img src="${safeImageSrc(titulo.capa_url)}" alt="Capa de ${escapeHtml(titulo.nome)}" />
    <div>
      <strong>${escapeHtml(titulo.nome)}</strong>
      <div class="selected-title-meta">${titulo.ano || '—'} · ${titulo.tipo === 'filme' ? 'Filme' : 'Série'}</div>
    </div>`;
  document.getElementById('catalog-review-date').value = new Date().toISOString().slice(0, 10);
  document.getElementById('catalog-rating').value = '7';
  document.getElementById('catalog-observation').value = '';
  atualizarDisplayNota();
}

function voltarParaBuscaAdicionar() {
  dadosSelecionados = null;
  document.getElementById('catalog-add-form').hidden = true;
  document.getElementById('catalog-add-search-step').hidden = false;
  document.getElementById('catalog-add-search').focus();
}

function atualizarDisplayNota() {
  const nota = Number(document.getElementById('catalog-rating').value);
  document.getElementById('catalog-rating-display').textContent = nota.toFixed(1).replace('.', ',');
}

function atualizarTituloAvaliacao() {
  const nome = perfilAtual?.nome_exibicao || perfilAtual?.nome || '';
  document.getElementById('catalog-review-title').textContent = nome
    ? `⭐ Sua avaliação (${nome})`
    : '⭐ Sua avaliação';
}

async function salvarTituloDoCatalogo(event) {
  event.preventDefault();
  if (!dadosSelecionados || !perfilAtual) {
    showToast('Selecione um título antes de salvar.', 'error');
    return;
  }

  const botao = document.getElementById('catalog-save-title');
  botao.disabled = true;
  botao.textContent = 'Adicionando...';

  const usuarioId = getUserId(sessionAtual);
  const nomeAdicionado = dadosSelecionados.nome;
  const camposTitulo = {
    tmdb_id: dadosSelecionados.tmdb_id || null,
    tipo: dadosSelecionados.tipo,
    nome: dadosSelecionados.nome,
    nome_original: dadosSelecionados.nome_original || '',
    ano: dadosSelecionados.ano || null,
    generos: dadosSelecionados.generos || [],
    sinopse: dadosSelecionados.sinopse || '',
    capa_url: dadosSelecionados.capa_url || null,
    backdrop_url: dadosSelecionados.backdrop_url || null,
    data_assistido: document.getElementById('catalog-watched-date').value || null,
    quero_assistir: false
  };

  try {
    const titulo = await criarTitulo(camposTitulo, usuarioId);
    await salvarAvaliacao({
      tituloId: titulo.id,
      usuarioId,
      nota: Number(document.getElementById('catalog-rating').value),
      observacao: document.getElementById('catalog-observation').value.trim(),
      dataAvaliacao: document.getElementById('catalog-review-date').value
    });

    titulos = await getAllTitulosComAvaliacoes();
    popularSelects();
    fecharAdicionar();
    document.getElementById('f-busca').value = nomeAdicionado;
    renderResultados();
    showToast(`“${nomeAdicionado}” foi adicionado ao catálogo.`);
  } catch (error) {
    console.error(error);
    showToast('Não foi possível adicionar o título.', 'error');
  } finally {
    botao.disabled = false;
    botao.textContent = 'Adicionar ao catálogo';
  }
}
