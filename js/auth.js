// js/auth.js
// Autenticação e perfil baseados no UUID imutável do Supabase Auth.

import { supabase } from './supabaseClient.js';

let perfilAtual = null;
let timerExpiracao = null;

const CHAVE_LEMBRAR = 'cine_diario_lembrar_dispositivo';
const CHAVE_SESSAO_ABERTA = 'cine_diario_sessao_aberta';
const CHAVE_POLITICA_INICIADA = 'cine_diario_politica_sessao_v1';
const DURACAO_LEMBRAR_MS = 7 * 24 * 60 * 60 * 1000;
const TIMER_MAXIMO_MS = 2_147_000_000;

export async function login(email, password, { lembrarDispositivo = false } = {}) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  registrarPreferenciaSessao(data.session, lembrarDispositivo);
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
  if (data.session) registrarPreferenciaSessao(data.session, false);
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
  const { data: sessaoAtual } = await supabase.auth.getSession();
  const session = sessaoAtual.session;
  if (session) registrarPreferenciaSessao(session, false);
  return data.user;
}

export async function logout() {
  perfilAtual = null;
  limparPreferenciaSessao();
  sessionStorage.removeItem('diario_modo_ativo');
  sessionStorage.removeItem('modo_definido');
  await supabase.auth.signOut();
  window.location.href = resolveRootPath('index.html');
}

export async function getSession({ permitirMigracao = true } = {}) {
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (!session) return null;

  if (sessaoPermitida(session, permitirMigracao)) {
    agendarExpiracao(session);
    return session;
  }

  await encerrarSessaoLocal();
  return null;
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

function registrarPreferenciaSessao(session, lembrarDispositivo) {
  const usuarioId = session?.user?.id;
  if (!usuarioId) return;

  localStorage.setItem(CHAVE_POLITICA_INICIADA, '1');
  sessionStorage.setItem(CHAVE_SESSAO_ABERTA, usuarioId);

  if (lembrarDispositivo) {
    localStorage.setItem(CHAVE_LEMBRAR, JSON.stringify({
      usuarioId,
      expiraEm: Date.now() + DURACAO_LEMBRAR_MS
    }));
  } else {
    localStorage.removeItem(CHAVE_LEMBRAR);
  }

  agendarExpiracao(session);
}

function sessaoPermitida(session, permitirMigracao) {
  const usuarioId = session.user.id;
  const preferencia = lerPreferenciaSessao();

  if (preferencia?.usuarioId === usuarioId && preferencia.expiraEm > Date.now()) {
    sessionStorage.setItem(CHAVE_SESSAO_ABERTA, usuarioId);
    return true;
  }

  if (preferencia) localStorage.removeItem(CHAVE_LEMBRAR);
  if (sessionStorage.getItem(CHAVE_SESSAO_ABERTA) === usuarioId) return true;

  // Mantém quem já estava conectado antes desta funcionalidade. Essa
  // compatibilidade só é aplicada uma vez neste navegador.
  if (permitirMigracao && !localStorage.getItem(CHAVE_POLITICA_INICIADA)) {
    registrarPreferenciaSessao(session, true);
    return true;
  }

  return false;
}

function lerPreferenciaSessao() {
  try {
    const valor = JSON.parse(localStorage.getItem(CHAVE_LEMBRAR));
    if (!valor || !valor.usuarioId || !Number.isFinite(valor.expiraEm)) return null;
    return valor;
  } catch {
    return null;
  }
}

function agendarExpiracao(session) {
  window.clearTimeout(timerExpiracao);
  const preferencia = lerPreferenciaSessao();
  if (!preferencia || preferencia.usuarioId !== session?.user?.id) return;

  const restante = preferencia.expiraEm - Date.now();
  if (restante <= 0) {
    void encerrarSessaoLocal().then(() => {
      window.location.href = resolveRootPath('index.html');
    });
    return;
  }

  timerExpiracao = window.setTimeout(() => agendarExpiracao(session), Math.min(restante, TIMER_MAXIMO_MS));
}

function limparPreferenciaSessao() {
  window.clearTimeout(timerExpiracao);
  timerExpiracao = null;
  localStorage.removeItem(CHAVE_LEMBRAR);
  localStorage.setItem(CHAVE_POLITICA_INICIADA, '1');
  sessionStorage.removeItem(CHAVE_SESSAO_ABERTA);
}

async function encerrarSessaoLocal() {
  perfilAtual = null;
  limparPreferenciaSessao();
  await supabase.auth.signOut({ scope: 'local' });
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
