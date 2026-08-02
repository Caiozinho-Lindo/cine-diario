// js/auth.js
// Login, logout, sessão atual e mapeamento de usuário -> perfil (caio/noemy)

import { supabase, CONFIG } from './supabaseClient.js';

/**
 * Faz login com e-mail e senha via Supabase Auth.
 */
export async function login(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.session;
}

export async function logout() {
  await supabase.auth.signOut();
  window.location.href = resolveRootPath('index.html');
}

/**
 * Retorna a sessão atual (ou null se não autenticado).
 */
export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

/**
 * Garante que existe sessão; se não, redireciona para o login.
 * Deve ser chamado no início de cada página protegida.
 */
export async function requireSession() {
  const session = await getSession();
  if (!session) {
    window.location.href = resolveRootPath('index.html');
    return null;
  }
  return session;
}

/**
 * Mapeia o e-mail do usuário logado para o perfil "caio" ou "noemy".
 * Isso é o que decide qual tema/identidade visual carregar por padrão
 * e qual coluna de avaliação pertence a quem está logado.
 */
export function getProfileFromSession(session) {
  if (!session) return null;
  const email = session.user.email;
  if (email === CONFIG.CAIO_EMAIL) return 'caio';
  if (email === CONFIG.NOEMY_EMAIL) return 'noemy';
  return null;
}

export function getUserId(session) {
  return session?.user?.id || null;
}

/**
 * Resolve um caminho relativo à raiz do site, funcionando tanto quando
 * a página atual está em /pages/ quanto na raiz.
 */
export function resolveRootPath(path) {
  const inPages = window.location.pathname.includes('/pages/');
  return inPages ? `../${path}` : path;
}
