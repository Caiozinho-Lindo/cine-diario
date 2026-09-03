// js/tmdb.js
// Busca e detalhes de filmes/séries via TMDB API.

import { CONFIG } from './supabaseClient.js';

const BASE_URL = 'https://api.themoviedb.org/3';
const IMG_BASE = 'https://image.tmdb.org/t/p';

function headers() {
  return {
    accept: 'application/json',
    Authorization: `Bearer ${CONFIG.TMDB_READ_TOKEN}`
  };
}

/**
 * Busca filmes e séries pelo nome. Retorna uma lista normalizada.
 */
export async function searchMulti(query) {
  if (!query || query.trim().length < 2) return [];

  const url = `${BASE_URL}/search/multi?query=${encodeURIComponent(query)}&language=pt-BR&include_adult=false`;
  const res = await fetch(url, { headers: headers() });

  if (!res.ok) {
    throw new Error(`Erro ao buscar no TMDB (status ${res.status})`);
  }

  const data = await res.json();

  return (data.results || [])
    .filter(r => r.media_type === 'movie' || r.media_type === 'tv')
    .map(normalizeSearchResult);
}

function normalizeSearchResult(r) {
  const isMovie = r.media_type === 'movie';
  return {
    tmdb_id: r.id,
    tipo: isMovie ? 'filme' : 'serie',
    nome: isMovie ? r.title : r.name,
    nome_original: isMovie ? r.original_title : r.original_name,
    ano: parseYear(isMovie ? r.release_date : r.first_air_date),
    capa_url: posterUrl(r.poster_path),
    sinopse: r.overview || '',
    media_tmdb: Number(r.vote_average) || null,
    popularidade: Number(r.popularity) || 0
  };
}

/**
 * Busca detalhes completos (gêneros, backdrop) de um título específico.
 */
export async function getDetails(tmdbId, tipo) {
  const endpoint = tipo === 'filme' ? 'movie' : 'tv';
  const anexos = 'watch/providers,keywords,credits,recommendations';
  const url = `${BASE_URL}/${endpoint}/${tmdbId}?language=pt-BR&append_to_response=${encodeURIComponent(anexos)}`;
  const res = await fetch(url, { headers: headers() });

  if (!res.ok) {
    throw new Error(`Erro ao buscar detalhes no TMDB (status ${res.status})`);
  }

  const d = await res.json();

  return {
    tmdb_id: d.id,
    tipo,
    nome: tipo === 'filme' ? d.title : d.name,
    nome_original: tipo === 'filme' ? d.original_title : d.original_name,
    ano: parseYear(tipo === 'filme' ? d.release_date : d.first_air_date),
    generos: (d.genres || []).map(g => g.name),
    capa_url: posterUrl(d.poster_path),
    backdrop_url: backdropUrl(d.backdrop_path),
    sinopse: d.overview || '',
    duracao_minutos: duracaoDoTitulo(d, tipo),
    provedores: normalizarProvedores(d['watch/providers']?.results?.BR),
    genero_ids: (d.genres || []).map(g => g.id),
    palavras_chave: palavrasChave(d, tipo),
    palavras_chave_ids: idsPalavrasChave(d, tipo),
    pessoas_chave: pessoasChave(d.credits),
    paises_origem: paisesOrigem(d, tipo),
    idioma_original: d.original_language || null,
    colecao_id: d.belongs_to_collection?.id || null,
    recomendacoes_tmdb: (d.recommendations?.results || []).map(item => item.id),
    media_tmdb: Number(d.vote_average) || null,
    votos_tmdb: Number(d.vote_count) || 0,
    popularidade: Number(d.popularity) || 0
  };
}

export async function getTitlesByTmdbIds(itens) {
  const unicos = new Map();
  (itens || []).forEach(item => {
    const id = Number(item.tmdb_id);
    if (id) unicos.set(`${item.tipo}:${id}`, { ...item, tmdb_id: id });
  });

  const detalhes = await Promise.all([...unicos.values()].map(async item => {
    try {
      return { ...await getDetails(item.tmdb_id, item.tipo), ...item };
    } catch {
      return null;
    }
  }));
  return detalhes.filter(Boolean);
}

/**
 * Descobre sugestões externas quando a lista do espaço não possui resultados.
 */
export async function discoverTitles({ tipo, duracaoMax, clima, provedores = [], referencia = null, page = 1 }) {
  const endpoint = tipo === 'filme' ? 'movie' : 'tv';
  const params = new URLSearchParams({
    language: 'pt-BR',
    include_adult: 'false',
    sort_by: 'popularity.desc',
    watch_region: 'BR',
    with_watch_monetization_types: 'flatrate|free|ads',
    page: String(Math.max(1, Math.min(Number(page) || 1, 20)))
  });

  const idsProvedores = provedores.map(slug => PROVEDOR_IDS[slug]).filter(Boolean);
  const idsGeneros = referencia?.genero_ids?.length
    ? referencia.genero_ids.slice(0, 4)
    : generosTmdbPorClima(clima, tipo);
  if (idsProvedores.length) params.set('with_watch_providers', idsProvedores.join('|'));
  if (idsGeneros.length) params.set('with_genres', idsGeneros.join('|'));
  if (referencia?.palavras_chave_ids?.length) {
    params.set('with_keywords', referencia.palavras_chave_ids.slice(0, 5).join('|'));
  }
  if (duracaoMax) params.set('with_runtime.lte', String(duracaoMax));

  const [res, relacionados] = await Promise.all([
    fetch(`${BASE_URL}/discover/${endpoint}?${params}`, { headers: headers() }),
    buscarRelacionados(referencia, endpoint)
  ]);
  if (!res.ok) throw new Error(`Erro ao descobrir títulos no TMDB (status ${res.status})`);
  const data = await res.json();
  const resumos = [...relacionados, ...(data.results || [])]
    .map(item => normalizeSearchResult({ ...item, media_type: endpoint }));
  const unicos = new Map();
  resumos.forEach(item => unicos.set(`${item.tipo}:${item.tmdb_id}`, item));

  return Promise.all([...unicos.values()].slice(0, 18).map(item => getDetails(item.tmdb_id, item.tipo)));
}

