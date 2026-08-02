// js/pages/catalog.js
// Página única do Catálogo, com 3 abas: Todos / Pendentes / Adicionar.
// As abas trocam de conteúdo via JS (sem navegar de página, sem trocar a URL).

import { requireSession, getProfileFromSession, getUserId } from '../auth.js';
import { searchMulti, getDetails } from '../tmdb.js';
import {
  getAllTitulosComAvaliacoes,
  getTituloComAvaliacoes,
  criarTitulo,
  atualizarTitulo,
  salvarAvaliacao
} from '../titulos.js';
import { aplicarFiltros, extrairGenerosUnicos, extrairAnosUnicos } from '../filters.js';
import { getModoAtivo, aplicarTema } from '../themes.js';
import { renderNavbar, renderTituloCard, placeholderCapa, escapeHtml, showEmptyState, showSpinner, showToast } from '../ui.js';

let sessionAtual = null;
let perfilLogado = null; // 'caio' | 'noemy'
let modoAtivo = 'casal';
let titulos = [];
let activeTab = 'todos';
let previousTab = 'todos'; // pra onde "Cancelar" volta

// estado da aba Adicionar
let dadosSelecionados = null;
let tituloExistente = null;
let editId = null;

init();

async function init() {
  sessionAtual = await requireSession();
  if (!sessionAtual) return;

  perfilLogado = getProfileFromSession(sessionAtual);
  modoAtivo = getModoAtivo();
  aplicarTema(modoAtivo);

  renderNavbar(document.getElementById('navbar'), {
    activePage: 'catalog',
    modoAtivo,
    perfilLogado,
    onModoChange: novoModo => {
      modoAtivo = novoModo;
      aplicarTema(novoModo);
      atualizarTextosDePerfil();
      renderTabAtiva();
    }
  });

  atualizarTextosDePerfil();
  ligarSubTabs();
  ligarFiltrosTodos();
  ligarFormularioAdicionar();

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

  // Lê parâmetros de entrada (só na carga inicial da página, não durante a troca de abas)
  const params = new URLSearchParams(window.location.search);
  if (params.get('filtro')) {
    document.getElementById('f-avaliacao').value = params.get('filtro');
  }

  const tabInicial = params.get('tab');
  const editInicial = params.get('edit');

  if (tabInicial === 'adicionar') {
    if (editInicial) {
      switchTab('adicionar', { edit: editInicial });
    } else {
      switchTab('adicionar');
    }
  } else if (tabInicial === 'pendentes') {
    switchTab('pendentes');
  } else {
    switchTab('todos');
  }
}

function atualizarTextosDePerfil() {
  const label = document.getElementById('f-so-minhas-pendentes-label');
  if (label) {
    label.textContent = perfilLogado === 'noemy' ? 'Só pendentes para mim (Noemy)' : 'Só pendentes para mim (Caio)';
  }
}

/* ==========================================================================
   Navegação entre abas
   ========================================================================== */

function ligarSubTabs() {
  document.querySelectorAll('.sub-tab').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
}

