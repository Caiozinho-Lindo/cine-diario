// js/pages/edit.js
import { requireSession, getCurrentProfile, getUserId } from '../auth.js';
import { atualizarTitulo, salvarAvaliacao, getTituloComAvaliacoes } from '../titulos.js';
import { normalizarModoAtivo, aplicarTema } from '../themes.js?v=20260910.1';
import { renderNavbar, safeImageSrc, escapeHtml, showToast, concluirCarregamentoInicial } from '../ui.js?v=20260910.1';
import { getEspacoAtivo, getMembrosDoEspaco } from '../espacos.js';
import { confirmarSessao } from '../sessoes.js';

let sessionAtual = null;
let perfilAtual = null;
let membrosEspaco = [];
let dadosSelecionados = null;
let tituloExistente = null;
let editId = null;
let sessaoId = null;

const PERGUNTAS_AUXILIO_NOTA = [
  {
    id: 'reassistiria',
    titulo: 'Você assistiria novamente?',
    ajuda: 'Se esse filme/série estivesse passando na tela em um domingo, você iria parar para assistir?',
    opcoes: [
      ['com_certeza', 'Sim, com certeza', 10],
      ['talvez', 'Talvez, se fosse o momento certo', 7],
      ['nao_faria_questao', 'Não faria questão', 5]
    ]
  },
  {
    id: 'recomendaria',
    titulo: 'Você recomendaria para alguém?',
    ajuda: 'Um amigo fala: “Queria ver um filme hoje, mas não sei :/”. Você recomendaria esse filme ou teria vergonha?',
    opcoes: [
      ['facil', 'Recomendaria fácil', 10],
      ['depende', 'Depende muito da pessoa', 7],
      ['nao', 'Não recomendaria', 5]
    ]
  },
  {
    id: 'impacto',
    titulo: 'Como você ficou depois que acabou?',
    ajuda: 'Mexeu com você a ponto de usar esse filme como argumento em uma conversa?',
    opcoes: [
      ['mexeu', 'Mexeu comigo de verdade', 10],
      ['gostei', 'Gostei, mas passou', 7],
      ['nao_marcou', 'Não me marcou muito', 5],
      ['arrependi', 'Me arrependi um pouco', 3]
    ]
  },
  {
    id: 'promessa',
    titulo: 'O filme entregou o que prometia?',
    ajuda: 'Era o que você esperava do filme/série?',
    opcoes: [
      ['tudo', 'Entregou tudo', 10],
      ['partes', 'Entregou em partes', 7],
      ['devendo', 'Ficou devendo', 5]
    ]
  },
  {
    id: 'memoravel',
    titulo: 'Teve algo memorável?',
    ajuda: 'Você acha que esse filme vai entrar para sua memória?',
    opcoes: [
      ['sim', 'Sim, vou lembrar disso', 10],
      ['momentos', 'Teve bons momentos', 7],
      ['nada', 'Nada muito marcante', 5]
    ]
  }
];

init();

async function init() {
  sessionAtual = await requireSession();
  if (!sessionAtual) {
    concluirCarregamentoInicial();
    return;
  }

  const params = new URLSearchParams(window.location.search);
  editId = params.get('edit');
  sessaoId = params.get('sessao');
  if (!editId) {
    window.location.replace('catalog.html?adicionar=1');
    return;
  }

  try {
    perfilAtual = await getCurrentProfile(sessionAtual);
    const espacoAtivo = await getEspacoAtivo();
    membrosEspaco = await getMembrosDoEspaco(espacoAtivo.id);
    const usuarioId = getUserId(sessionAtual);
    const contextoTitulos = { espaco: espacoAtivo, membros: membrosEspaco, usuarioId };
    const modoAtivo = normalizarModoAtivo(membrosEspaco, usuarioId);
    aplicarTema(perfilAtual?.tema);

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
    document.getElementById('rating-helper-btn').addEventListener('click', abrirAuxilioNota);
    atualizarDisplayNota();

    await iniciarModoEdicao(editId, contextoTitulos);

    document.getElementById('title-form').addEventListener('submit', onSubmit);
  } catch (error) {
    console.error(error);
    showToast('Não foi possível preparar a tela de edição.', 'error');
  } finally {
    concluirCarregamentoInicial();
  }
}

