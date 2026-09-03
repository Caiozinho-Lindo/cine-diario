// js/pages/catalog.js
import {
  requireSession,
  getCurrentProfile,
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
import { getEspacoAtivo, getMembrosDoEspaco } from '../espacos.js';
import {
  renderNavbar,
  renderTituloCard,
  safeImageSrc,
  escapeHtml,
  showEmptyState,
  showSpinner,
  showToast
} from '../ui.js?v=20260902.2';

let titulos = [];
let modoAtivo = 'geral';
let sessionAtual = null;
let perfilAtual = null;
let dadosSelecionados = null;
let buscaExternaTimer = null;
let secaoCatalogo = 'todos';
let membrosEspaco = [];
let limiteResultados = 24;
let modoAdicionar = 'assistido';

const RESULTADOS_POR_PAGINA = 24;

init();

async function init() {
  sessionAtual = await requireSession();
  if (!sessionAtual) return;

  perfilAtual = await getCurrentProfile(sessionAtual);
  const usuarioId = getUserId(sessionAtual);
  const espacoAtivo = await getEspacoAtivo();
  membrosEspaco = await getMembrosDoEspaco(espacoAtivo.id);
  modoAtivo = normalizarModoAtivo(membrosEspaco, usuarioId);
  aplicarTema(perfilAtual?.tema, perfilAtual?.cor_destaque);

  renderNavbar(document.getElementById('navbar'), {
    activePage: 'catalog',
    modoAtivo,
    perfilAtual,
    membros: membrosEspaco,
    usuarioId,
    onModoChange: novoModo => {
      modoAtivo = novoModo;
      atualizarTituloAvaliacao();
      renderResultados();
    }
  });

  const grid = document.getElementById('cards-grid');
  showSpinner(grid);

  try {
    titulos = await getAllTitulosComAvaliacoes({ incluirDesejos: true });
  } catch (err) {
    console.error(err);
    showToast('Erro ao carregar títulos.', 'error');
    showEmptyState(grid, 'Não foi possível carregar os títulos.');
    return;
  }

  atualizarTotalCatalogo();
  popularSelects();
  ligarFiltros();
  ligarNavegacaoCatalogo();
  ligarAdicaoInline();

  // Suporte a ?filtro=pendentes vindo de outras páginas
  const params = new URLSearchParams(window.location.search);
  secaoCatalogo = normalizarSecao(params.get('secao'));
  atualizarAbasCatalogo();
  if (params.get('filtro')) {
    document.getElementById('f-avaliacao').value = params.get('filtro');
    abrirFiltrosExtras();
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
    el.addEventListener(id === 'f-busca' ? 'input' : 'change', () => {
      limiteResultados = RESULTADOS_POR_PAGINA;
      atualizarEstadoFiltrosExtras();
      renderResultados();
    });
  });

  document.getElementById('toggle-extra-filters').addEventListener('click', alternarFiltrosExtras);
  document.getElementById('clear-catalog-filters').addEventListener('click', limparFiltrosCatalogo);
  document.getElementById('catalog-load-more').addEventListener('click', () => {
    limiteResultados += RESULTADOS_POR_PAGINA;
    renderResultados();
  });
}

