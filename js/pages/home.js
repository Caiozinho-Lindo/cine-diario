// js/pages/home.js
import { requireSession, getCurrentProfile, getUserId } from '../auth.js';
import {
  getAllTitulosComAvaliacoes,
  criarTitulo,
  getTitulosCacheSnapshot
} from '../titulos.js';
import { calcularEstatisticas, calcularDestaques, formatarNota } from '../statistics.js?v=20260831.1';
import { normalizarModoAtivo, aplicarTema, nomeDoModo } from '../themes.js?v=20260910.1';
import {
  renderNavbar,
  renderTituloCard,
  safeImageSrc,
  escapeHtml,
  showToast,
  concluirCarregamentoInicial
} from '../ui.js?v=20260910.1';
import { getEspacoAtivo, getMembrosDoEspaco } from '../espacos.js';
import { getSessaoPendente, cancelarSessao } from '../sessoes.js?v=20260906.2';
import { initRecommend } from './recommend.js?v=20260910.1';
import { getMeusStreamings } from '../streamings.js';
import {
  carregarDescobertasPessoais,
  criarCardDescobertaCatalogo,
  criarCacheRodadasDescoberta,
} from '../discovery.js?v=20260910.1';
import { bloquearRecomendacao } from '../recommendationBlocks.js?v=20260909.3';
import { abrirMontarCineDiario } from '../cineTasteModal.js';
import { deveAbrirMontagemInicial } from '../cineTaste.js';

let membrosEspaco = [];
let usuarioIdAtual = null;
let catalogoCompleto = [];
let modoAtual = 'geral';
let limparCarrosselCatalogo = () => {};
let rodadaDescobertas = 0;
let cacheDescobertas = null;
let perfilAtual = null;
let montagemInicialAberta = false;

init();

async function init() {
  const session = await requireSession();
  if (!session) {
    concluirCarregamentoInicial();
    return;
  }

  perfilAtual = await getCurrentProfile(session);
  const espacoAtivo = await getEspacoAtivo();
  membrosEspaco = await getMembrosDoEspaco(espacoAtivo.id);
  usuarioIdAtual = getUserId(session);
  const modoAtivo = normalizarModoAtivo(membrosEspaco, usuarioIdAtual);
  aplicarTema(perfilAtual?.tema);
  document.getElementById('hero-title').textContent = membrosEspaco.length === 1
    ? 'Seu histórico de filmes e séries'
    : `O histórico de ${espacoAtivo.nome}`;

  renderNavbar(document.getElementById('navbar'), {
    activePage: 'home',
    modoAtivo,
    perfilAtual,
    membros: membrosEspaco,
    usuarioId: usuarioIdAtual,
    onModoChange: novoModo => {
      renderTudo(novoModo);
    }
  });

  document.getElementById('home-discovery-more')?.addEventListener('click', renovarDescobertas);

  renderSessaoPendente().catch(error => console.error('[sessão pendente]', error));

  const contextoTitulos = { espaco: espacoAtivo, membros: membrosEspaco, usuarioId: usuarioIdAtual };
  const cacheTitulos = getTitulosCacheSnapshot({
    incluirDesejos: true,
    espacoId: espacoAtivo.id,
    usuarioId: usuarioIdAtual
  });

  try {
    if (cacheTitulos) {
      aplicarCatalogo(cacheTitulos, modoAtivo);
      await initRecommend({
        embedded: true,
        session,
        perfilAtual,
        espacoAtivo,
        membros: membrosEspaco,
        usuarioId: usuarioIdAtual,
        historicoInicial: window._titulos
      });
      concluirCarregamentoInicial();
      void talvezAbrirMontagemInicial();
      void renderDescobertasPessoais(window._titulos);
      void atualizarCatalogoEmSegundoPlano(contextoTitulos, modoAtivo);
      return;
    }

    const titulosAtualizados = await getAllTitulosComAvaliacoes({
      incluirDesejos: true,
      contexto: contextoTitulos
    });
    aplicarCatalogo(titulosAtualizados, modoAtivo);
    await initRecommend({
      embedded: true,
      session,
      perfilAtual,
      espacoAtivo,
      membros: membrosEspaco,
      usuarioId: usuarioIdAtual,
      historicoInicial: window._titulos
    });
    concluirCarregamentoInicial();
    void talvezAbrirMontagemInicial();
    void renderDescobertasPessoais(window._titulos);
  } catch (err) {
    console.error(err);
    showToast('Erro ao carregar dados. Verifique sua conexão e configuração do Supabase.', 'error');
    concluirCarregamentoInicial();
  }
}

