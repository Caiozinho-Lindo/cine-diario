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
  salvarAvaliacao,
  getTitulosCacheSnapshot
} from '../titulos.js';
import { aplicarFiltros, extrairGenerosUnicos, extrairAnosUnicos } from '../filters.js';
import { normalizarModoAtivo, aplicarTema } from '../themes.js?v=20260910.1';
import { getEspacoAtivo, getMembrosDoEspaco } from '../espacos.js';
import { getMeusStreamings } from '../streamings.js';
import {
  carregarDescobertasPessoais,
  criarCardDescobertaCatalogo,
  criarCacheRodadasDescoberta,
  montarSecoesDescoberta
} from '../discovery.js?v=20260919.2';
import { bloquearRecomendacao } from '../recommendationBlocks.js?v=20260909.3';
import { abrirMontarCineDiario } from '../cineTasteModal.js';
import { temCineDiarioMontado } from '../cineTaste.js';
import {
  renderNavbar,
  renderTituloCard,
  safeImageSrc,
  escapeHtml,
  showEmptyState,
  showSpinner,
  showCardSkeletons,
  showToast,
  concluirCarregamentoInicial
} from '../ui.js?v=20260910.1';

let titulos = [];
let modoAtivo = 'geral';
let sessionAtual = null;
let perfilAtual = null;
let dadosSelecionados = null;
let buscaExternaTimer = null;
let buscaExternaVersao = 0;
let buscaExternaResumo = { termo: '', quantidade: 0, carregando: false };
let secaoCatalogo = 'todos';
let membrosEspaco = [];
let usuarioIdAtual = null;
let limiteResultados = 24;
let descobertasCatalogo = null;
let carregamentoDescobertas = null;
let rodadaCarregamentoDescobertas = null;
let rodadaDescobertasCatalogo = 0;
let cacheDescobertasCatalogo = null;
let interfacePreparada = false;
let parametrosIniciaisAplicados = false;
let montagemDescobrirOferecida = false;

const RESULTADOS_POR_PAGINA = 24;

init();

async function init() {
  sessionAtual = await requireSession();
  if (!sessionAtual) {
    concluirCarregamentoInicial();
    return;
  }

  perfilAtual = await getCurrentProfile(sessionAtual);
  const usuarioId = getUserId(sessionAtual);
  usuarioIdAtual = usuarioId;
  const espacoAtivo = await getEspacoAtivo();
  membrosEspaco = await getMembrosDoEspaco(espacoAtivo.id);
  modoAtivo = normalizarModoAtivo(membrosEspaco, usuarioId);
  aplicarTema(perfilAtual?.tema);

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
  const contextoTitulos = { espaco: espacoAtivo, membros: membrosEspaco, usuarioId };
  const cacheTitulos = getTitulosCacheSnapshot({
    incluirDesejos: true,
    espacoId: espacoAtivo.id,
    usuarioId
  });

  if (cacheTitulos) {
    aplicarTitulosNoCatalogo(cacheTitulos);
    concluirCarregamentoInicial();
    void atualizarCatalogoEmSegundoPlano(contextoTitulos);
    return;
  }

  showCardSkeletons(grid, 8);

  try {
    const titulosAtualizados = await getAllTitulosComAvaliacoes({
      incluirDesejos: true,
      contexto: contextoTitulos
    });
    aplicarTitulosNoCatalogo(titulosAtualizados);
  } catch (err) {
    console.error(err);
    showToast('Erro ao carregar títulos.', 'error');
    showEmptyState(grid, 'Não foi possível carregar os títulos.');
    concluirCarregamentoInicial();
    return;
  }

  concluirCarregamentoInicial();
}

function aplicarTitulosNoCatalogo(novosTitulos) {
  titulos = novosTitulos;
  prepararCacheDescobertasCatalogo();
  atualizarTotalCatalogo();
  popularSelects();

  if (!interfacePreparada) {
    ligarFiltros();
    ligarNavegacaoCatalogo();
    ligarAdicaoUnificada();
    document.getElementById('catalog-discovery-more')?.addEventListener('click', renovarDescobertasCatalogo);
    interfacePreparada = true;
  }

  aplicarParametrosIniciais();
  renderResultados();
}

