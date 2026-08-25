// js/supabaseClient.js
// Cria e exporta o cliente Supabase único usado em todo o app.

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const cfg = window.APP_CONFIG;

const camposObrigatorios = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'TMDB_READ_TOKEN'];
const configuracaoInvalida = !cfg || camposObrigatorios.some(campo => {
  const valor = cfg?.[campo];
  return !valor || /^(SUA_|SEU_|https:\/\/SEU-)/.test(valor);
});

if (configuracaoInvalida) {
  const mensagem = 'Configuração ausente ou incompleta. Revise o arquivo config.js.';
  const loginError = document.getElementById('login-error');

  if (loginError) {
    loginError.hidden = false;
    loginError.textContent = mensagem;
  } else {
    const aviso = document.createElement('div');
    aviso.className = 'config-error-banner';
    aviso.setAttribute('role', 'alert');
    aviso.textContent = mensagem;
    document.body.prepend(aviso);
  }

  throw new Error(`[config] ${mensagem}`);
}

export const supabase = createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

export const CONFIG = cfg;