function aplicarCatalogo(titulos, modo) {
  catalogoCompleto = titulos;
  window._titulos = catalogoCompleto.filter(titulo => !titulo.quero_assistir);
  prepararCacheDescobertas();
  renderTudo(modo);
}

async function atualizarCatalogoEmSegundoPlano(contextoTitulos, modo) {
  try {
    const titulosAtualizados = await getAllTitulosComAvaliacoes({
      incluirDesejos: true,
      contexto: contextoTitulos
    });
    aplicarCatalogo(titulosAtualizados, modo);
    await renderDescobertasPessoais(window._titulos, { manterAtual: true });
  } catch (error) {
    console.warn('[atualização em segundo plano]', error);
  }
}

async function talvezAbrirMontagemInicial() {
  if (montagemInicialAberta) return;
  if (!deveAbrirMontagemInicial(perfilAtual, window._titulos || [], usuarioIdAtual)) return;
  await abrirMontagemCineDiario();
}

async function abrirMontagemCineDiario() {
  if (montagemInicialAberta) return;
  montagemInicialAberta = true;
  const streamings = await getMeusStreamings(usuarioIdAtual).catch(() => []);
  const perfil = await abrirMontarCineDiario({
    perfilAtual,
    usuarioId: usuarioIdAtual,
    streamingsAtuais: streamings,
    onSalvar: async perfilSalvo => {
      perfilAtual = perfilSalvo;
      prepararCacheDescobertas();
      await renderDescobertasPessoais(window._titulos || [], { manterAtual: true });
    }
  });
  if (perfil) perfilAtual = perfil;
  montagemInicialAberta = false;
}

async function renderSessaoPendente() {
  const sessao = await getSessaoPendente();
  if (!sessao) return;
  const titulo = sessao.titulo;
  const minhaParticipacao = (sessao.participantes || [])
    .find(item => item.usuario_id === usuarioIdAtual);
  const precisoConfirmar = Boolean(minhaParticipacao) && !minhaParticipacao.confirmado_em;
  const membroAtual = membrosEspaco.find(membro => membro.usuario_id === usuarioIdAtual);
  const possoCancelar = !sessao.criado_por
    || sessao.criado_por === usuarioIdAtual
    || membroAtual?.papel === 'administrador';
  const banner = document.getElementById('pending-session-banner');
  banner.hidden = false;
  banner.innerHTML = `
    ${titulo?.capa_url ? `<img src="${safeImageSrc(titulo.capa_url)}" alt="" />` : '<span class="pending-session-icon">🎬</span>'}
    <div class="pending-session-copy">
      <span class="eyebrow">Sessão pendente</span>
      <strong>${escapeHtml(titulo?.nome || 'Título escolhido')}</strong>
      <small>${precisoConfirmar
        ? 'Confirme depois de assistir e registre sua nota.'
        : 'Aguardando a confirmação dos participantes.'}</small>
    </div>
    ${precisoConfirmar
      ? `<a class="btn btn-primary btn-sm" href="edit.html?edit=${encodeURIComponent(sessao.titulo_id)}&sessao=${encodeURIComponent(sessao.id)}">Confirmar e avaliar</a>`
      : `<a class="btn btn-secondary btn-sm" href="details.html?id=${encodeURIComponent(sessao.titulo_id)}">Ver título</a>`}
    ${possoCancelar ? '<button class="pending-session-cancel" data-cancel-pending type="button">Cancelar escolha</button>' : ''}`;

  banner.querySelector('[data-cancel-pending]')?.addEventListener('click', async event => {
    const botao = event.currentTarget;
    botao.disabled = true;
    try {
      await cancelarSessao(sessao.id);
      showToast('Escolha cancelada. O título continua em “Para assistir”.');
      window.location.reload();
    } catch (error) {
      console.error(error);
      showToast('Não foi possível cancelar a escolha.', 'error');
      botao.disabled = false;
    }
  });
}

function renderTudo(modo) {
  const titulos = window._titulos || [];
  modoAtual = modo;
  renderStats(titulos, modo);
  renderHighlights(titulos);
  renderCatalogoRecente(catalogoCompleto, modo);
}

