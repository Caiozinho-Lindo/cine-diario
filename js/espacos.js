// js/espacos.js
// Espaço ativo, membros e operações de grupos compartilhados.

import { supabase } from './supabaseClient.js';

const STORAGE_KEY = 'cine_diario_espaco_ativo';
let cacheEspacos = null;

export async function getEspacosDoUsuario() {
  if (cacheEspacos) return cacheEspacos;

  const { data, error } = await supabase
    .from('espacos')
    .select('id, nome, imagem_url, criado_por, criado_em')
    .order('criado_em', { ascending: true });

  if (error) throw error;
  cacheEspacos = data || [];
  return cacheEspacos;
}

export async function getEspacoAtivo() {
  const espacos = await getEspacosDoUsuario();
  if (!espacos.length) throw new Error('Sua conta ainda não possui um espaço.');

  const salvo = localStorage.getItem(STORAGE_KEY);
  const ativo = espacos.find(espaco => espaco.id === salvo) || espacos[0];
  if (ativo.id) localStorage.setItem(STORAGE_KEY, ativo.id);
  return ativo;
}

export async function setEspacoAtivo(espacoId) {
  const espacos = await getEspacosDoUsuario();
  const existe = espacos.some(espaco => espaco.id === espacoId);
  if (!existe) throw new Error('Você não participa desse espaço.');
  localStorage.setItem(STORAGE_KEY, espacoId);
  return espacos.find(espaco => espaco.id === espacoId);
}

export async function getMembrosDoEspaco(espacoId) {
  if (!espacoId) throw new Error('Espaço inválido.');

  const { data: membros, error: membrosError } = await supabase
    .from('espaco_membros')
    .select('usuario_id, papel, entrou_em')
    .eq('espaco_id', espacoId);
  if (membrosError) throw membrosError;

  const ids = membros.map(membro => membro.usuario_id);
  if (!ids.length) return [];

  const { data: perfis, error: perfisError } = await supabase
    .from('perfis')
    .select('id, nome, nome_exibicao, avatar_url, tema')
    .in('id', ids);
  if (perfisError) throw perfisError;

  return membros.map(membro => ({
    ...membro,
    perfil: perfis.find(perfil => perfil.id === membro.usuario_id) || null
  }));
}

export async function criarEspaco({ nome }, usuarioId) {
  if (!usuarioId) throw new Error('Autenticação obrigatória.');
  const { data: espaco, error } = await supabase
    .rpc('criar_espaco', { nome_espaco: nome.trim() })
    .single();
  if (error) throw error;

  cacheEspacos = null;
  await setEspacoAtivo(espaco.id);
  return espaco;
}

export async function atualizarEspaco(espacoId, { nome }) {
  if (!espacoId) throw new Error('Espaço inválido.');

  const { data, error } = await supabase
    .from('espacos')
    .update({ nome: nome.trim() })
    .eq('id', espacoId)
    .select('id, nome, imagem_url, criado_por, criado_em')
    .single();

  if (error) throw error;
  cacheEspacos = null;
  return data;
}

export async function excluirEspaco(espacoId) {
  if (!espacoId) throw new Error('Este espaço antigo não pode ser excluído por esta tela.');

  const { error } = await supabase.from('espacos').delete().eq('id', espacoId);
  if (error) throw error;

  cacheEspacos = null;
  if (localStorage.getItem(STORAGE_KEY) === espacoId) localStorage.removeItem(STORAGE_KEY);
}

export async function sairDoEspaco(espacoId, usuarioId) {
  if (!espacoId || !usuarioId) throw new Error('Espaço e usuário são obrigatórios.');

  const { error } = await supabase.rpc('sair_do_espaco', { p_espaco_id: espacoId });

  if (error) throw error;
  cacheEspacos = null;
  if (localStorage.getItem(STORAGE_KEY) === espacoId) localStorage.removeItem(STORAGE_KEY);
}

export async function criarConviteEspaco(espacoId) {
  const { data, error } = await supabase
    .rpc('criar_convite_espaco', { p_espaco_id: espacoId })
    .single();
  if (error) throw error;
  return data;
}

export async function consultarConviteEspaco(codigo) {
  const { data, error } = await supabase
    .rpc('consultar_convite_espaco', { p_codigo: normalizarCodigo(codigo) })
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function entrarEspacoPorCodigo(codigo) {
  const { data: espaco, error } = await supabase
    .rpc('entrar_espaco_por_codigo', { p_codigo: normalizarCodigo(codigo) })
    .single();
  if (error) throw error;

  cacheEspacos = null;
  await setEspacoAtivo(espaco.id);
  return espaco;
}

export async function atualizarPapelMembro(espacoId, usuarioId, papel) {
  const { error } = await supabase.rpc('atualizar_papel_membro', {
    p_espaco_id: espacoId,
    p_usuario_id: usuarioId,
    p_papel: papel
  });
  if (error) throw error;
}

export async function removerMembroEspaco(espacoId, usuarioId) {
  const { error } = await supabase.rpc('remover_membro_espaco', {
    p_espaco_id: espacoId,
    p_usuario_id: usuarioId
  });
  if (error) throw error;
}

export function normalizarCodigo(codigo) {
  return String(codigo || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
}
