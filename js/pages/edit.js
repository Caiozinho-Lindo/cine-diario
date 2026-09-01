// js/pages/edit.js
import { requireSession, getCurrentProfile, getUserId } from '../auth.js';
import { atualizarTitulo, salvarAvaliacao, getTituloComAvaliacoes } from '../titulos.js';
import { normalizarModoAtivo, aplicarTema } from '../themes.js';
import { renderNavbar, safeImageSrc, escapeHtml, showToast } from '../ui.js';
import { getEspacoAtivo, getMembrosDoEspaco } from '../espacos.js';
import { confirmarSessao } from '../sessoes.js';

let sessionAtual = null;
let perfilAtual = null;
let membrosEspaco = [];
let dadosSelecionados = null;
let tituloExistente = null;
let editId = null;
let sessaoId = null;

init();

async function init() {
  sessionAtual = await requireSession();
  if (!sessionAtual) return;

  const params = new URLSearchParams(window.location.search);
  editId = params.get('edit');
  sessaoId = params.get('sessao');
  if (!editId) {
    window.location.replace('catalog.html?adicionar=1');
    return;
  }

  perfilAtual = await getCurrentProfile(sessionAtual);
  const espacoAtivo = await getEspacoAtivo();
  membrosEspaco = await getMembrosDoEspaco(espacoAtivo.id);
  const usuarioId = getUserId(sessionAtual);
  const modoAtivo = normalizarModoAtivo(membrosEspaco, usuarioId);
  aplicarTema(perfilAtual?.tema, perfilAtual?.cor_destaque);

  renderNavbar(document.getElementById('navbar'), {
    activePage: 'catalog',
    modoAtivo,
    perfilAtual,
    membros: membrosEspaco,
    usuarioId,
    onModoChange: () => {}
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

async function iniciarModoEdicao(id) {
  document.getElementById('page-heading').textContent = 'Editar e avaliar';

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

function mostrarFormulario() {
  const d = dadosSelecionados;

  document.getElementById('title-form').hidden = false;

  document.getElementById('selected-preview').innerHTML = `
    <img src="${safeImageSrc(d.capa_url)}" alt="Capa de ${escapeHtml(d.nome)}" />
    <div>
      <div style="font-weight:600;">${escapeHtml(d.nome)}</div>
      <div style="font-size:0.82rem; color:var(--text-secondary);">${d.ano || '—'} · ${d.tipo === 'filme' ? 'Filme' : 'Série'}</div>
    </div>
  `;

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
  if (sessaoId && !document.getElementById('f-data-assistido').value) {
    document.getElementById('f-data-assistido').value = new Date().toISOString().slice(0, 10);
  }
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
    const atualizado = await atualizarTitulo(editId, camposTitulo);
    const tituloId = atualizado.id;

    await salvarAvaliacao({
      tituloId,
      usuarioId,
      nota: parseFloat(document.getElementById('f-nota').value),
      observacao: document.getElementById('f-observacao').value.trim(),
      dataAvaliacao: document.getElementById('f-data-avaliacao').value
    });

    if (sessaoId) await confirmarSessao(sessaoId);

    showToast('Título salvo com sucesso!');
    window.location.href = `details.html?id=${tituloId}`;
  } catch (err) {
    console.error(err);
    showToast('Erro ao salvar. Verifique sua conexão com o Supabase.', 'error');
    btn.disabled = false;
    btn.textContent = 'Salvar';
  }
}