function aplicarParametrosIniciais() {
  if (parametrosIniciaisAplicados) return;
  parametrosIniciaisAplicados = true;
  const params = new URLSearchParams(window.location.search);
  secaoCatalogo = normalizarSecao(params.get('secao'));
  atualizarAbasCatalogo();

  if (params.get('filtro')) {
    document.getElementById('f-avaliacao').value = params.get('filtro');
    abrirFiltrosExtras();
  }

  if (params.get('adicionar') === '1') {
    atualizarUrlCatalogo();
    document.getElementById('f-busca').focus();
  }
}

async function atualizarCatalogoEmSegundoPlano(contextoTitulos) {
  try {
    const titulosAtualizados = await getAllTitulosComAvaliacoes({
      incluirDesejos: true,
      contexto: contextoTitulos
    });
    aplicarTitulosNoCatalogo(titulosAtualizados);
  } catch (error) {
    console.warn('[atualização em segundo plano]', error);
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
      if (id === 'f-busca') agendarBuscaExterna(el.value);
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
      if (secaoCatalogo === 'descobrir') void oferecerMontagemNoDescobrir();
    });
  });
}

function renderResultados() {
  atualizarVisibilidadeSecao();
  if (secaoCatalogo === 'descobrir') {
    void oferecerMontagemNoDescobrir();
    void renderDescobertasCatalogo();
    return;
  }

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
      const correspondencias = titulos.filter(titulo =>
        titulo.nome.toLowerCase().includes(busca.toLowerCase())
      );
      const correspondenciasNaSecao = filtrarPorSecao(correspondencias);
      const secaoAlternativa = secaoCatalogo === 'assistidos'
        ? 'para_assistir'
        : secaoCatalogo === 'para_assistir'
          ? 'assistidos'
          : null;
      const correspondenciasNaOutraSecao = secaoAlternativa
        ? correspondencias.filter(titulo => tituloEstaNaSecao(titulo, secaoAlternativa))
        : [];
      const estaSomenteNaOutraSecao = Boolean(
        secaoAlternativa
        && !correspondenciasNaSecao.length
        && correspondenciasNaOutraSecao.length
      );
      const existeOcultoPorFiltros = correspondenciasNaSecao.length > 0;
      const resumoExternoAtual = buscaExternaResumo.termo.toLowerCase() === busca.toLowerCase()
        ? buscaExternaResumo
        : null;
      const temResultadosExternos = Number(resumoExternoAtual?.quantidade) > 0;
      const estaBuscandoFora = Boolean(resumoExternoAtual?.carregando);
      const rotuloSecaoAlternativa = nomeSecao(secaoAlternativa);
      const nomeEncontrado = correspondenciasNaOutraSecao[0]?.nome || busca;
      grid.innerHTML = `
        <div class="catalog-empty-action ${temResultadosExternos || estaBuscandoFora ? 'catalog-empty-action-compact' : ''}">
          ${temResultadosExternos || estaBuscandoFora ? '' : '<div class="catalog-empty-icon">🎬</div>'}
          <h3>${estaSomenteNaOutraSecao
            ? correspondenciasNaOutraSecao.length === 1
              ? `“${escapeHtml(nomeEncontrado)}” está em “${rotuloSecaoAlternativa}”`
              : `${correspondenciasNaOutraSecao.length} títulos com esse nome estão em “${rotuloSecaoAlternativa}”`
            : existeOcultoPorFiltros
              ? `“${escapeHtml(busca)}” está oculto pelos filtros atuais`
            : temResultadosExternos
              ? `“${escapeHtml(busca)}” não está no seu catálogo`
            : estaBuscandoFora
              ? `Buscando “${escapeHtml(busca)}” fora do seu catálogo`
            : `Nenhum “${escapeHtml(busca)}” no seu catálogo`}</h3>
          <p>${estaSomenteNaOutraSecao
            ? secaoAlternativa === 'para_assistir'
              ? 'Esse título já foi guardado para assistir depois.'
              : 'Esse título já foi marcado como assistido.'
            : existeOcultoPorFiltros
              ? 'Remova os filtros para abrir o item que já foi adicionado.'
            : temResultadosExternos
              ? `${resumoExternoAtual.quantidade} ${resumoExternoAtual.quantidade === 1 ? 'opção apareceu' : 'opções apareceram'} logo abaixo para adicionar.`
            : estaBuscandoFora
              ? 'Estou procurando opções para adicionar.'
            : 'Veja abaixo outros títulos encontrados para adicionar.'}</p>
          ${estaSomenteNaOutraSecao
            ? `<button class="btn btn-secondary" id="open-other-section" type="button">Abrir em ${rotuloSecaoAlternativa}</button>`
            : existeOcultoPorFiltros
              ? '<button class="btn btn-secondary" id="clear-search-filters" type="button">Limpar filtros</button>'
            : temResultadosExternos
              ? '<button class="btn btn-primary" id="view-external-results" type="button">Ver títulos encontrados</button>'
            : ''}
        </div>`;
      document.getElementById('open-other-section')?.addEventListener('click', () => {
        abrirSecaoComBusca(secaoAlternativa);
      });
      document.getElementById('clear-search-filters')?.addEventListener('click', limparFiltrosDaBusca);
      document.getElementById('view-external-results')?.addEventListener('click', rolarParaResultadosExternos);
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
}

