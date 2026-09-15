import { discoverTitles, getDetails, getRelatedTitles } from './tmdb.js?v=20260915.2';
import {
  generosPreferidosTmdb,
  normalizarPreferenciasDescoberta,
  preferenciasTemRespostas,
  pontuarPreferenciasDescoberta,
} from './cineTaste.js';
import {
  calcularSemelhancaReferencia,
  motivoDaDescobertaPessoal,
  pontuarTitulo,
  selecionarReferenciasPessoais
} from './recommendations.js?v=20260915.2';
import { filtrarRecomendacoesBloqueadas, getRecomendacoesBloqueadas } from './recommendationBlocks.js?v=20260909.3';
import { escapeHtml, safeImageSrc } from './ui.js?v=20260910.1';

export function criarCacheRodadasDescoberta(carregarRodada) {
  const rodadas = new Map();

  const obter = rodada => {
    const chave = Number(rodada) || 0;
    const existente = rodadas.get(chave);
    if (existente?.status === 'ready') return Promise.resolve(existente.resultado);
    if (existente?.promise) return existente.promise;

    const registro = {
      status: 'loading',
      promise: Promise.resolve()
        .then(() => carregarRodada(chave))
        .then(resultado => {
          registro.status = 'ready';
          registro.resultado = resultado;
          return resultado;
        })
        .catch(error => {
          rodadas.delete(chave);
          throw error;
        })
    };
    rodadas.set(chave, registro);
    return registro.promise;
  };

  return {
    obter,
    temPronta: rodada => rodadas.get(Number(rodada) || 0)?.status === 'ready',
    preparar: rodada => { void obter(rodada).catch(() => {}); },
    limpar: () => rodadas.clear()
  };
}

export async function carregarDescobertasPessoais({
  historico = [],
  catalogo = [],
  usuarioId,
  streamings = [],
  limite = 12,
  rodada = 0,
  preferenciasDescoberta = null
} = {}) {
  const preferencias = normalizarPreferenciasDescoberta(preferenciasDescoberta || {});
  const referenciasBase = alternarLista(
    selecionarReferenciasPessoais(historico, usuarioId, 10),
    Number(rodada) || 0,
    2
  ).slice(0, 6);
  if (!referenciasBase.length && !preferenciasTemRespostas(preferencias)) {
    return { itens: [], motivoVazio: 'sem-historico' };
  }

  const referencias = await Promise.all(referenciasBase.map(async referencia => {
    try {
      return {
        ...referencia,
        ...await getDetails(referencia.tmdb_id, referencia.tipo),
        id: referencia.id,
        nota_pessoal: referencia.nota_pessoal
      };
    } catch {
      return referencia;
    }
  }));

  const candidatos = referencias.length
    ? await getRelatedTitles(referencias, {
      limite: Math.max(12, Math.min(32, limite * 2)),
      page: paginaRelacionada(rodada)
    })
    : await descobrirPorPreferencias(preferencias, {
      streamings,
      limite: Math.max(12, Math.min(32, limite * 2)),
      rodada
    });
  const existentes = new Set((catalogo || []).map(chaveTitulo));
  const servicos = new Set(streamings || []);
  const historicoEnriquecido = mesclarReferenciasNoHistorico(historico, referencias);
  const bloqueios = await getRecomendacoesBloqueadas(usuarioId);

  const ranqueados = filtrarRecomendacoesBloqueadas(candidatos, bloqueios)
    .filter(titulo => !existentes.has(chaveTitulo(titulo)))
    .filter(titulo => !servicos.size || (titulo.provedores || [])
      .some(provedor => servicos.has(provedor.slug || provedor)))
    .map(titulo => ({
      ...titulo,
      motivo_descoberta: referencias.length
        ? motivoDaDescobertaPessoal(titulo, referencias)
        : motivoPorPreferencias(titulo, preferencias),
      pista_descoberta: pistaDaDescoberta(titulo),
      pontuacao_descoberta: pontuarTitulo(titulo, {
        historico: historicoEnriquecido,
        participantes: [usuarioId],
        clima: 'qualquer',
        permitidos: servicos,
        preferenciasDescoberta: preferencias
      }) + melhorSemelhanca(titulo, referencias) + pontuarPreferenciasDescoberta(titulo, preferencias)
    }))
    .sort((a, b) =>
      b.pontuacao_descoberta - a.pontuacao_descoberta
      || (b.media_tmdb || 0) - (a.media_tmdb || 0)
    );

  const itens = alternarLista(ranqueados, Number(rodada) || 0, Math.max(1, limite))
    .slice(0, Math.max(1, limite));

  return {
    itens,
    motivoVazio: itens.length ? null : servicos.size ? 'sem-streaming' : 'sem-sugestoes'
  };
}

