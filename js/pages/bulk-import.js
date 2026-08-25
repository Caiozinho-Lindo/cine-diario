// js/pages/bulk-import.js
// Ferramenta de importação em massa: cola uma lista de títulos, compara com o
// que já existe no banco, e para cada título novo deixa escolher manualmente
// qual resultado do TMDB é o certo (evita bater errado quando o nome é ambíguo).

import { requireSession, getProfileFromSession, getUserId } from '../auth.js';
import { searchMulti, getDetails } from '../tmdb.js';
import { criarTitulo, getAllTitulosComAvaliacoes } from '../titulos.js';
import { normalizarModoAtivo, aplicarTema } from '../themes.js';
import { renderNavbar, safeImageSrc, escapeHtml, showToast, showSpinner } from '../ui.js';

let sessionAtual = null;
let existentesNormalizados = new Set();

// Cada item: { textoOriginal, resultados: [...], escolhaIndex: null|number, pulado: bool, resolvido: bool }
let itens = [];

init();

async function init() {
  sessionAtual = await requireSession();
  if (!sessionAtual) return;

  const perfilLogado = getProfileFromSession(sessionAtual);
  const modoAtivo = normalizarModoAtivo(perfilLogado);
  aplicarTema(modoAtivo);
  renderNavbar(document.getElementById('navbar'), {
    activePage: 'bulk-import',
    modoAtivo,
    perfilLogado,
    onModoChange: novoModo => aplicarTema(novoModo)
  });

  document.getElementById('analisar-btn').addEventListener('click', analisarLista);
  document.getElementById('cancelar-btn').addEventListener('click', () => location.reload());
  document.getElementById('importar-btn').addEventListener('click', importarSelecionados);
}

/* ==========================================================================
   Utilitários de texto
   ========================================================================== */