function atualizarVisibilidadeSecao() {
  const descobrindo = secaoCatalogo === 'descobrir';
  document.querySelector('.catalog-search').hidden = descobrindo;
  document.querySelector('.catalog-search-help').hidden = descobrindo;
  document.querySelector('.catalog-primary-filters').hidden = descobrindo;
  document.querySelector('.catalog-results-header').hidden = descobrindo;
  document.getElementById('cards-grid').hidden = descobrindo;
  document.querySelector('.catalog-load-more-wrap').hidden = descobrindo;
  document.getElementById('catalog-personal-discovery').hidden = !descobrindo;
  if (descobrindo) {
    document.getElementById('catalog-extra-filters').hidden = true;
    document.getElementById('catalog-discovery').hidden = true;
    document.getElementById('toggle-extra-filters').setAttribute('aria-expanded', 'false');
  }
}

function filtrarPorSecao(lista) {
  if (secaoCatalogo === 'assistidos') return lista.filter(titulo => tituloEstaNaSecao(titulo, 'assistidos'));
  if (secaoCatalogo === 'para_assistir') return lista.filter(titulo => tituloEstaNaSecao(titulo, 'para_assistir'));
  return lista;
}

function tituloEstaNaSecao(titulo, secao) {
  if (secao === 'assistidos') return !titulo.quero_assistir;
  if (secao === 'para_assistir') return Boolean(titulo.quero_assistir);
  return true;
}

function nomeSecao(secao) {
  if (secao === 'assistidos') return 'Assistidos';
  if (secao === 'para_assistir') return 'Para assistir';
  if (secao === 'descobrir') return 'Descobrir';
  return 'Todos';
}

function normalizarSecao(secao) {
  return ['assistidos', 'para_assistir', 'descobrir'].includes(secao) ? secao : 'todos';
}

function atualizarTotalCatalogo() {
  const total = titulos.length;
  document.getElementById('catalog-total-count').textContent =
    `${total} título${total === 1 ? '' : 's'} no espaço`;
}

function atualizarUrlCatalogo() {
  const url = new URL(window.location.href);
  url.search = '';
  if (secaoCatalogo !== 'todos') url.searchParams.set('secao', secaoCatalogo);
  history.replaceState(null, '', `${url.pathname.split('/').pop()}${url.search}`);
}

function abrirSecaoComBusca(secao) {
  secaoCatalogo = normalizarSecao(secao);
  limparFiltrosDaBusca();
}