async function descobrirPorPreferencias(preferencias, { streamings = [], limite = 16, rodada = 0 } = {}) {
  const climas = preferencias.climas?.length ? preferencias.climas : ['qualquer'];
  const clima = climas[Math.abs(Number(rodada) || 0) % climas.length] || 'qualquer';
  const tipos = Number(rodada) % 2 === 0 ? ['filme', 'serie'] : ['serie', 'filme'];
  const lotes = await Promise.all(tipos.map(tipo => discoverTitles({
    tipo,
    clima,
    provedores: streamings,
    page: paginaRelacionada(rodada),
    generosPreferidos: generosPreferidosTmdb(preferencias, tipo)
  }).catch(() => [])));
  return lotes.flat().slice(0, limite);
}

export function criarCardDescoberta(titulo, { onAdicionar, onBloquear } = {}) {
  const card = document.createElement('article');
  card.className = 'personal-discovery-card';
  const provedores = (titulo.provedores || []).map(item => item.nome || item.slug).filter(Boolean);
  const notaPublico = Number(titulo.media_tmdb);

  card.innerHTML = `
    <div class="personal-discovery-poster">
      <img src="${safeImageSrc(titulo.capa_url)}" alt="Capa de ${escapeHtml(titulo.nome)}" loading="lazy" />
      <span>${titulo.tipo === 'filme' ? 'Filme' : 'Série'}</span>
    </div>
    <div class="personal-discovery-body">
      <div>
        <h3>${escapeHtml(titulo.nome)}</h3>
        <p class="personal-discovery-meta">${titulo.ano || '—'}${Number.isFinite(notaPublico) && notaPublico > 0
          ? ` · ${notaPublico.toFixed(1).replace('.', ',')}/10 no TMDB`
          : ''}</p>
      </div>
      <p class="personal-discovery-reason">✦ ${escapeHtml(titulo.motivo_descoberta)}</p>
      ${provedores.length
        ? `<p class="personal-discovery-streaming">Disponível em ${escapeHtml(provedores.slice(0, 2).join(' e '))}</p>`
        : ''}
      <div class="personal-discovery-actions">
        <button class="btn btn-secondary btn-sm" data-discovery-details type="button">Ver detalhes</button>
        <button class="btn btn-primary btn-sm" data-discovery-add type="button">+ Para assistir</button>
      </div>
    </div>`;

  const botaoDetalhes = card.querySelector('[data-discovery-details]');
  botaoDetalhes.addEventListener('click', () => abrirModalDescoberta(titulo, { onBloquear }));

  const botaoAdicionar = card.querySelector('[data-discovery-add]');
  botaoAdicionar.addEventListener('click', () => onAdicionar?.(titulo, botaoAdicionar, card));
  return card;
}

export function criarCardDescobertaCatalogo(titulo, { onAdicionar, onBloquear } = {}) {
  const card = document.createElement('article');
  card.className = 'title-card catalog-title-card discovery-title-card';
  const provedores = (titulo.provedores || []).map(item => item.nome || item.slug).filter(Boolean);
  const generos = normalizarLista(titulo.generos).slice(0, 2).join(', ');
  const notaPublico = Number(titulo.media_tmdb);

  card.innerHTML = `
    <div class="poster-wrap">
      <img src="${safeImageSrc(titulo.capa_url)}" alt="Capa de ${escapeHtml(titulo.nome)}" loading="lazy" />
      <span class="badge-type">${titulo.tipo === 'filme' ? 'Filme' : 'Série'}</span>
    </div>
    <div class="card-body">
      <div class="card-title">${escapeHtml(titulo.nome)}</div>
      <div class="card-meta">${titulo.ano || '—'}${generos ? ` · ${escapeHtml(generos)}` : ''}</div>
      ${provedores.length
        ? `<div class="card-discovery-hint">Disponível em ${escapeHtml(provedores.slice(0, 2).join(' e '))}</div>`
        : ''}
      <div class="card-footer">
        <div class="card-score">${Number.isFinite(notaPublico) && notaPublico > 0
          ? `${notaPublico.toFixed(1).replace('.', ',')}<small> /10</small>`
          : '—<small> /10</small>'}</div>
      </div>
      <div class="discovery-card-actions">
        <button class="btn btn-secondary btn-sm" data-discovery-details type="button">Detalhes</button>
        <button class="btn btn-primary btn-sm" data-discovery-add type="button">+ Lista</button>
      </div>
    </div>`;

  const botaoDetalhes = card.querySelector('[data-discovery-details]');
  botaoDetalhes.addEventListener('click', () => abrirModalDescoberta(titulo, { onBloquear }));

  const botaoAdicionar = card.querySelector('[data-discovery-add]');
  botaoAdicionar.addEventListener('click', () => onAdicionar?.(titulo, botaoAdicionar, card));
  return card;
}