function switchTab(tab, options = {}) {
  if (activeTab !== 'adicionar') previousTab = activeTab;
  activeTab = tab;

  document.querySelectorAll('.sub-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  document.getElementById('view-todos').hidden = tab !== 'todos';
  document.getElementById('view-pendentes').hidden = tab !== 'pendentes';
  document.getElementById('view-adicionar').hidden = tab !== 'adicionar';

  if (tab === 'adicionar') {
    prepararAbaAdicionar(options.edit || null);
  } else if (tab === 'pendentes') {
    renderPendentes();
  } else {
    renderTodos();
  }
}

function renderTabAtiva() {
  atualizarContadorPendentes();
  if (activeTab === 'pendentes') renderPendentes();
  else if (activeTab === 'todos') renderTodos();
}

function atualizarContadorPendentes() {
  const n = pendentesDoPerfilAtivo().length;
  document.getElementById('pendentes-count').textContent = n > 0 ? String(n) : '';
}

/* ==========================================================================
   ABA: Todos
   ========================================================================== */

function popularSelects() {
  const generoSelect = document.getElementById('f-genero');
  generoSelect.querySelectorAll('option:not(:first-child)').forEach(o => o.remove());
  extrairGenerosUnicos(titulos).forEach(g => {
    const opt = document.createElement('option');
    opt.value = g;
    opt.textContent = g;
    generoSelect.appendChild(opt);
  });

  const anoSelect = document.getElementById('f-ano');
  anoSelect.querySelectorAll('option:not(:first-child)').forEach(o => o.remove());
  extrairAnosUnicos(titulos).forEach(a => {
    const opt = document.createElement('option');
    opt.value = a;
    opt.textContent = a;
    anoSelect.appendChild(opt);
  });

  atualizarContadorPendentes();
}

function ligarFiltrosTodos() {
  ['f-busca', 'f-tipo', 'f-avaliacao', 'f-genero', 'f-ano', 'f-ordenacao'].forEach(id => {
    const el = document.getElementById(id);
    el.addEventListener(id === 'f-busca' ? 'input' : 'change', renderTodos);
  });
  document.getElementById('f-so-minhas-pendentes').addEventListener('change', renderTodos);
}

function renderTodos() {
  const filtros = {
    busca: document.getElementById('f-busca').value,
    tipo: document.getElementById('f-tipo').value,
    avaliacao: document.getElementById('f-avaliacao').value,
    genero: document.getElementById('f-genero').value,
    ano: document.getElementById('f-ano').value,
    ordenacao: document.getElementById('f-ordenacao').value
  };

  let resultado = aplicarFiltros(titulos, filtros, modoAtivo);

  if (document.getElementById('f-so-minhas-pendentes').checked) {
    const idsPendentesPraMim = new Set(pendentesDoPerfilAtivo().map(t => t.id));
    resultado = resultado.filter(t => idsPendentesPraMim.has(t.id));
  }

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

/* ==========================================================================
   ABA: Pendentes
   ========================================================================== */

/**
 * Pendentes "pra mim": se o modo ativo for caio/noemy, é o que falta essa
 * pessoa avaliar. No modo "casal" (sem pessoa específica), cai no genérico
 * (pendente de qualquer um dos dois).
 */
function pendentesDoPerfilAtivo() {
  if (modoAtivo === 'caio') {
    return titulos.filter(t => t.status === 'aguardando_caio' || t.status === 'sem_avaliacao');
  }
  if (modoAtivo === 'noemy') {
    return titulos.filter(t => t.status === 'aguardando_noemy' || t.status === 'sem_avaliacao');
  }
  return titulos.filter(t => t.pendente);
}

function renderPendentes() {
  atualizarContadorPendentes();

  const grid = document.getElementById('pendentes-grid');
  const subtitle = document.getElementById('pendentes-subtitle');
  grid.innerHTML = '';

  const lista = pendentesDoPerfilAtivo();

  subtitle.textContent = modoAtivo === 'casal'
    ? `${lista.length} título${lista.length === 1 ? '' : 's'} aguardando avaliação de alguém`
    : `${lista.length} título${lista.length === 1 ? '' : 's'} aguardando sua avaliação`;

  if (!lista.length) {
    showEmptyState(grid, 'Nenhum título pendente por aqui. 🎉');
    return;
  }

  lista.forEach(t => {
    const card = renderTituloCard(t, modoAtivo);
    card.addEventListener('click', () => {
      window.location.href = `details.html?id=${t.id}`;
    });

    const actions = document.createElement('div');
    actions.className = 'pending-card-actions';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-primary btn-sm';
    btn.textContent = 'Avaliar';
    btn.addEventListener('click', e => {
      e.stopPropagation();
      switchTab('adicionar', { edit: t.id });
    });
    actions.appendChild(btn);
    card.appendChild(actions);

    grid.appendChild(card);
  });
}

/* ==========================================================================
   ABA: Adicionar (busca TMDB + formulário de criação/edição)
   ========================================================================== */

function ligarFormularioAdicionar() {
  document.getElementById('f-nota').addEventListener('input', atualizarDisplayNota);

  const input = document.getElementById('search-input');
  let debounceTimer = null;
  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => executarBusca(input.value), 400);
  });

  document.getElementById('title-form').addEventListener('submit', onSubmit);
  document.getElementById('cancelar-adicionar-btn').addEventListener('click', cancelarAdicionar);
}

