// Sessão escolhida pelo recomendador, ainda aguardando confirmação e avaliação.

import { supabase } from './supabaseClient.js';
import { getEspacoAtivo } from './espacos.js';

const CHAVE_FALLBACK = 'cine_diario_sessao_pendente';

export async function criarSessaoPendente({ titulo, participantes }) {
  const espaco = await getEspacoAtivo();
  const { data, error } = await supabase
    .rpc('criar_sessao_pendente', {
      p_titulo_id: titulo.id,
      p_participantes: participantes
    })
    .single();

  if (error && !recursoAindaNaoMigrado(error)) throw error;
  const sessao = error
    ? criarFallback(espaco.id, titulo, participantes)
    : { ...data, titulo, participantes: participantes.map(usuario_id => ({ usuario_id, confirmado_em: null })) };
  salvarFallback(sessao);
  return sessao;
}

export async function getSessaoPendente() {
  const espaco = await getEspacoAtivo();
  const { data, error } = await supabase
    .from('sessoes')
    .select(`
      id, espaco_id, titulo_id, criado_por, status, criado_em,
      titulo:titulos(id, nome, ano, tipo, capa_url, sinopse),
      participantes:sessao_participantes(usuario_id, confirmado_em)
    `)
    .eq('espaco_id', espaco.id)
    .eq('status', 'pendente')
    .order('criado_em', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (recursoAindaNaoMigrado(error)) return lerFallback(espaco.id);
    throw error;
  }
  if (!data) {
    removerFallback(espaco.id);
    return null;
  }
  salvarFallback(data);
  return data;
}

export async function confirmarSessao(sessaoId) {
  if (!sessaoId) return null;
  const { data, error } = await supabase
    .rpc('confirmar_sessao', { p_sessao_id: sessaoId })
    .single();

  const fallback = lerFallbackPorId(sessaoId);
  if (fallback) removerFallback(fallback.espaco_id);
  if (error) {
    if (fallback && recursoAindaNaoMigrado(error)) return { ...fallback, status: 'confirmada' };
    throw error;
  }
  return data;
}

function criarFallback(espacoId, titulo, participantes) {
  return {
    id: `local-${Date.now()}`,
    espaco_id: espacoId,
    titulo_id: titulo.id,
    titulo,
    participantes: participantes.map(usuario_id => ({ usuario_id, confirmado_em: null })),
    status: 'pendente',
    criado_em: new Date().toISOString()
  };
}

function salvarFallback(sessao) {
  try {
    const mapa = JSON.parse(localStorage.getItem(CHAVE_FALLBACK) || '{}');
    mapa[sessao.espaco_id] = sessao;
    localStorage.setItem(CHAVE_FALLBACK, JSON.stringify(mapa));
  } catch { /* sem persistência local */ }
}

function lerFallback(espacoId) {
  try {
    const mapa = JSON.parse(localStorage.getItem(CHAVE_FALLBACK) || '{}');
    return mapa[espacoId]?.status === 'pendente' ? mapa[espacoId] : null;
  } catch {
    return null;
  }
}

function lerFallbackPorId(sessaoId) {
  try {
    return Object.values(JSON.parse(localStorage.getItem(CHAVE_FALLBACK) || '{}'))
      .find(sessao => sessao.id === sessaoId) || null;
  } catch {
    return null;
  }
}

function removerFallback(espacoId) {
  try {
    const mapa = JSON.parse(localStorage.getItem(CHAVE_FALLBACK) || '{}');
    delete mapa[espacoId];
    localStorage.setItem(CHAVE_FALLBACK, JSON.stringify(mapa));
  } catch { /* nada a remover */ }
}

function recursoAindaNaoMigrado(error) {
  return ['42P01', '42883', 'PGRST202', 'PGRST205'].includes(error?.code);
}