function renderCatalogoRecente(titulos, modo) {
  const grid = document.getElementById('home-catalog-grid');
  if (!grid) return;
  const recentes = [...titulos]
    .sort((a, b) => new Date(b.criado_em || 0) - new Date(a.criado_em || 0))
    .slice(0, 12);

  if (!recentes.length) {
    limparCarrosselCatalogo();
    grid.innerHTML = '<div class="home-catalog-empty">O catálogo ainda está vazio.</div>';
    return;
  }

  grid.innerHTML = '';
  recentes.forEach(titulo => {
    const card = renderTituloCard(titulo, modo);
    card.tabIndex = 0;
    card.setAttribute('role', 'link');
    const abrir = () => { window.location.href = `details.html?id=${encodeURIComponent(titulo.id)}`; };
    card.addEventListener('click', abrir);
    card.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        abrir();
      }
    });
    grid.appendChild(card);
  });
  configurarCarrosselCatalogo();
}

async function renderDescobertasPessoais(historico, { manterAtual = false } = {}) {
  const grid = document.getElementById('home-discovery-grid');
  if (!grid) return;
  if (!cacheDescobertas) prepararCacheDescobertas();

  if (!cacheDescobertas?.temPronta(rodadaDescobertas) && !manterAtual) {
    renderCarregamentoDescobertas(grid);
  }

  try {
    const resultado = await cacheDescobertas.obter(rodadaDescobertas);

    grid.innerHTML = '';
    if (!resultado.itens.length) {
      renderVazioDescobertas(grid, resultado.motivoVazio);
      return;
    }

    const lista = document.createElement('div');
    lista.className = 'cards-grid discovery-catalog-grid home-discovery-section-grid';
    resultado.itens.slice(0, 4).forEach(titulo => {
      lista.appendChild(criarCardDescobertaCatalogo(titulo, {
        onAdicionar: adicionarDescobertaALista,
        onBloquear: ocultarDescoberta
      }));
    });
    grid.appendChild(lista);
    cacheDescobertas.preparar(rodadaDescobertas + 1);
  } catch (error) {
    console.error('[descobrir]', error);
    grid.innerHTML = '<div class="personal-discovery-empty"><strong>Não foi possível preparar suas sugestões agora.</strong>Tente novamente em alguns instantes.</div>';
  }
}

async function renovarDescobertas() {
  const botao = document.getElementById('home-discovery-more');
  if (botao) {
    botao.disabled = true;
    botao.classList.add('is-loading');
  }
  rodadaDescobertas += 1;
  try {
    await renderDescobertasPessoais(window._titulos || [], { manterAtual: true });
  } finally {
    if (botao) {
      botao.disabled = false;
      botao.classList.remove('is-loading');
    }
  }
}

function prepararCacheDescobertas() {
  cacheDescobertas = criarCacheRodadasDescoberta(async rodada => {
    const streamings = await getMeusStreamings(usuarioIdAtual);
    return carregarDescobertasPessoais({
      historico: window._titulos || [],
      catalogo: catalogoCompleto,
      usuarioId: usuarioIdAtual,
      streamings,
      limite: 4,
      rodada,
      preferenciasDescoberta: perfilAtual?.preferencias_descoberta
    });
  });
}

function renderCarregamentoDescobertas(grid) {
  grid.innerHTML = `
    <div class="personal-discovery-loading" role="status" aria-live="polite">
      <div class="discovery-loading-heading">
        <span class="eyebrow">Preparando</span>
        <strong>Buscando sugestões com o seu gosto...</strong>
        <small>Relacionando filmes bem avaliados com novas descobertas.</small>
      </div>
      <div class="cards-grid discovery-catalog-grid home-discovery-section-grid" aria-hidden="true">
        <article class="discovery-title-card discovery-card-skeleton"><span></span><strong></strong><small></small><button tabindex="-1"></button></article>
        <article class="discovery-title-card discovery-card-skeleton"><span></span><strong></strong><small></small><button tabindex="-1"></button></article>
        <article class="discovery-title-card discovery-card-skeleton"><span></span><strong></strong><small></small><button tabindex="-1"></button></article>
        <article class="discovery-title-card discovery-card-skeleton"><span></span><strong></strong><small></small><button tabindex="-1"></button></article>
      </div>
    </div>`;
}

async function ocultarDescoberta(titulo) {
  try {
    await bloquearRecomendacao(titulo, usuarioIdAtual);
    cacheDescobertas?.limpar();
    showToast(`“${titulo.nome}” não aparecerá mais nas suas recomendações.`);
    await renderDescobertasPessoais(window._titulos || []);
  } catch (error) {
    console.error(error);
    showToast('Não foi possível ocultar essa recomendação.', 'error');
    throw error;
  }
}