async function prepararAbaAdicionar(id) {
  editId = id;
  dadosSelecionados = null;
  tituloExistente = null;

  document.getElementById('own-review-title').textContent =
    perfilLogado === 'noemy' ? '🌷 Sua avaliação (Noemy)' : '👤 Sua avaliação (Caio)';
  document.getElementById('other-review-title').textContent =
    perfilLogado === 'noemy' ? '👤 Avaliação do Caio' : '🌷 Avaliação da Noemy';

  document.getElementById('search-input').value = '';
  document.getElementById('search-results').innerHTML = '';
  document.getElementById('title-form').reset();
  atualizarDisplayNota();

  if (editId) {
    document.getElementById('adicionar-heading').textContent = 'Avaliar / editar título';
    document.getElementById('search-step').hidden = true;
    document.getElementById('title-form').hidden = true;

    try {
      tituloExistente = await getTituloComAvaliacoes(editId);
      dadosSelecionados = { ...tituloExistente };
      mostrarFormulario();

      const minhaAvaliacao = perfilLogado === 'noemy' ? tituloExistente.avaliacaoNoemy : tituloExistente.avaliacaoCaio;
      if (minhaAvaliacao) {
        document.getElementById('f-nota').value = minhaAvaliacao.nota;
        document.getElementById('f-observacao').value = minhaAvaliacao.observacao || '';
        document.getElementById('f-data-avaliacao').value = minhaAvaliacao.data_avaliacao;
        atualizarDisplayNota();
      }
      renderOutraAvaliacao();
    } catch (err) {
      console.error(err);
      showToast('Não foi possível carregar este título para edição.', 'error');
    }
  } else {
    document.getElementById('adicionar-heading').textContent = 'Adicionar filme ou série';
    document.getElementById('search-step').hidden = false;
    document.getElementById('title-form').hidden = true;
    document.getElementById('other-review-display').innerHTML = '<p class="review-pending">Aguardando avaliação.</p>';
    document.getElementById('search-input').focus();
  }
}