export function montarSecoesDescoberta(itens, {
  maxGruposSeguros = 3,
  maxItensPorGrupo = 6,
  incluirAposta = true,
  maxApostas = 6
} = {}) {
  const usados = new Set();
  const porReferencia = new Map();
  itens.forEach(item => {
    const referencia = referenciaPrincipal(item);
    if (!referencia) return;
    if (!porReferencia.has(referencia)) porReferencia.set(referencia, []);
    porReferencia.get(referencia).push(item);
  });

  const seguras = [...porReferencia.entries()]
    .sort((a, b) => b[1].length - a[1].length || pontuacaoGrupo(b[1]) - pontuacaoGrupo(a[1]))
    .slice(0, maxGruposSeguros)
    .map(([referencia, lista]) => {
      const selecionados = selecionarSemRepetir(lista, usados, maxItensPorGrupo);
      if (!selecionados.length) return null;
      return {
        tipo: 'segura',
        etiqueta: '',
        titulo: `Sugestões relacionadas a: ${referencia}`,
        descricao: 'Filmes próximos de algo que você já avaliou bem.',
        itens: selecionados
      };
    })
    .filter(Boolean);

  const apostas = incluirAposta
    ? selecionarSemRepetir(
      itens.filter(item => !estaMuitoLigadoAosGruposSeguros(item, seguras)),
      usados,
      maxApostas
    )
    : [];

  return [
    ...seguras,
    ...(apostas.length ? [{
      tipo: 'aposta',
      etiqueta: '',
      titulo: seguras.length ? 'Para variar um pouco' : 'Escolhidos pelo seu gosto',
      descricao: seguras.length
        ? 'Ainda conversa com seu histórico, mas foge do caminho mais óbvio.'
        : 'Baseados no que você respondeu em “Montar meu Cine Diário”.',
      itens: apostas
    }] : [])
  ];
}

export function abrirModalDescoberta(titulo, { onBloquear } = {}) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay discovery-modal-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'discovery-modal-title');

  const provedores = normalizarLista((titulo.provedores || []).map(item => item.nome || item.slug));
  const generos = normalizarLista(titulo.generos);
  const notaPublico = Number(titulo.media_tmdb);
  const sinopse = titulo.sinopse || 'Sinopse ainda não disponível.';
  const meta = [
    titulo.tipo === 'filme' ? 'Filme' : 'Série',
    titulo.ano,
    generos.slice(0, 3).join(', ')
  ].filter(Boolean).join(' · ');

  overlay.innerHTML = `
    <div class="modal-box discovery-modal-box">
      <button class="discovery-modal-close" type="button" data-action="close" aria-label="Fechar detalhes">×</button>
      <img class="discovery-modal-poster" src="${safeImageSrc(titulo.capa_url)}" alt="Capa de ${escapeHtml(titulo.nome)}" />
      <div class="discovery-modal-content">
        <span class="eyebrow">Detalhes da sugestão</span>
        <h3 id="discovery-modal-title">${escapeHtml(titulo.nome)}</h3>
        <p class="discovery-modal-meta">${escapeHtml(meta || 'Título sugerido')}</p>
        <p>${escapeHtml(sinopse)}</p>
        <div class="details-meta-row discovery-modal-tags">
          ${Number.isFinite(notaPublico) && notaPublico > 0
            ? `<span>${notaPublico.toFixed(1).replace('.', ',')}/10 no TMDB</span>`
            : ''}
          ${provedores.length ? `<span>${escapeHtml(provedores.slice(0, 3).join(', '))}</span>` : ''}
        </div>
        ${onBloquear ? `
          <div class="discovery-modal-actions">
            <button class="btn btn-secondary discovery-block-button" data-action="block" type="button">Não recomendar este título</button>
          </div>` : ''}
      </div>
    </div>`;

  const fechar = () => {
    document.removeEventListener('keydown', aoTeclar);
    overlay.remove();
  };
  const aoTeclar = event => {
    if (event.key === 'Escape') fechar();
  };

  overlay.addEventListener('click', async event => {
    if (event.target === overlay || event.target.dataset.action === 'close') {
      fechar();
      return;
    }
    if (event.target.dataset.action === 'block') {
      const botao = event.target;
      botao.disabled = true;
      botao.textContent = 'Removendo…';
      try {
        await onBloquear(titulo);
        fechar();
      } catch (error) {
        console.error(error);
        botao.disabled = false;
        botao.textContent = 'Não recomendar este título';
      }
    }
  });
  document.addEventListener('keydown', aoTeclar);
  document.body.appendChild(overlay);
  overlay.querySelector('[data-action="close"]').focus();
}

