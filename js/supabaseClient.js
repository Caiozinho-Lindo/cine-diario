// js/supabaseClient.js
// Cria e exporta o cliente Supabase único usado em todo o app.

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const cfg = window.APP_CONFIG;

if (!cfg || !cfg.SUPABASE_URL || cfg.SUPABASE_URL.includes('SEU-PROJETO')) {
  console.error(
    '[config] config.js não encontrado ou não preenchido. ' +
    'Copie config.example.js para config.js e preencha suas chaves do Supabase e TMDB.'
  );
}

export const supabase = cfg
  ? createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY)
  : null;

export const CONFIG = cfg || {};