async function adicionarDescobertaALista(titulo, botao) {
  botao.disabled = true;
  botao.textContent = 'Adicionando…';
  try {
    const salvo = await criarTitulo({ ...titulo, quero_assistir: true }, usuarioIdAtual);
    botao.textContent = salvo.jaExistia ? 'Já está no catálogo' : '✓ Na sua lista';
    if (!salvo.jaExistia) {
      catalogoCompleto.unshift({ ...titulo, ...salvo, quero_assistir: true });
      cacheDescobertas?.limpar();
      renderCatalogoRecente(catalogoCompleto, modoAtual);
      showToast(`“${titulo.nome}” foi adicionado a “Para assistir”.`);
    }
  } catch (error) {
    console.error(error);
    botao.disabled = false;
    botao.textContent = '+ Para assistir';
    showToast('Não foi possível adicionar esse título.', 'error');
  }
}

function renderVazioDescobertas(container, motivo) {
  const conteudo = motivo === 'sem-historico'
    ? ['Monte seu Cine Diário.', 'Responda algumas escolhas rápidas para começarmos suas sugestões.']
    : motivo === 'sem-streaming'
      ? ['Nada novo apareceu nos seus streamings agora.', 'Você pode ajustar os serviços no perfil ou conferir novamente mais tarde.']
      : ['Nenhuma sugestão nova encontrada agora.', 'Seu catálogo já pode conter as melhores correspondências.'];
  container.innerHTML = `
    <div class="personal-discovery-empty">
      <strong>${conteudo[0]}</strong>
      ${conteudo[1]}
      ${motivo === 'sem-historico'
        ? '<button class="btn btn-primary btn-sm" id="home-open-cine-taste" type="button">Montar meu Cine Diário</button>'
        : ''}
    </div>`;
  document.getElementById('home-open-cine-taste')?.addEventListener('click', () => {
    montagemInicialAberta = false;
    void abrirMontagemCineDiario();
  });
}

function configurarCarrosselCatalogo() {
  limparCarrosselCatalogo();
  const carrossel = document.querySelector('[data-home-catalog-carousel]');
  const viewport = carrossel?.querySelector('[data-carousel-viewport]');
  const anterior = carrossel?.querySelector('[data-carousel-prev]');
  const proximo = carrossel?.querySelector('[data-carousel-next]');
  const cards = [...(viewport?.querySelectorAll('.title-card') || [])];
  if (!viewport || !anterior || !proximo || !cards.length) return;

  const movimentoReduzido = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let timer = null;
  const passo = () => cards[0]?.getBoundingClientRect().width + 16 || viewport.clientWidth;
  const mover = direcao => {
    const final = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
    const reiniciar = direcao > 0 && viewport.scrollLeft >= final - 4;
    viewport.scrollTo({ left: reiniciar ? 0 : Math.max(0, viewport.scrollLeft + direcao * passo()), behavior: 'smooth' });
  };
  const pausar = () => {
    window.clearInterval(timer);
    timer = null;
  };
  const iniciar = () => {
    pausar();
    if (!movimentoReduzido && viewport.scrollWidth > viewport.clientWidth + 4 && !document.hidden) {
      timer = window.setInterval(() => mover(1), 5000);
    }
  };
  const onAnterior = () => mover(-1);
  const onProximo = () => mover(1);
  const onVisibilidade = () => document.hidden ? pausar() : iniciar();
  const onFimFoco = event => {
    if (!carrossel.contains(event.relatedTarget)) iniciar();
  };

  anterior.disabled = viewport.scrollWidth <= viewport.clientWidth + 4;
  proximo.disabled = anterior.disabled;
  anterior.addEventListener('click', onAnterior);
  proximo.addEventListener('click', onProximo);
  carrossel.addEventListener('pointerenter', pausar);
  carrossel.addEventListener('pointerleave', iniciar);
  carrossel.addEventListener('focusin', pausar);
  carrossel.addEventListener('focusout', onFimFoco);
  viewport.addEventListener('touchstart', pausar, { passive: true });
  viewport.addEventListener('touchend', iniciar, { passive: true });
  document.addEventListener('visibilitychange', onVisibilidade);
  iniciar();

  limparCarrosselCatalogo = () => {
    pausar();
    anterior.removeEventListener('click', onAnterior);
    proximo.removeEventListener('click', onProximo);
    carrossel.removeEventListener('pointerenter', pausar);
    carrossel.removeEventListener('pointerleave', iniciar);
    carrossel.removeEventListener('focusin', pausar);
    carrossel.removeEventListener('focusout', onFimFoco);
    viewport.removeEventListener('touchstart', pausar);
    viewport.removeEventListener('touchend', iniciar);
    document.removeEventListener('visibilitychange', onVisibilidade);
  };
}