async function executarBusca(query) {
  const container = document.getElementById('search-results');

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
        <img src="${r.capa_url || placeholderCapa()}" alt="Capa de ${escapeHtml(r.nome)}" loading="lazy" />
        <div class="src-body">
          <div class="src-title">${escapeHtml(r.nome)}</div>
          <div class="src-meta">${r.ano || '—'} · ${r.tipo === 'filme' ? 'Filme' : 'Série'}</div>
        </div>
      `;
      card.addEventListener('click', () => selecionarResultado(r));
      container.appendChild(card);
    });
  } catch (err) {
    console.error(err);
    container.innerHTML = '<p class="empty-state">Erro ao buscar no TMDB. Verifique sua chave em config.js.</p>';
  }
}

async function selecionarResultado(resumo) {
  try {
    const completos = await getDetails(resumo.tmdb_id, resumo.tipo);
    dadosSelecionados = completos;
    mostrarFormulario();
  } catch (err) {
    console.error(err);
    showToast('Erro ao carregar detalhes do TMDB.', 'error');
  }
}

function renderOutraAvaliacao() {
  const container = document.getElementById('other-review-display');
  const outra = perfilLogado === 'noemy' ? tituloExistente?.avaliacaoCaio : tituloExistente?.avaliacaoNoemy;

  if (!outra) {
    container.innerHTML = '<p class="review-pending">Aguardando avaliação.</p>';
    return;
  }

  container.innerHTML = `
    <div class="review-score" style="font-size:1.6rem;">${outra.nota}<small> /10</small></div>
    ${outra.observacao ? `<div class="review-note">“${escapeHtml(outra.observacao)}”</div>` : ''}
  `;
}

function mostrarFormulario() {
  const d = dadosSelecionados;

  document.getElementById('search-step').hidden = true;
  document.getElementById('title-form').hidden = false;

  document.getElementById('selected-preview').innerHTML = `
    <img src="${d.capa_url || placeholderCapa()}" alt="Capa de ${escapeHtml(d.nome)}" />
    <div>
      <div style="font-weight:600;">${escapeHtml(d.nome)}</div>
      <div style="font-size:0.82rem; color:var(--text-secondary);">${d.ano || '—'} · ${d.tipo === 'filme' ? 'Filme' : 'Série'}</div>
    </div>
    ${!editId ? '<button type="button" class="btn btn-secondary btn-sm change-btn" id="change-title-btn">Trocar título</button>' : ''}
  `;

  if (!editId) {
    document.getElementById('change-title-btn').addEventListener('click', voltarParaBusca);
  }

  document.getElementById('f-nome').value = d.nome || '';
  document.getElementById('f-nome-original').value = d.nome_original || '';
  document.getElementById('f-ano-titulo').value = d.ano || '';
  document.getElementById('f-tipo-titulo').value = d.tipo || 'filme';
  document.getElementById('f-generos').value = (d.generos || []).join(', ');
  document.getElementById('f-sinopse').value = d.sinopse || '';
  document.getElementById('f-capa').value = d.capa_url || '';
  document.getElementById('f-data-assistido').value = d.data_assistido || '';

  if (!document.getElementById('f-data-avaliacao').value) {
    document.getElementById('f-data-avaliacao').value = new Date().toISOString().slice(0, 10);
  }
}

function voltarParaBusca() {
  dadosSelecionados = null;
  document.getElementById('title-form').hidden = true;
  document.getElementById('search-step').hidden = false;
  document.getElementById('search-input').value = '';
  document.getElementById('search-input').focus();
}

function atualizarDisplayNota() {
  const val = parseFloat(document.getElementById('f-nota').value);
  document.getElementById('f-nota-display').textContent = (isNaN(val) ? 7 : val).toFixed(1).replace('.', ',');
}

function cancelarAdicionar() {
  switchTab(previousTab === 'adicionar' ? 'todos' : previousTab);
}

async function onSubmit(e) {
  e.preventDefault();

  if (!perfilLogado) {
    showToast('Não é possível salvar: usuário sem perfil associado.', 'error');
    return;
  }

  const btn = document.getElementById('save-btn');
  btn.disabled = true;
  btn.textContent = 'Salvando...';

  const camposTitulo = {
    tmdb_id: dadosSelecionados.tmdb_id || null,
    tipo: document.getElementById('f-tipo-titulo').value,
    nome: document.getElementById('f-nome').value.trim(),
    nome_original: document.getElementById('f-nome-original').value.trim(),
    ano: document.getElementById('f-ano-titulo').value ? parseInt(document.getElementById('f-ano-titulo').value, 10) : null,
    generos: document.getElementById('f-generos').value.split(',').map(g => g.trim()).filter(Boolean),
    sinopse: document.getElementById('f-sinopse').value.trim(),
    capa_url: document.getElementById('f-capa').value.trim() || null,
    backdrop_url: dadosSelecionados.backdrop_url || null,
    data_assistido: document.getElementById('f-data-assistido').value || null,
    quero_assistir: false // ao avaliar, o título sai da lista "para assistir"
  };

  const usuarioId = getUserId(sessionAtual);

  try {
    let tituloId;
    if (editId) {
      const atualizado = await atualizarTitulo(editId, camposTitulo);
      tituloId = atualizado.id;
    } else {
      const criado = await criarTitulo(camposTitulo, usuarioId);
      tituloId = criado.id;
    }

    await salvarAvaliacao({
      tituloId,
      usuarioId,
      nota: parseFloat(document.getElementById('f-nota').value),
      observacao: document.getElementById('f-observacao').value.trim(),
      dataAvaliacao: document.getElementById('f-data-avaliacao').value
    });

    showToast('Título salvo com sucesso!');

    // recarrega os dados em memória e volta pra uma listagem
    titulos = await getAllTitulosComAvaliacoes();
    popularSelects();
    switchTab(previousTab === 'adicionar' ? 'todos' : previousTab);
  } catch (err) {
    console.error(err);
    showToast('Erro ao salvar. Verifique sua conexão com o Supabase.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Salvar';
  }
}