export const PROVEDOR_IDS = {
  netflix: 8,
  'prime-video': 119,
  'disney-plus': 337,
  max: 1899,
  globoplay: 307,
  'apple-tv-plus': 350,
  'paramount-plus': 531
};

function parseYear(dateStr) {
  if (!dateStr) return null;
  const year = parseInt(dateStr.slice(0, 4), 10);
  return Number.isNaN(year) ? null : year;
}

function posterUrl(path) {
  return path ? `${IMG_BASE}/w500${path}` : null;
}

function backdropUrl(path) {
  return path ? `${IMG_BASE}/w1280${path}` : null;
}

function duracaoDoTitulo(detalhes, tipo) {
  if (tipo === 'filme') return Number(detalhes.runtime) || null;
  return Number(detalhes.last_episode_to_air?.runtime)
    || Number(detalhes.episode_run_time?.[0])
    || null;
}

function palavrasChave(detalhes, tipo) {
  return itensPalavrasChave(detalhes, tipo).map(item => item.name);
}

function idsPalavrasChave(detalhes, tipo) {
  return itensPalavrasChave(detalhes, tipo).map(item => item.id);
}

function itensPalavrasChave(detalhes, tipo) {
  return (tipo === 'filme' ? detalhes.keywords?.keywords : detalhes.keywords?.results) || [];
}

function pessoasChave(creditos) {
  const elenco = (creditos?.cast || []).slice(0, 5).map(item => `pessoa:${item.id}`);
  const equipe = (creditos?.crew || [])
    .filter(item => ['Director', 'Writer', 'Screenplay', 'Creator'].includes(item.job))
    .slice(0, 5)
    .map(item => `pessoa:${item.id}`);
  return [...new Set([...elenco, ...equipe])];
}

function paisesOrigem(detalhes, tipo) {
  if (tipo === 'serie') return detalhes.origin_country || [];
  return (detalhes.production_countries || []).map(item => item.iso_3166_1);
}

async function buscarRelacionados(referencia, endpoint) {
  if (!referencia?.tmdb_id || referencia.tipo !== (endpoint === 'movie' ? 'filme' : 'serie')) return [];
  const res = await fetch(
    `${BASE_URL}/${endpoint}/${referencia.tmdb_id}/recommendations?language=pt-BR&page=1`,
    { headers: headers() }
  );
  if (!res.ok) return [];
  const data = await res.json();
  return (data.results || []).slice(0, 12);
}

function normalizarProvedores(regiao) {
  const todos = [...(regiao?.flatrate || []), ...(regiao?.free || []), ...(regiao?.ads || [])];
  const unicos = new Map();
  todos.forEach(provedor => {
    const slug = slugDoProvedor(provedor.provider_name);
    if (slug && !unicos.has(slug)) {
      unicos.set(slug, { slug, nome: nomeDoProvedor(slug), logo_url: posterUrl(provedor.logo_path) });
    }
  });
  return [...unicos.values()];
}

function slugDoProvedor(nome) {
  const texto = String(nome || '').toLowerCase();
  if (texto.includes('netflix')) return 'netflix';
  if (texto.includes('amazon prime') || texto === 'prime video') return 'prime-video';
  if (texto.includes('disney')) return 'disney-plus';
  if (texto === 'max' || texto.includes('hbo max')) return 'max';
  if (texto.includes('globoplay')) return 'globoplay';
  if (texto.includes('apple tv')) return 'apple-tv-plus';
  if (texto.includes('paramount')) return 'paramount-plus';
  return null;
}

function nomeDoProvedor(slug) {
  return ({
    netflix: 'Netflix',
    'prime-video': 'Prime Video',
    'disney-plus': 'Disney+',
    max: 'Max',
    globoplay: 'Globoplay',
    'apple-tv-plus': 'Apple TV+',
    'paramount-plus': 'Paramount+'
  })[slug] || slug;
}

function generosTmdbPorClima(clima, tipo) {
  const filme = {
    rir: [35, 10751, 16, 10749],
    emocao: [18, 10749, 10402, 10751],
    tensao: [53, 27, 9648, 80, 28],
    pensar: [878, 99, 9648, 36, 18]
  };
  const serie = {
    rir: [35, 10751, 16],
    emocao: [18, 10751],
    tensao: [9648, 80, 10759],
    pensar: [10765, 99, 9648, 18]
  };
  return (tipo === 'filme' ? filme : serie)[clima] || [];
}
