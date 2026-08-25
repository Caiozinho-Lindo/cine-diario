// js/espacos.js
// Espaço ativo, membros e operações de grupos compartilhados.

import { supabase } from './supabaseClient.js';

const STORAGE_KEY = 'cine_diario_espaco_ativo';
let cacheEspacos = null;

export async function getEspacosDoUsuario() {
  if (cacheEspacos) return cacheEspacos;

  const { data, error } = await supabase
    .from('espacos')
    .select('id, nome, tipo, imagem_url, criado_por, criado_em')
    .order('criado_em', { ascending: true });

  if (error) {
    if (schemaMultiusuarioAusente(error)) {
      cacheEspacos = [{ id: null, nome: 'Caio & Noemy', tipo: 'casal', legado: true }];
      return cacheEspacos;
    }
    throw error;
  }
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
  if (!espacoId) {
    const { data, error } = await supabase.from('perfis').select('*');
    if (error) throw error;
    return (data || []).map(perfil => ({
      usuario_id: perfil.id,
      papel: perfil.nome === 'caio' ? 'proprietario' : 'administrador',
      perfil
    }));
  }

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

export async function criarEspaco({ nome, tipo = 'outro' }, usuarioId) {
  if (!usuarioId) throw new Error('Autenticação obrigatória.');
  const { data: espaco, error } = await supabase
    .rpc('criar_espaco', { nome_espaco: nome.trim(), tipo_espaco: tipo })
    .single();
  if (error) throw error;

  cacheEspacos = null;
  await setEspacoAtivo(espaco.id);
  return espaco;
}

export function limparCacheEspacos() {
  cacheEspacos = null;
}

export function schemaMultiusuarioAusente(error) {
  return ['42P01', '42703', 'PGRST204', 'PGRST205'].includes(error?.code)
    || /espacos|espaco_id|biblioteca_usuario/i.test(error?.message || '');
}