function selecionarSemRepetir(lista, usados, limite) {
  const selecionados = [];
  lista.forEach(item => {
    const chave = chaveTitulo(item);
    if (usados.has(chave) || selecionados.length >= limite) return;
    usados.add(chave);
    selecionados.push(item);
  });
  return selecionados;
}

function referenciaPrincipal(titulo) {
  return normalizarLista(titulo.referencias_relacionadas).find(Boolean);
}

function pontuacaoGrupo(lista) {
  return lista.reduce((total, item) => total + (Number(item.pontuacao_descoberta) || 0), 0);
}

function estaMuitoLigadoAosGruposSeguros(item, grupos) {
  const referencia = referenciaPrincipal(item);
  return grupos.some(grupo => grupo.titulo.endsWith(referencia || '\u0000'));
}

function mesclarReferenciasNoHistorico(historico, referencias) {
  const porChave = new Map(referencias.map(item => [chaveTitulo(item), item]));
  return (historico || []).map(item => {
    const enriquecido = porChave.get(chaveTitulo(item));
    return enriquecido ? { ...item, ...enriquecido, id: item.id } : item;
  });
}

function melhorSemelhanca(titulo, referencias) {
  return Math.max(0, ...referencias.map(referencia => calcularSemelhancaReferencia(titulo, referencia)));
}

function pistaDaDescoberta(titulo) {
  const referencias = normalizarLista(titulo.referencias_relacionadas);
  if (!referencias.length) return '';
  if (referencias.length === 1) return `Relacionado a ${referencias[0]}`;
  return `Relacionado a ${referencias.slice(0, 2).join(' e ')}`;
}

function motivoPorPreferencias(titulo, preferencias) {
  const generos = normalizarLista(titulo.generos).map(normalizarTextoComparacao);
  const interesse = normalizarLista(preferencias.interesses).map(normalizarTextoComparacao)
    .find(item => generos.some(genero => genero.includes(item) || item.includes(genero)));
  if (interesse) return `Porque você marcou ${interesse}`;
  if (preferencias.climas?.length) return 'Porque combina com os climas que você escolheu';
  return 'Baseado no seu Cine Diário';
}

function normalizarLista(lista) {
  return (lista || []).map(item => String(item || '').trim()).filter(Boolean);
}

function normalizarTextoComparacao(valor) {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/_/g, ' ')
    .toLowerCase()
    .trim();
}

function chaveTitulo(titulo) {
  return `${titulo?.tipo}:${titulo?.tmdb_id || titulo?.id}`;
}

function alternarLista(lista, rodada, passo = 1) {
  if (!Array.isArray(lista) || lista.length <= 1 || !rodada) return lista || [];
  const inicio = Math.abs(Math.trunc(rodada) * passo) % lista.length;
  return [...lista.slice(inicio), ...lista.slice(0, inicio)];
}

function paginaRelacionada(rodada) {
  return Math.max(1, Math.min(5, (Number(rodada) || 0) + 1));
}