function limparFiltrosDaBusca() {
  document.getElementById('f-tipo').value = 'todos';
  document.getElementById('f-avaliacao').value = '';
  document.getElementById('f-genero').value = '';
  document.getElementById('f-ano').value = '';
  atualizarAbasCatalogo();
  atualizarUrlCatalogo();
  atualizarEstadoFiltrosExtras();
  renderResultados();
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

async function renderDescobertasCatalogo({ manterAtual = false } = {}) {
  const grid = document.getElementById('catalog-personal-discovery-grid');
  if (!cacheDescobertasCatalogo) prepararCacheDescobertasCatalogo();
  if (descobertasCatalogo) {
    preencherDescobertasCatalogo(grid, descobertasCatalogo);
    return;
  }
  if (carregamentoDescobertas && rodadaCarregamentoDescobertas === rodadaDescobertasCatalogo) {
    return carregamentoDescobertas;
  }

  if (!cacheDescobertasCatalogo.temPronta(rodadaDescobertasCatalogo) && !manterAtual) showSpinner(grid);
  rodadaCarregamentoDescobertas = rodadaDescobertasCatalogo;
  carregamentoDescobertas = (async () => {
    try {
      descobertasCatalogo = await cacheDescobertasCatalogo.obter(rodadaDescobertasCatalogo);
      if (secaoCatalogo === 'descobrir') preencherDescobertasCatalogo(grid, descobertasCatalogo);
      cacheDescobertasCatalogo.preparar(rodadaDescobertasCatalogo + 1);
    } catch (error) {
      console.error('[descobrir]', error);
      grid.innerHTML = '<div class="personal-discovery-empty"><strong>Não foi possível preparar suas sugestões agora.</strong>Tente novamente em alguns instantes.</div>';
    } finally {
      carregamentoDescobertas = null;
      rodadaCarregamentoDescobertas = null;
    }
  })();
  return carregamentoDescobertas;
}

function prepararCacheDescobertasCatalogo() {
  cacheDescobertasCatalogo = criarCacheRodadasDescoberta(async rodada => {
    const streamings = await getMeusStreamings(usuarioIdAtual);
    return carregarDescobertasPessoais({
      historico: titulos.filter(titulo => !titulo.quero_assistir),
      catalogo: titulos,
      usuarioId: usuarioIdAtual,
      streamings,
      limite: 16,
      rodada,
      preferenciasDescoberta: perfilAtual?.preferencias_descoberta
    });
  });
}

async function oferecerMontagemNoDescobrir({ forcar = false } = {}) {
  if (!forcar && (montagemDescobrirOferecida || temCineDiarioMontado(perfilAtual))) return;
  montagemDescobrirOferecida = true;
  const streamings = await getMeusStreamings(usuarioIdAtual).catch(() => []);
  const perfil = await abrirMontarCineDiario({
    perfilAtual,
    usuarioId: usuarioIdAtual,
    streamingsAtuais: streamings,
    onSalvar: async perfilSalvo => {
      perfilAtual = perfilSalvo;
      cacheDescobertasCatalogo?.limpar();
      descobertasCatalogo = null;
      await renderDescobertasCatalogo({ manterAtual: true });
    }
  });
  if (perfil) perfilAtual = perfil;
}

async function renovarDescobertasCatalogo() {
  const botao = document.getElementById('catalog-discovery-more');
  if (botao) {
    botao.disabled = true;
    botao.classList.add('is-loading');
  }
  rodadaDescobertasCatalogo += 1;
  descobertasCatalogo = null;
  try {
    await renderDescobertasCatalogo({ manterAtual: true });
  } finally {
    if (botao) {
      botao.disabled = false;
      botao.classList.remove('is-loading');
    }
  }
}

function preencherDescobertasCatalogo(grid, resultado) {
  grid.innerHTML = '';
  if (!resultado.itens.length) {
    const conteudo = resultado.motivoVazio === 'sem-historico'
      ? ['Monte seu Cine Diário.', 'Responda algumas escolhas rápidas para começarmos suas sugestões.']
      : resultado.motivoVazio === 'sem-streaming'
        ? ['Nada novo apareceu nos seus streamings agora.', 'Ajuste os serviços no perfil ou confira novamente mais tarde.']
        : ['Nenhuma sugestão nova encontrada agora.', 'Seu catálogo já pode conter as melhores correspondências.'];
    grid.innerHTML = `
      <div class="personal-discovery-empty">
        <strong>${conteudo[0]}</strong>
        ${conteudo[1]}
        ${resultado.motivoVazio === 'sem-historico'
          ? '<button class="btn btn-primary btn-sm" id="catalog-open-cine-taste" type="button">Montar meu Cine Diário</button>'
          : ''}
      </div>`;
    document.getElementById('catalog-open-cine-taste')?.addEventListener('click', () => {
      montagemDescobrirOferecida = false;
      void oferecerMontagemNoDescobrir({ forcar: true });
    });
    return;
  }

  montarSecoesDescoberta(resultado.itens).forEach(grupo => {
    const secao = document.createElement('section');
    secao.className = `discovery-reason-group${grupo.tipo === 'aposta' ? ' discovery-reason-group-risk' : ''}`;
    secao.innerHTML = `
      <header class="discovery-reason-heading">
        <div>
          <h3>${escapeHtml(grupo.titulo)}</h3>
          ${grupo.descricao ? `<p>${escapeHtml(grupo.descricao)}</p>` : ''}
        </div>
        <span>${grupo.itens.length} título${grupo.itens.length === 1 ? '' : 's'}</span>
      </header>
      <div class="cards-grid discovery-catalog-grid"></div>`;

    const lista = secao.querySelector('.discovery-catalog-grid');
    grupo.itens.forEach(titulo => {
      lista.appendChild(criarCardDescobertaCatalogo(titulo, {
        onAdicionar: adicionarDescobertaCatalogo,
        onBloquear: ocultarDescobertaCatalogo
      }));
    });
    grid.appendChild(secao);
  });
}

async function ocultarDescobertaCatalogo(titulo) {
  try {
    await bloquearRecomendacao(titulo, usuarioIdAtual);
    cacheDescobertasCatalogo?.limpar();
    showToast(`“${titulo.nome}” não aparecerá mais nas suas recomendações.`);
    descobertasCatalogo = null;
    await renderDescobertasCatalogo();
  } catch (error) {
    console.error(error);
    showToast('Não foi possível ocultar essa recomendação.', 'error');
    throw error;
  }
}

async function adicionarDescobertaCatalogo(titulo, botao) {
  botao.disabled = true;
  botao.textContent = 'Adicionando…';
  try {
    const salvo = await criarTitulo({ ...titulo, quero_assistir: true }, usuarioIdAtual);
    if (salvo.jaExistia) {
      botao.textContent = 'Já está no catálogo';
      return;
    }

    showToast(`“${titulo.nome}” foi adicionado a “Para assistir”.`);
    titulos = await getAllTitulosComAvaliacoes({ incluirDesejos: true });
    atualizarTotalCatalogo();
    popularSelects();
    cacheDescobertasCatalogo?.limpar();
    descobertasCatalogo = null;
    await renderDescobertasCatalogo();
  } catch (error) {
    console.error(error);
    botao.disabled = false;
    botao.textContent = '+ Para assistir';
    showToast('Não foi possível adicionar esse título.', 'error');
  }
}

/* ==========================================================================
   Adição dentro do catálogo
   ========================================================================== */

function ligarAdicaoUnificada() {
  document.getElementById('close-title-flow').addEventListener('click', fecharFluxoTitulo);
  document.getElementById('catalog-mark-watched').addEventListener('click', mostrarFormularioAvaliacao);
  document.getElementById('catalog-add-watchlist').addEventListener('click', adicionarSelecionadoALista);
  document.getElementById('catalog-add-form').addEventListener('submit', salvarTituloDoCatalogo);

  const nota = document.getElementById('catalog-rating');
  nota.addEventListener('input', atualizarDisplayNota);
  atualizarDisplayNota();
  atualizarTituloAvaliacao();
}

function agendarBuscaExterna(query) {
  clearTimeout(buscaExternaTimer);
  buscaExternaVersao += 1;
  const termo = query.trim();

  if (termo.length < 2) {
    buscaExternaResumo = { termo: '', quantidade: 0, carregando: false };
    limparDescoberta();
    return;
  }

  buscaExternaResumo = { termo, quantidade: 0, carregando: true };
  const secao = document.getElementById('catalog-discovery');
  const container = document.getElementById('catalog-discovery-results');
  secao.hidden = false;
  document.getElementById('catalog-discovery-count').textContent = 'Buscando…';
  showSpinner(container);

  const versao = buscaExternaVersao;
  buscaExternaTimer = setTimeout(() => buscarTitulosExternos(termo, versao), 400);
}

function limparDescoberta() {
  document.getElementById('catalog-discovery').hidden = true;
  document.getElementById('catalog-discovery-results').innerHTML = '';
  document.getElementById('catalog-discovery-count').textContent = '';
}

async function buscarTitulosExternos(termo, versao) {
  const container = document.getElementById('catalog-discovery-results');
  try {
    const resultados = await searchMulti(termo);
    if (versao !== buscaExternaVersao) return;

    const novos = resultados
      .filter(resultado => !encontrarTituloExistente(resultado))
      .slice(0, 12);

    document.getElementById('catalog-discovery-count').textContent =
      `${novos.length} novo${novos.length === 1 ? '' : 's'}`;
    buscaExternaResumo = { termo, quantidade: novos.length, carregando: false };
    renderResultados();

    if (!novos.length) {
      showEmptyState(container, 'Todos os resultados encontrados já estão no seu catálogo.');
      return;
    }

    container.innerHTML = '';
    novos.forEach(resultado => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'search-result-card';
      card.innerHTML = `
        <img src="${safeImageSrc(resultado.capa_url)}" alt="Capa de ${escapeHtml(resultado.nome)}" loading="lazy" />
        <span class="src-body">
          <span class="src-title">${escapeHtml(resultado.nome)}</span>
          <span class="src-meta">${resultado.ano || '—'} · ${resultado.tipo === 'filme' ? 'Filme' : 'Série'}</span>
          <span class="src-status">+ Adicionar</span>
        </span>`;
      card.addEventListener('click', () => selecionarTituloNovo(resultado));
      container.appendChild(card);
    });
  } catch (error) {
    if (versao !== buscaExternaVersao) return;
    console.error(error);
    buscaExternaResumo = { termo, quantidade: 0, carregando: false };
    renderResultados();
    showEmptyState(container, 'Não foi possível buscar agora. Tente novamente.');
    document.getElementById('catalog-discovery-count').textContent = '';
  }
}