async function iniciarModoEdicao(id, contextoTitulos = null) {
  document.getElementById('page-heading').textContent = 'Editar e avaliar';

  try {
    tituloExistente = await getTituloComAvaliacoes(id, { contexto: contextoTitulos });
    dadosSelecionados = { ...tituloExistente };
    mostrarFormulario();

    // Se a pessoa logada já avaliou, pré-preenche com a avaliação existente
    const usuarioId = getUserId(sessionAtual);
    const minhaAvaliacao = tituloExistente.avaliacoesMembros
      ?.find(item => item.membro.usuario_id === usuarioId)?.avaliacao;
    if (minhaAvaliacao) {
      document.getElementById('f-nota').value = minhaAvaliacao.nota;
      document.getElementById('f-observacao').value = minhaAvaliacao.observacao || '';
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

  renderDadosTituloSomenteLeitura(d);
  document.getElementById('f-data-assistido').value = d.data_assistido || '';

  if (sessaoId && !document.getElementById('f-data-assistido').value) {
    document.getElementById('f-data-assistido').value = new Date().toISOString().slice(0, 10);
  }
}

function renderDadosTituloSomenteLeitura(d) {
  const generos = (d.generos || []).join(', ') || '—';
  const tipo = d.tipo === 'serie' ? 'Série' : 'Filme';
  document.getElementById('title-readonly-data').innerHTML = `
    <div class="readonly-field readonly-field-wide">
      <span>Nome</span>
      <strong>${escapeHtml(d.nome || '—')}</strong>
    </div>
    <div class="readonly-field">
      <span>Nome original</span>
      <strong>${escapeHtml(d.nome_original || '—')}</strong>
    </div>
    <div class="readonly-field">
      <span>Ano</span>
      <strong>${escapeHtml(String(d.ano || '—'))}</strong>
    </div>
    <div class="readonly-field">
      <span>Tipo</span>
      <strong>${tipo}</strong>
    </div>
    <div class="readonly-field">
      <span>Gêneros</span>
      <strong>${escapeHtml(generos)}</strong>
    </div>
    <div class="readonly-field readonly-field-wide">
      <span>Sinopse</span>
      <p>${escapeHtml(d.sinopse || 'Sem sinopse cadastrada.')}</p>
    </div>
  `;
}

function atualizarDisplayNota() {
  const val = parseFloat(document.getElementById('f-nota').value);
  document.getElementById('f-nota-display').textContent = val.toFixed(1).replace('.', ',');
}

function abrirAuxilioNota() {
  const respostas = {};
  let etapa = 0;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay rating-helper-overlay';
  overlay.innerHTML = '<div class="modal-box rating-helper-box" role="dialog" aria-modal="true"></div>';
  const box = overlay.querySelector('.rating-helper-box');

  const fechar = () => overlay.remove();
  const usarNota = nota => {
    document.getElementById('f-nota').value = String(nota);
    atualizarDisplayNota();
    showToast(`Nota sugerida aplicada: ${formatarNota(nota)}`);
    fechar();
  };
  const render = () => {
    const pergunta = PERGUNTAS_AUXILIO_NOTA[etapa];
    const total = PERGUNTAS_AUXILIO_NOTA.length;

    if (!pergunta) {
      const nota = calcularNotaAuxiliada(respostas);
      box.innerHTML = `
        <button class="modal-close" data-close-rating-helper type="button" aria-label="Fechar">×</button>
        <span class="eyebrow">Me ajudar a dar nota</span>
        <h3>Nota sugerida: ${formatarNota(nota)}</h3>
        <p>Use essa nota se ela fizer sentido para você. Se quiser, ainda dá para ajustar manualmente depois.</p>
        <div class="rating-helper-actions">
          <button class="rating-helper-back" data-back-rating-helper type="button">← Voltar</button>
          <button class="btn btn-primary" data-use-rating-helper type="button">Usar essa nota</button>
        </div>
      `;
      box.querySelector('[data-close-rating-helper]').addEventListener('click', fechar);
      box.querySelector('[data-back-rating-helper]').addEventListener('click', () => {
        etapa = total - 1;
        render();
      });
      box.querySelector('[data-use-rating-helper]').addEventListener('click', () => usarNota(nota));
      return;
    }

    box.innerHTML = `
      <button class="modal-close" data-close-rating-helper type="button" aria-label="Fechar">×</button>
      <div class="cine-taste-progress" aria-hidden="true">
        ${PERGUNTAS_AUXILIO_NOTA.map((_, indice) => `<span class="${indice <= etapa ? 'active' : ''}"></span>`).join('')}
      </div>
      <span class="eyebrow">Me ajudar a dar nota</span>
      <h3>${escapeHtml(pergunta.titulo)}</h3>
      <p>${escapeHtml(pergunta.ajuda)}</p>
      <div class="rating-helper-options">
        ${pergunta.opcoes.map(([valor, rotulo]) => `
          <button class="rating-helper-option${respostas[pergunta.id]?.valor === valor ? ' selected' : ''}" data-answer="${valor}" type="button">
            ${escapeHtml(rotulo)}
          </button>
        `).join('')}
      </div>
      <div class="rating-helper-actions">
        <button class="rating-helper-back" data-back-rating-helper type="button"${etapa === 0 ? ' disabled' : ''}>← Voltar</button>
        <span class="rating-helper-step">${etapa + 1} de ${total}</span>
      </div>
    `;
    box.querySelector('[data-close-rating-helper]').addEventListener('click', fechar);
    box.querySelectorAll('[data-answer]').forEach(botao => {
      botao.addEventListener('click', () => {
        const escolha = pergunta.opcoes.find(([valor]) => valor === botao.dataset.answer);
        respostas[pergunta.id] = { valor: escolha[0], nota: escolha[2] };
        etapa += 1;
        render();
      });
    });
    box.querySelector('[data-back-rating-helper]').addEventListener('click', () => {
      etapa = Math.max(0, etapa - 1);
      render();
    });
  };

  overlay.addEventListener('click', event => {
    if (event.target === overlay) fechar();
  });
  document.addEventListener('keydown', function onKeydown(event) {
    if (!document.body.contains(overlay)) {
      document.removeEventListener('keydown', onKeydown);
      return;
    }
    if (event.key === 'Escape') fechar();
  });
  document.body.appendChild(overlay);
  render();
}

function calcularNotaAuxiliada(respostas) {
  const notas = Object.values(respostas).map(item => Number(item.nota)).filter(Number.isFinite);
  if (!notas.length) return parseFloat(document.getElementById('f-nota').value) || 7;
  const media = notas.reduce((soma, nota) => soma + nota, 0) / notas.length;
  return Math.max(0, Math.min(10, Math.round(media * 2) / 2));
}

function formatarNota(nota) {
  return Number(nota).toFixed(1).replace('.', ',');
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
    tipo: dadosSelecionados.tipo || 'filme',
    nome: dadosSelecionados.nome || '',
    nome_original: dadosSelecionados.nome_original || null,
    ano: dadosSelecionados.ano || null,
    generos: dadosSelecionados.generos || [],
    sinopse: dadosSelecionados.sinopse || '',
    capa_url: dadosSelecionados.capa_url || null,
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
      dataAvaliacao: new Date().toISOString().slice(0, 10)
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
