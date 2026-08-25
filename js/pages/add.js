// js/pages/add.js
import { requireSession, getCurrentProfile, getProfileFromSession, getUserId } from '../auth.js';
import { searchMulti, getDetails } from '../tmdb.js';
import { criarTitulo, atualizarTitulo, salvarAvaliacao, getTituloComAvaliacoes } from '../titulos.js';
import { normalizarModoAtivo, aplicarTema } from '../themes.js';
import { renderNavbar, safeImageSrc, escapeHtml, showToast } from '../ui.js';
import { getEspacoAtivo, getMembrosDoEspaco } from '../espacos.js';

let sessionAtual = null;
let perfilAtual = null;
let membrosEspaco = [];
let dadosSelecionados = null; // dados do título (do TMDB ou já existentes)
let tituloExistente = null;   // preenchido em modo edição
let editId = null;

init();

async function init() {
  sessionAtual = await requireSession();
  if (!sessionAtual) return;

  editId = new URLSearchParams(window.location.search).get('edit');
  if (!editId) {
    window.location.replace('catalog.html?adicionar=1');
    return;
  }

  perfilAtual = await getCurrentProfile(sessionAtual);
  const perfilNavbar = getProfileFromSession(sessionAtual);
  const espacoAtivo = await getEspacoAtivo();
  membrosEspaco = await getMembrosDoEspaco(espacoAtivo.id);
  const modoAtivo = normalizarModoAtivo(perfilNavbar);
  aplicarTema(modoAtivo);

  renderNavbar(document.getElementById('navbar'), {
    activePage: 'catalog',
    modoAtivo,
    perfilLogado: perfilNavbar,
    onModoChange: novoModo => aplicarTema(novoModo)
  });

  if (!perfilAtual) {
    showToast('Este usuário não está associado a um perfil.', 'error');
  }

  configurarSecoesDeAvaliacao();

  document.getElementById('f-nota').addEventListener('input', atualizarDisplayNota);
  atualizarDisplayNota();

  await iniciarModoEdicao(editId);

  document.getElementById('title-form').addEventListener('submit', onSubmit);
}

/* ==========================================================================
   Modo criação — busca no TMDB
   ========================================================================== */

function iniciarModoCriacao() {
  const input = document.getElementById('search-input');
  let debounceTimer = null;

  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => executarBusca(input.value), 400);
  });
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
        <img src="${safeImageSrc(r.capa_url)}" alt="Capa de ${escapeHtml(r.nome)}" loading="lazy" />
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

/* ==========================================================================
   Modo edição
   ========================================================================== */

async function iniciarModoEdicao(id) {
  document.getElementById('page-heading').textContent = 'Editar título';
  document.getElementById('search-step').hidden = true;

  try {
    tituloExistente = await getTituloComAvaliacoes(id);
    dadosSelecionados = { ...tituloExistente };
    mostrarFormulario();

    // Se a pessoa logada já avaliou, pré-preenche com a avaliação existente
    const usuarioId = getUserId(sessionAtual);
    const minhaAvaliacao = tituloExistente.avaliacoesMembros
      ?.find(item => item.membro.usuario_id === usuarioId)?.avaliacao;
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
}

function renderOutraAvaliacao() {
  const section = document.getElementById('other-review-section');
  const container = document.getElementById('other-review-display');
  const usuarioId = getUserId(sessionAtual);
  const outras = (tituloExistente?.avaliacoesMembros || [])
    .filter(item => item.membro.usuario_id !== usuarioId);

  section.hidden = outras.length === 0;
  if (!outras.length) return;

  container.innerHTML = outras.map(({ membro, avaliacao }) => {
    const nome = membro.perfil?.nome_exibicao || membro.perfil?.nome || 'Participante';
    if (!avaliacao) {
      return `<div><strong>${escapeHtml(nome)}</strong><p class="review-pending">Aguardando avaliação.</p></div>`;
    }

    return `<div>
      <strong>${escapeHtml(nome)}</strong>
      <div class="review-score" style="font-size:1.6rem;">${avaliacao.nota}<small> /10</small></div>
      ${avaliacao.observacao ? `<div class="review-note">“${escapeHtml(avaliacao.observacao)}”</div>` : ''}
    </div>`;
  }).join('');
}

function configurarSecoesDeAvaliacao() {
  const nome = perfilAtual?.nome_exibicao || perfilAtual?.nome || '';
  document.getElementById('own-review-title').textContent = nome
    ? `⭐ Sua avaliação (${nome})`
    : '⭐ Sua avaliação';

  const outros = membrosEspaco.filter(membro => membro.usuario_id !== getUserId(sessionAtual));
  document.getElementById('other-review-section').hidden = outros.length === 0;
  document.getElementById('other-review-title').textContent =
    outros.length === 1 ? 'Avaliação da outra pessoa' : 'Avaliações de outras pessoas';
}

/* ==========================================================================
   Formulário compartilhado
   ========================================================================== */

function mostrarFormulario() {
  const d = dadosSelecionados;

  document.getElementById('search-step').hidden = true;
  document.getElementById('title-form').hidden = false;

  document.getElementById('selected-preview').innerHTML = `
    <img src="${safeImageSrc(d.capa_url)}" alt="Capa de ${escapeHtml(d.nome)}" />
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
  document.getElementById('f-ano').value = d.ano || '';
  document.getElementById('f-tipo').value = d.tipo || 'filme';
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
  document.getElementById('f-nota-display').textContent = val.toFixed(1).replace('.', ',');
}

async function onSubmit(e) {
  e.preventDefault();

  if (!perfilAtual) {
    showToast('Não é possível salvar: usuário sem perfil associado.', 'error');
    return;
  }

  const btn = document.getElementById('save-btn');
  btn.disabled = true;
  btn.textContent = 'Salvando...';

  const camposTitulo = {
    tmdb_id: dadosSelecionados.tmdb_id || null,
    tipo: document.getElementById('f-tipo').value,
    nome: document.getElementById('f-nome').value.trim(),
    nome_original: document.getElementById('f-nome-original').value.trim(),
    ano: document.getElementById('f-ano').value ? parseInt(document.getElementById('f-ano').value, 10) : null,
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
    window.location.href = `details.html?id=${tituloId}`;
  } catch (err) {
    console.error(err);
    showToast('Erro ao salvar. Verifique sua conexão com o Supabase.', 'error');
    btn.disabled = false;
    btn.textContent = 'Salvar';
  }
}
