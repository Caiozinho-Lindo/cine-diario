// Preferências de recomendação que devem valer para o mesmo usuário em qualquer dispositivo.

import { supabase } from './supabaseClient.js';

const TABELA = 'usuario_recomendacoes_bloqueadas';
const CHAVE_FALLBACK = 'cine_diario_recomendacoes_bloqueadas';

export function chaveBloqueioRecomendacao(titulo) {
  if (!titulo?.tipo) return null;
  if (titulo.tmdb_id) return `${titulo.tipo}:tmdb:${titulo.tmdb_id}`;
  if (titulo.id) return `${titulo.tipo}:titulo:${titulo.id}`;
  return null;
}

export async function getRecomendacoesBloqueadas(usuarioId) {
  if (!usuarioId) return [];

  const { data, error } = await supabase
    .from(TABELA)
    .select('tipo, chave, tmdb_id, titulo_id, nome, bloqueado_em')
    .eq('usuario_id', usuarioId);

  if (error) {
    if (recursoAindaNaoMigrado(error)) return lerFallback(usuarioId);
    throw error;
  }

  const bloqueios = (data || []).map(normalizarRegistro).filter(Boolean);
  salvarFallback(usuarioId, bloqueios);
  return bloqueios;
}

export async function bloquearRecomendacao(titulo, usuarioId) {
  const registro = montarRegistro(titulo, usuarioId);
  if (!registro) throw new Error('Não foi possível identificar esse título para bloquear.');

  const { error } = await supabase
    .from(TABELA)
    .upsert(registro, { onConflict: 'usuario_id,tipo,chave' });

  if (error) {
    if (recursoAindaNaoMigrado(error)) {
      const atuais = lerFallback(usuarioId);
      salvarFallback(usuarioId, substituirBloqueio(atuais, normalizarRegistro(registro)));
      return registro;
    }
    throw error;
  }

  salvarFallback(usuarioId, substituirBloqueio(lerFallback(usuarioId), normalizarRegistro(registro)));
  return registro;
}

export function filtrarRecomendacoesBloqueadas(titulos, bloqueios) {
  const chaves = new Set((bloqueios || []).map(chaveDoRegistro).filter(Boolean));
  return (titulos || []).filter(titulo => {
    const chave = chaveBloqueioRecomendacao(titulo);
    return !chave || !chaves.has(chave);
  });
}

function montarRegistro(titulo, usuarioId) {
  if (!usuarioId || !titulo?.tipo) return null;
  const tmdbId = titulo.tmdb_id ? Number(titulo.tmdb_id) : null;
  const tituloId = tmdbId ? null : titulo.id || null;
  if (!tmdbId && !tituloId) return null;

  return {
    usuario_id: usuarioId,
    tipo: titulo.tipo,
    chave: tmdbId ? `tmdb:${tmdbId}` : `titulo:${tituloId}`,
    tmdb_id: tmdbId,
    titulo_id: tituloId,
    nome: titulo.nome || null,
    bloqueado_em: new Date().toISOString()
  };
}

function normalizarRegistro(registro) {
  if (!registro?.tipo || !registro?.chave) return null;
  return {
    tipo: registro.tipo,
    chave: registro.chave,
    tmdb_id: registro.tmdb_id ? Number(registro.tmdb_id) : null,
    titulo_id: registro.titulo_id || null,
    nome: registro.nome || '',
    bloqueado_em: registro.bloqueado_em || null
  };
}

function chaveDoRegistro(registro) {
  return registro?.tipo && registro?.chave ? `${registro.tipo}:${registro.chave}` : null;
}

function substituirBloqueio(lista, novo) {
  const chave = chaveDoRegistro(novo);
  return [
    ...(lista || []).filter(item => chaveDoRegistro(item) !== chave),
    novo
  ];
}

function lerFallback(usuarioId) {
  try {
    const salvo = JSON.parse(localStorage.getItem(CHAVE_FALLBACK) || '{}');
    return Array.isArray(salvo[usuarioId]) ? salvo[usuarioId].map(normalizarRegistro).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function salvarFallback(usuarioId, bloqueios) {
  try {
    const salvo = JSON.parse(localStorage.getItem(CHAVE_FALLBACK) || '{}');
    salvo[usuarioId] = (bloqueios || []).map(normalizarRegistro).filter(Boolean);
    localStorage.setItem(CHAVE_FALLBACK, JSON.stringify(salvo));
  } catch { /* o banco continua sendo a fonte principal */ }
}

function recursoAindaNaoMigrado(error) {
  return ['42P01', 'PGRST205'].includes(error?.code);
}
