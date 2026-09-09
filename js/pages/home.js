// js/pages/home.js
import { requireSession, getCurrentProfile, getUserId } from '../auth.js';
import { getAllTitulosComAvaliacoes, criarTitulo } from '../titulos.js';
import { calcularEstatisticas, calcularDestaques, formatarNota } from '../statistics.js?v=20260831.1';
import { normalizarModoAtivo, aplicarTema, nomeDoModo } from '../themes.js?v=20260906.1';
import { renderNavbar, renderTituloCard, safeImageSrc, escapeHtml, showToast } from '../ui.js';
import { getEspacoAtivo, getMembrosDoEspaco } from '../espacos.js';
import { getSessaoPendente, cancelarSessao } from '../sessoes.js?v=20260906.2';
import { initRecommend } from './recommend.js?v=20260906.2';
import { getMeusStreamings } from '../streamings.js';
import {
  carregarDescobertasPessoais,
  criarCardDescobertaCatalogo,
  montarSecoesDescoberta
} from '../discovery.js?v=20260907.5';

let membrosEspaco = [];
let usuarioIdAtual = null;
let catalogoCompleto = [];
let modoAtual = 'geral';
let limparCarrosselCatalogo = () => {};

init();

async function init() {
  const session = await requireSession();
  if (!session) return;

  const perfilAtual = await getCurrentProfile(session);
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

  renderSessaoPendente().catch(error => console.error('[sessão pendente]', error));

  try {
    catalogoCompleto = await getAllTitulosComAvaliacoes({ incluirDesejos: true });
    window._titulos = catalogoCompleto.filter(titulo => !titulo.quero_assistir);
    renderTudo(modoAtivo);
    await initRecommend({
      embedded: true,
      session,
      perfilAtual,
      espacoAtivo,
      membros: membrosEspaco,
      usuarioId: usuarioIdAtual,
      historicoInicial: window._titulos
    });
    await renderDescobertasPessoais(window._titulos);
  } catch (err) {
    console.error(err);
    showToast('Erro ao carregar dados. Verifique sua conexão e configuração do Supabase.', 'error');
  }
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

async function renderDescobertasPessoais(historico) {
  const grid = document.getElementById('home-discovery-grid');
  if (!grid) return;

  try {
    const streamings = await getMeusStreamings(usuarioIdAtual);
    const resultado = await carregarDescobertasPessoais({
      historico,
      catalogo: catalogoCompleto,
      usuarioId: usuarioIdAtual,
      streamings,
      limite: 4
    });

    grid.innerHTML = '';
    if (!resultado.itens.length) {
      renderVazioDescobertas(grid, resultado.motivoVazio);
      return;
    }

    montarSecoesDescoberta(resultado.itens, {
      maxGruposSeguros: 2,
      maxItensPorGrupo: 4,
      incluirAposta: true,
      maxApostas: 4
    }).forEach(grupo => {
      const secao = document.createElement('section');
      secao.className = `discovery-reason-group${grupo.tipo === 'aposta' ? ' discovery-reason-group-risk' : ''}`;
      secao.innerHTML = `
        <header class="discovery-reason-heading">
          <div>
            <span class="eyebrow">${escapeHtml(grupo.etiqueta)}</span>
            <h3>${escapeHtml(grupo.titulo)}</h3>
            ${grupo.descricao ? `<p>${escapeHtml(grupo.descricao)}</p>` : ''}
          </div>
          <span>${grupo.itens.length} título${grupo.itens.length === 1 ? '' : 's'}</span>
        </header>
        <div class="cards-grid discovery-catalog-grid home-discovery-section-grid"></div>`;

      const lista = secao.querySelector('.home-discovery-section-grid');
      grupo.itens.forEach(titulo => {
        lista.appendChild(criarCardDescobertaCatalogo(titulo, { onAdicionar: adicionarDescobertaALista }));
      });
      grid.appendChild(secao);
    });
  } catch (error) {
    console.error('[descobrir]', error);
    grid.innerHTML = '<div class="personal-discovery-empty"><strong>Não foi possível preparar suas sugestões agora.</strong>Tente novamente em alguns instantes.</div>';
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
    ? ['Suas sugestões começam pelas suas notas.', 'Avalie alguns títulos para o Cine Diário aprender do que você gosta.']
    : motivo === 'sem-streaming'
      ? ['Nada novo apareceu nos seus streamings agora.', 'Você pode ajustar os serviços no perfil ou conferir novamente mais tarde.']
      : ['Nenhuma sugestão nova encontrada agora.', 'Seu catálogo já pode conter as melhores correspondências.'];
  container.innerHTML = `<div class="personal-discovery-empty"><strong>${conteudo[0]}</strong>${conteudo[1]}</div>`;
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
