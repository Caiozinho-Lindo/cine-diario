// Serviços de streaming cadastrados por usuário.

import { supabase } from './supabaseClient.js';

export const SERVICOS_STREAMING = [
  { slug: 'netflix', nome: 'Netflix' },
  { slug: 'prime-video', nome: 'Prime Video' },
  { slug: 'disney-plus', nome: 'Disney+' },
  { slug: 'max', nome: 'Max' },
  { slug: 'globoplay', nome: 'Globoplay' },
  { slug: 'apple-tv-plus', nome: 'Apple TV+' },
  { slug: 'paramount-plus', nome: 'Paramount+' }
];

const CHAVE_FALLBACK = 'cine_diario_streamings_usuario';

export async function getStreamingsDosUsuarios(usuarioIds) {
  const ids = [...new Set((usuarioIds || []).filter(Boolean))];
  if (!ids.length) return {};

  const { data, error } = await supabase
    .from('usuario_streamings')
    .select('usuario_id, servico')
    .in('usuario_id', ids);

  if (error) {
    if (recursoAindaNaoMigrado(error)) return lerFallback(ids);
    throw error;
  }
  return agrupar(data || [], ids);
}

export async function getMeusStreamings(usuarioId) {
  const mapa = await getStreamingsDosUsuarios([usuarioId]);
  return mapa[usuarioId] || [];
}

export async function salvarMeusStreamings(usuarioId, servicos) {
  const valores = [...new Set(servicos)].filter(slug => SERVICOS_STREAMING.some(item => item.slug === slug));
  const { error } = await supabase.rpc('salvar_meus_streamings', { p_servicos: valores });
  if (error) {
    if (recursoAindaNaoMigrado(error)) {
      salvarFallback(usuarioId, valores);
      return valores;
    }
    throw error;
  }

  salvarFallback(usuarioId, valores);
  return valores;
}

function agrupar(linhas, ids) {
  const mapa = Object.fromEntries(ids.map(id => [id, []]));
  linhas.forEach(linha => {
    if (mapa[linha.usuario_id]) mapa[linha.usuario_id].push(linha.servico);
  });
  return mapa;
}

function lerFallback(ids) {
  try {
    const salvo = JSON.parse(localStorage.getItem(CHAVE_FALLBACK) || '{}');
    return Object.fromEntries(ids.map(id => [id, Array.isArray(salvo[id]) ? salvo[id] : []]));
  } catch {
    return Object.fromEntries(ids.map(id => [id, []]));
  }
}

function salvarFallback(usuarioId, servicos) {
  try {
    const salvo = JSON.parse(localStorage.getItem(CHAVE_FALLBACK) || '{}');
    salvo[usuarioId] = servicos;
    localStorage.setItem(CHAVE_FALLBACK, JSON.stringify(salvo));
  } catch { /* o banco continua sendo a fonte principal */ }
}

function recursoAindaNaoMigrado(error) {
  return ['42P01', '42883', 'PGRST202', 'PGRST205'].includes(error?.code);
}