function normalizar(str) {
  return (str || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function limparLinha(linha) {
  let t = linha.trim();
  if (!t || /^[-–‐\s]*$/.test(t)) return null;
  // remove nota no final: " - 6,5/10", "4/10", "7,75/10"
  t = t.replace(/\s*[-–‐]?\s*\d{1,2}([.,]\d{1,2})?\s*\/\s*10\s*$/i, '');
  t = t.replace(/[.\s]+$/, '').trim();
  return t || null;
}

/* ==========================================================================
   Passo 1 → 2: analisar lista colada
   ========================================================================== */

async function analisarLista() {
  const raw = document.getElementById('raw-input').value;
  const linhasBrutas = raw.split('\n').map(limparLinha).filter(Boolean);

  // dedupe mantendo a primeira ocorrência
  const vistos = new Set();
  const linhasUnicas = [];
  linhasBrutas.forEach(t => {
    const chave = normalizar(t);
    if (!vistos.has(chave)) {
      vistos.add(chave);
      linhasUnicas.push(t);
    }
  });

  if (!linhasUnicas.length) {
    showToast('Nenhum título válido encontrado no texto colado.', 'error');
    return;
  }

  document.getElementById('analisar-btn').disabled = true;
  document.getElementById('analisar-btn').textContent = 'Carregando catálogo atual...';

  let existentes = [];
  try {
    existentes = await getAllTitulosComAvaliacoes({ incluirDesejos: true });
  } catch (err) {
    console.error(err);
    showToast('Erro ao carregar catálogo atual do Supabase.', 'error');
    document.getElementById('analisar-btn').disabled = false;
    document.getElementById('analisar-btn').textContent = 'Analisar lista';
    return;
  }

  existentesNormalizados = new Set();
  existentes.forEach(t => {
    existentesNormalizados.add(normalizar(t.nome));
    if (t.nome_original) existentesNormalizados.add(normalizar(t.nome_original));
  });

  const jaExistem = [];
  const novos = [];
  linhasUnicas.forEach(t => {
    if (existentesNormalizados.has(normalizar(t))) jaExistem.push(t);
    else novos.push(t);
  });

  document.getElementById('step-1').hidden = true;
  document.getElementById('step-2').hidden = false;

  document.getElementById('resumo-analise').textContent =
    `${linhasUnicas.length} títulos únicos na lista colada · ${jaExistem.length} já existem no site · ${novos.length} são novos e serão buscados no TMDB.`;

  document.getElementById('ja-existentes').innerHTML = jaExistem.length
    ? `<details><summary style="cursor:pointer; color: var(--text-secondary); font-size: 0.82rem;">Ver ${jaExistem.length} títulos já existentes (pulados)</summary>
        <ul style="color: var(--text-secondary); font-size: 0.82rem; margin-top: 8px;">
          ${jaExistem.map(t => `<li>${escapeHtml(t)}</li>`).join('')}
        </ul>
      </details>`
    : '';

  itens = novos.map(t => ({ textoOriginal: t, resultados: [], escolhaIndex: null, pulado: false, resolvido: false }));

  await buscarTodosNoTMDB();
}

async function buscarTodosNoTMDB() {
  const container = document.getElementById('escolhas-container');
  container.innerHTML = '';

  for (let i = 0; i < itens.length; i++) {
    atualizarProgresso(i);
    const item = itens[i];
    try {
      item.resultados = (await searchMulti(item.textoOriginal)).slice(0, 4);
    } catch (err) {
      console.error(err);
      item.resultados = [];
    }
    renderBlocoEscolha(item, i);
    await sleep(200);
  }

  atualizarProgresso(itens.length);
  document.getElementById('importar-btn').disabled = false;
}

function atualizarProgresso(feitos) {
  document.getElementById('progresso-escolha').textContent =
    itens.length ? `Buscando no TMDB: ${feitos}/${itens.length}` : '';
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/* ==========================================================================
   Renderização dos blocos de escolha (um por título)
   ========================================================================== */

function renderBlocoEscolha(item, index) {
  const container = document.getElementById('escolhas-container');
  const bloco = document.createElement('div');
  bloco.className = 'bulk-escolha-bloco';
  bloco.dataset.index = index;

  const cardsHtml = item.resultados.length
    ? item.resultados.map((r, ri) => `
        <div class="search-result-card bulk-choice-card" data-ri="${ri}">
          <img src="${safeImageSrc(r.capa_url)}" alt="Capa de ${escapeHtml(r.nome)}" loading="lazy" />
          <div class="src-body">
            <div class="src-title">${escapeHtml(r.nome)}</div>
            <div class="src-meta">${r.ano || '—'} · ${r.tipo === 'filme' ? 'Filme' : 'Série'}</div>
          </div>
        </div>
      `).join('')
    : '<p class="empty-state" style="font-size:0.82rem;">Nenhum resultado encontrado no TMDB.</p>';

  bloco.innerHTML = `
    <div class="bulk-escolha-titulo">"${escapeHtml(item.textoOriginal)}" — a qual desses se refere?</div>
    <div class="bulk-choice-grid">${cardsHtml}</div>
    <button type="button" class="btn btn-secondary btn-sm bulk-skip-btn">Pular este título</button>
  `;

  bloco.querySelectorAll('.bulk-choice-card').forEach(card => {
    card.addEventListener('click', () => {
      const ri = Number(card.dataset.ri);
      item.escolhaIndex = ri;
      item.pulado = false;
      item.resolvido = true;
      bloco.querySelectorAll('.bulk-choice-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      bloco.classList.add('bulk-resolvido');
    });
  });

  bloco.querySelector('.bulk-skip-btn').addEventListener('click', () => {
    item.pulado = true;
    item.escolhaIndex = null;
    item.resolvido = true;
    bloco.querySelectorAll('.bulk-choice-card').forEach(c => c.classList.remove('selected'));
    bloco.classList.add('bulk-resolvido', 'bulk-pulado');
  });

  container.appendChild(bloco);
}

/* ==========================================================================
   Passo 3: adicionar os escolhidos
   ========================================================================== */

async function importarSelecionados() {
  const selecionados = itens.filter(it => !it.pulado && it.escolhaIndex !== null);

  if (!selecionados.length) {
    showToast('Nenhum título selecionado ainda.', 'error');
    return;
  }

  document.getElementById('step-2').hidden = true;
  document.getElementById('step-3').hidden = false;
  const log = document.getElementById('log-output');
  const usuarioId = getUserId(sessionAtual);

  let sucesso = 0, erro = 0, jaCadastrados = 0;

  for (const item of selecionados) {
    const escolhido = item.resultados[item.escolhaIndex];
    log.textContent += `Adicionando "${escolhido.nome}"...\n`;
    log.scrollTop = log.scrollHeight;
    try {
      const completos = await getDetails(escolhido.tmdb_id, escolhido.tipo);
      const titulo = await criarTitulo({ ...completos, quero_assistir: true }, usuarioId);
      if (titulo.jaExistia) {
        log.textContent += '  ↪️ Já estava cadastrado; ignorado.\n';
        jaCadastrados++;
      } else {
        log.textContent += `  ✅ Adicionado (${completos.ano || '—'})\n`;
        sucesso++;
      }
    } catch (err) {
      console.error(err);
      log.textContent += `  ⚠️ Erro: ${err.message}\n`;
      erro++;
    }
    log.scrollTop = log.scrollHeight;
    await sleep(250);
  }

  const pulados = itens.filter(it => it.pulado || it.escolhaIndex === null).length;
  log.textContent += `\nConcluído! ${sucesso} adicionados, ${jaCadastrados} já cadastrados, ${erro} com erro, ${pulados} pulados/sem resultado.\n`;
  log.scrollTop = log.scrollHeight;
  showToast(`${sucesso} títulos adicionados à lista "Para assistir"!`);
}
