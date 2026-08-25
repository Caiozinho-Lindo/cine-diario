// js/auth.js
// Autenticação e perfil baseados no UUID imutável do Supabase Auth.

import { supabase } from './supabaseClient.js';

let perfilAtual = null;

export async function login(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  perfilAtual = await carregarPerfil(data.session?.user?.id);
  return data.session;
}

export async function cadastrar({ nome, email, password }) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { nome_exibicao: nome.trim() },
      emailRedirectTo: new URL(resolveRootPath('index.html'), window.location.href).href
    }
  });
  if (error) throw error;
  return data;
}

export async function solicitarRecuperacaoSenha(email) {
  const redirectUrl = new URL(resolveRootPath('index.html'), window.location.href);
  redirectUrl.searchParams.set('recuperar', '1');
  const redirectTo = redirectUrl.href;
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) throw error;
}

export async function atualizarSenha(password) {
  const { data, error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
  return data.user;
}

export async function logout() {
  perfilAtual = null;
  sessionStorage.removeItem('diario_modo_ativo');
  sessionStorage.removeItem('modo_definido');
  await supabase.auth.signOut();
  window.location.href = resolveRootPath('index.html');
}

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function requireSession() {
  const session = await getSession();
  if (!session) {
    window.location.href = resolveRootPath('index.html');
    return null;
  }

  if (!perfilAtual || perfilAtual.id !== session.user.id) {
    perfilAtual = await carregarPerfil(session.user.id);
  }
  return session;
}

async function carregarPerfil(usuarioId) {
  if (!usuarioId) return null;

  // select('*') mantém compatibilidade durante a transição: antes da
  // migração 002 existem apenas id/nome; depois entram personalizações.
  const { data, error } = await supabase
    .from('perfis')
    .select('*')
    .eq('id', usuarioId)
    .single();

  if (error) throw error;
  return data;
}

export async function getCurrentProfile(session) {
  const usuarioId = getUserId(session);
  if (!usuarioId) return null;
  if (!perfilAtual || perfilAtual.id !== usuarioId) {
    perfilAtual = await carregarPerfil(usuarioId);
  }
  return perfilAtual;
}

// Compatibilidade temporária com as telas atuais. A identidade vem do registro
// cujo id é auth.uid(); o e-mail não participa mais da decisão.
export function getProfileFromSession(session) {
  if (!session || perfilAtual?.id !== session.user.id) return null;
  const nomeLegado = perfilAtual.nome?.toLowerCase();
  if (nomeLegado === 'caio' || nomeLegado === 'noemy') return nomeLegado;
  return 'pessoal';
}

export async function atualizarPerfil(usuarioId, campos) {
  const permitidos = ['nome_exibicao', 'avatar_url', 'tema', 'cor_destaque', 'pagina_inicial'];
  const payload = Object.fromEntries(
    Object.entries(campos).filter(([chave]) => permitidos.includes(chave))
  );

  const { data, error } = await supabase
    .from('perfis')
    .update({ ...payload, atualizado_em: new Date().toISOString() })
    .eq('id', usuarioId)
    .select()
    .single();

  if (error) throw error;
  perfilAtual = data;
  return data;
}

export function getUserId(session) {
  return session?.user?.id || null;
}

export function resolveRootPath(path) {
  const inPages = window.location.pathname.includes('/pages/');
  return inPages ? `../${path}` : path;
}
