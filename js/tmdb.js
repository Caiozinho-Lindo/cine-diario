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
    sinopse: r.overview || ''
  };
}

/**
 * Busca detalhes completos (gêneros, backdrop) de um título específico.
 */
export async function getDetails(tmdbId, tipo) {
  const endpoint = tipo === 'filme' ? 'movie' : 'tv';
  const url = `${BASE_URL}/${endpoint}/${tmdbId}?language=pt-BR`;
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
    sinopse: d.overview || ''
  };
}

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