function ligarNavegacaoCatalogo() {
  document.querySelectorAll('[data-catalog-section]').forEach(botao => {
    botao.addEventListener('click', () => {
      secaoCatalogo = normalizarSecao(botao.dataset.catalogSection);
      limiteResultados = RESULTADOS_POR_PAGINA;
      document.getElementById('f-avaliacao').value = '';
      atualizarAbasCatalogo();
      atualizarUrlCatalogo();
      atualizarEstadoFiltrosExtras();
      renderResultados();
    });
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

  const titulosDaSecao = filtrarPorSecao(titulos);
  const resultado = aplicarFiltros(titulosDaSecao, filtros, modoAtivo);
  const resultadoVisivel = resultado.slice(0, limiteResultados);
  const grid = document.getElementById('cards-grid');
  const botaoCarregarMais = document.getElementById('catalog-load-more');
  grid.innerHTML = '';

  document.getElementById('results-count').textContent =
    `${resultado.length} título${resultado.length === 1 ? '' : 's'} encontrado${resultado.length === 1 ? '' : 's'}`;
  botaoCarregarMais.hidden = resultado.length <= limiteResultados;
  if (!botaoCarregarMais.hidden) {
    const restantes = resultado.length - limiteResultados;
    botaoCarregarMais.textContent = `Carregar mais (${Math.min(RESULTADOS_POR_PAGINA, restantes)})`;
  }

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

  resultadoVisivel.forEach(t => {
    const card = renderTituloCard(t, modoAtivo, { compactoCatalogo: true });
    card.addEventListener('click', () => {
      window.location.href = `details.html?id=${t.id}`;
    });
    grid.appendChild(card);
  });
}

function atualizarAbasCatalogo() {
  document.querySelectorAll('[data-catalog-section]').forEach(botao => {
    const ativa = botao.dataset.catalogSection === secaoCatalogo;
    botao.classList.toggle('active', ativa);
    botao.setAttribute('aria-selected', String(ativa));
  });
  atualizarBotaoAdicionar();
}

function filtrarPorSecao(lista) {
  if (secaoCatalogo === 'assistidos') return lista.filter(titulo => !titulo.quero_assistir);
  if (secaoCatalogo === 'para_assistir') return lista.filter(titulo => titulo.quero_assistir);
  return lista;
}

function normalizarSecao(secao) {
  return ['assistidos', 'para_assistir'].includes(secao) ? secao : 'todos';
}

function atualizarTotalCatalogo() {
  const total = titulos.length;
  document.getElementById('catalog-total-count').textContent =
    `${total} título${total === 1 ? '' : 's'} no espaço`;
}

function atualizarBotaoAdicionar() {
  const botao = document.getElementById('open-add-view');
  botao.textContent = secaoCatalogo === 'para_assistir'
    ? '+ Adicionar à lista'
    : '+ Adicionar título';
}

function atualizarUrlCatalogo() {
  const url = new URL(window.location.href);
  url.search = '';
  if (secaoCatalogo !== 'todos') url.searchParams.set('secao', secaoCatalogo);
  history.replaceState(null, '', `${url.pathname.split('/').pop()}${url.search}`);
}

function alternarFiltrosExtras() {
  const painel = document.getElementById('catalog-extra-filters');
  if (painel.hidden) abrirFiltrosExtras();
  else fecharFiltrosExtras();
}

function abrirFiltrosExtras() {
  const painel = document.getElementById('catalog-extra-filters');
  painel.hidden = false;
  document.getElementById('toggle-extra-filters').setAttribute('aria-expanded', 'true');
}

function fecharFiltrosExtras() {
  const painel = document.getElementById('catalog-extra-filters');
  painel.hidden = true;
  document.getElementById('toggle-extra-filters').setAttribute('aria-expanded', 'false');
}

function atualizarEstadoFiltrosExtras() {
  const ativos = Boolean(
    document.getElementById('f-avaliacao').value
    || document.getElementById('f-ano').value
  );
  document.getElementById('toggle-extra-filters').classList.toggle('has-active-filters', ativos);
}

function limparFiltrosCatalogo() {
  document.getElementById('f-tipo').value = 'todos';
  document.getElementById('f-avaliacao').value = '';
  document.getElementById('f-genero').value = '';
  document.getElementById('f-ano').value = '';
  document.getElementById('f-ordenacao').value = 'recentes';
  limiteResultados = RESULTADOS_POR_PAGINA;
  atualizarEstadoFiltrosExtras();
  renderResultados();
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
  modoAdicionar = secaoCatalogo === 'para_assistir' ? 'lista' : 'assistido';
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

  document.getElementById('catalog-add-title').textContent = modoAdicionar === 'lista'
    ? 'Adicionar à lista “Para assistir”'
    : 'Adicionar filme ou série';
  document.getElementById('catalog-add-description').textContent = modoAdicionar === 'lista'
    ? 'Pesquise e escolha um título para guardar na lista deste espaço.'
    : 'Pesquise o título, selecione o resultado correto e registre sua avaliação.';

  const url = new URL(window.location.href);
  url.search = '';
  if (secaoCatalogo !== 'todos') url.searchParams.set('secao', secaoCatalogo);
  url.searchParams.set('adicionar', '1');
  history.replaceState(null, '', `${url.pathname.split('/').pop()}${url.search}`);
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
  atualizarUrlCatalogo();
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
      const status = textoStatusResultado(existente);
      const card = document.createElement('button');
      card.type = 'button';
      card.className = `search-result-card${existente ? ' already-added' : ''}`;
      card.innerHTML = `
        <img src="${safeImageSrc(resultado.capa_url)}" alt="Capa de ${escapeHtml(resultado.nome)}" loading="lazy" />
          <span class="src-body">
          <span class="src-title">${escapeHtml(resultado.nome)}</span>
          <span class="src-meta">${resultado.ano || '—'} · ${resultado.tipo === 'filme' ? 'Filme' : 'Série'}</span>
          <span class="src-status">${status}</span>
        </span>`;
      card.addEventListener('click', () => {
        if (existente && (!existente.quero_assistir || modoAdicionar === 'lista')) {
          window.location.href = `details.html?id=${existente.id}`;
        } else if (modoAdicionar === 'lista') {
          adicionarDiretoNaLista(resultado);
        } else {
          selecionarParaAdicionar(resultado);
        }
      });
      container.appendChild(card);
    });
  } catch (error) {
    console.error(error);
    showEmptyState(container, 'Não foi possível buscar agora. Tente novamente.');
  }
}

function textoStatusResultado(existente) {
  if (existente?.quero_assistir && modoAdicionar === 'assistido') return '+ Marcar como assistido e avaliar';
  if (existente?.quero_assistir) return '✓ Já está na lista';
  if (existente) return '✓ Já está no catálogo';
  return modoAdicionar === 'lista' ? '+ Adicionar à lista' : '+ Adicionar e avaliar';
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

async function adicionarDiretoNaLista(resultado) {
  const container = document.getElementById('catalog-add-results');
  showSpinner(container);

  try {
    const detalhes = await getDetails(resultado.tmdb_id, resultado.tipo);
    const usuarioId = getUserId(sessionAtual);
    const titulo = await criarTitulo({ ...detalhes, quero_assistir: true }, usuarioId);

    if (titulo.jaExistia) {
      showToast('Esse título já está na lista.', 'error');
      await buscarParaAdicionar(document.getElementById('catalog-add-search').value);
      return;
    }

    titulos = await getAllTitulosComAvaliacoes({ incluirDesejos: true });
    atualizarTotalCatalogo();
    popularSelects();
    fecharAdicionar();
    renderResultados();
    showToast(`“${detalhes.nome}” foi adicionado à lista.`);
  } catch (error) {
    console.error(error);
    showToast('Não foi possível adicionar esse título à lista.', 'error');
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

    titulos = await getAllTitulosComAvaliacoes({ incluirDesejos: true });
    atualizarTotalCatalogo();
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