function renderStats(titulos, modo) {
  const stats = calcularEstatisticas(titulos, modo);
  const rotulos = rotulosEstatisticas(modo);
  document.getElementById('hero-subtitle').textContent =
    stats.totalTitulos > 0
      ? `${stats.totalTitulos} títulos registrados até agora`
      : 'Ainda não há títulos registrados — que tal adicionar o primeiro?';

  const grid = document.getElementById('stats-grid');
  grid.innerHTML = `
    ${statCard('🎬', stats.totalFilmes, rotulos.filmes)}
    ${statCard('📺', stats.totalSeries, rotulos.series)}
    ${statCard('🎞️', stats.totalTitulos, 'títulos ao todo')}
    ${statCard('✨', stats.assistiriamos, rotulos.assistiria)}
    ${statCard('🎥', stats.naoAssistiriamos, rotulos.naoAssistiria)}
    ${statCard('⭐', stats.mediaGeral !== null ? formatarNota(stats.mediaGeral) + '/10' : '—', rotulos.media)}
  `;
}

function rotulosEstatisticas(modo) {
  if (modo !== 'geral') {
    const nome = nomeDoModo(modo, membrosEspaco, usuarioIdAtual);
    const proprio = nome === 'Meu diário';
    return {
      filmes: proprio ? 'filmes que avaliei' : `filmes avaliados por ${nome}`,
      series: proprio ? 'séries que avaliei' : `séries avaliadas por ${nome}`,
      assistiria: proprio ? 'assistiria novamente' : `${nome} assistiria novamente`,
      naoAssistiria: proprio ? 'não assistiria novamente' : `${nome} não assistiria novamente`,
      media: proprio ? 'minha média geral' : `média geral de ${nome}`
    };
  }
  return {
    filmes: 'filmes avaliados pelo grupo',
    series: 'séries avaliadas pelo grupo',
    assistiria: 'o grupo assistiria novamente',
    naoAssistiria: 'o grupo não assistiria novamente',
    media: 'média geral do grupo'
  };
}

function statCard(icon, value, label) {
  return `
    <div class="stat-card">
      <div class="stat-icon">${icon}</div>
      <div class="stat-value">${value}</div>
      <div class="stat-label">${label}</div>
    </div>
  `;
}

function renderHighlights(titulos) {
  const d = calcularDestaques(titulos);
  const grid = document.getElementById('highlights-grid');
  const destaquesMembros = d.melhoresPorMembro.flatMap(({ membro, titulos: melhores }) => {
    const nome = membro.perfil?.nome_exibicao || membro.perfil?.nome || 'Participante';
    return highlightBlock(`⭐ Melhor avaliação de ${nome}`, melhores, titulo => {
      const avaliacao = titulo.avaliacoesMembros
        ?.find(item => item.membro.usuario_id === membro.usuario_id)?.avaliacao;
      return `Nota ${formatarNota(avaliacao?.nota)}/10`;
    });
  });

  grid.innerHTML = [
    highlightBlock('🏆 Melhor filme do grupo', d.melhorFilme, t => `Média ${formatarNota(t.media)}/10`),
    highlightBlock('📺 Melhor série do grupo', d.melhorSerie, t => `Média ${formatarNota(t.media)}/10`),
    highlightBlock('🎭 Maior discordância', d.maiorDiscordancia, t => `Diferença de ${formatarNota(t.diferenca)} pontos`),
    ...destaquesMembros,
    highlightBlock('🕒 Último título adicionado', d.ultimoAdicionado, t => new Date(t.criado_em).toLocaleDateString('pt-BR'))
  ].join('');
}

function highlightBlock(label, lista, metaFn) {
  if (!lista || !lista.length) {
    return `
      <div class="highlight-card">
        <div>
          <div class="highlight-label">${label}</div>
          <div class="highlight-empty">Ainda sem dados suficientes</div>
        </div>
      </div>
    `;
  }

  return lista.map(t => `
    <a class="highlight-card" href="details.html?id=${t.id}">
      <img src="${safeImageSrc(t.capa_url)}" alt="Capa de ${escapeHtml(t.nome)}" />
      <div>
        <div class="highlight-label">${label}</div>
        <div class="highlight-title">${escapeHtml(t.nome)}</div>
        <div class="highlight-meta">${metaFn(t)}</div>
      </div>
    </a>
  `).join('');
}