function rolarParaResultadosExternos() {
  document.getElementById('catalog-discovery')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function encontrarTituloExistente(resultado) {
  return titulos.find(titulo =>
    String(titulo.tmdb_id) === String(resultado.tmdb_id)
    && titulo.tipo === resultado.tipo
  );
}

async function selecionarTituloNovo(resultado) {
  const container = document.getElementById('catalog-discovery-results');
  showSpinner(container);

  try {
    dadosSelecionados = await getDetails(resultado.tmdb_id, resultado.tipo);
    mostrarEscolhaTitulo();
  } catch (error) {
    console.error(error);
    showToast('Não foi possível carregar os detalhes desse título.', 'error');
    agendarBuscaExterna(document.getElementById('f-busca').value);
  }
}

function mostrarEscolhaTitulo() {
  document.getElementById('catalog-view').hidden = true;
  document.getElementById('catalog-title-flow').hidden = false;
  document.getElementById('catalog-add-choice').hidden = false;
  document.getElementById('catalog-add-form').hidden = true;
  document.getElementById('catalog-add-title').textContent = 'Como deseja adicionar?';
  document.getElementById('catalog-add-description').textContent =
    'Escolha se você já assistiu ou se quer guardar para depois.';
  renderPreviewSelecionado('catalog-choice-preview');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function mostrarFormularioAvaliacao() {
  if (!dadosSelecionados) return;

  document.getElementById('catalog-add-choice').hidden = true;
  document.getElementById('catalog-add-form').hidden = false;
  document.getElementById('catalog-add-title').textContent = `Avaliar ${dadosSelecionados.nome}`;
  document.getElementById('catalog-add-description').textContent =
    'A nota é obrigatória para todo título marcado como assistido.';
  renderPreviewSelecionado('catalog-selected-preview');
  document.getElementById('catalog-review-date').value = new Date().toISOString().slice(0, 10);
  document.getElementById('catalog-rating').value = '7';
  document.getElementById('catalog-observation').value = '';
  atualizarDisplayNota();
}

function renderPreviewSelecionado(containerId) {
  const titulo = dadosSelecionados;
  document.getElementById(containerId).innerHTML = `
    <img src="${safeImageSrc(titulo.capa_url)}" alt="Capa de ${escapeHtml(titulo.nome)}" />
    <div>
      <strong>${escapeHtml(titulo.nome)}</strong>
      <div class="selected-title-meta">${titulo.ano || '—'} · ${titulo.tipo === 'filme' ? 'Filme' : 'Série'}</div>
    </div>`;
}

function fecharFluxoTitulo() {
  dadosSelecionados = null;
  document.getElementById('catalog-add-form').reset();
  document.getElementById('catalog-add-form').hidden = true;
  document.getElementById('catalog-add-choice').hidden = false;
  document.getElementById('catalog-title-flow').hidden = true;
  document.getElementById('catalog-view').hidden = false;
  atualizarUrlCatalogo();
  atualizarDisplayNota();
  const busca = document.getElementById('f-busca');
  busca.focus();
  agendarBuscaExterna(busca.value);
}

async function adicionarSelecionadoALista() {
  if (!dadosSelecionados) return;

  const botao = document.getElementById('catalog-add-watchlist');
  botao.disabled = true;
  const textoOriginal = botao.innerHTML;
  botao.innerHTML = '<strong>Adicionando…</strong><span>Aguarde um instante.</span>';

  try {
    const usuarioId = getUserId(sessionAtual);
    const nomeAdicionado = dadosSelecionados.nome;
    const titulo = await criarTitulo({ ...dadosSelecionados, quero_assistir: true }, usuarioId);

    if (titulo.jaExistia) {
      showToast('Esse título já está no catálogo.', 'error');
      await exibirTituloAdicionado(nomeAdicionado, titulo.quero_assistir ? 'para_assistir' : 'assistidos');
      return;
    }

    await exibirTituloAdicionado(nomeAdicionado, 'para_assistir');
    showToast(`“${nomeAdicionado}” foi adicionado à lista “Para assistir”.`);
  } catch (error) {
    console.error(error);
    showToast('Não foi possível adicionar esse título à lista.', 'error');
  } finally {
    botao.disabled = false;
    botao.innerHTML = textoOriginal;
  }
}

async function exibirTituloAdicionado(nome, secao) {
  titulos = await getAllTitulosComAvaliacoes({ incluirDesejos: true });
  atualizarTotalCatalogo();
  popularSelects();
  fecharFluxoTitulo();

  secaoCatalogo = secao;
  document.getElementById('f-tipo').value = 'todos';
  document.getElementById('f-avaliacao').value = '';
  document.getElementById('f-genero').value = '';
  document.getElementById('f-ano').value = '';
  document.getElementById('f-busca').value = nome;
  limiteResultados = RESULTADOS_POR_PAGINA;
  atualizarAbasCatalogo();
  atualizarUrlCatalogo();
  atualizarEstadoFiltrosExtras();
  renderResultados();
  agendarBuscaExterna(nome);
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

    await exibirTituloAdicionado(nomeAdicionado, 'assistidos');
    showToast(`“${nomeAdicionado}” foi adicionado e avaliado.`);
  } catch (error) {
    console.error(error);
    showToast('Não foi possível adicionar o título.', 'error');
  } finally {
    botao.disabled = false;
    botao.textContent = 'Adicionar e salvar avaliação';
  }
}
