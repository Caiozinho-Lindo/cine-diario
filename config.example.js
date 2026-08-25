/**
 * CONFIGURAÇÃO DO APP — Diário Cinematográfico do Casal
 *
 * 1. Copie este arquivo e renomeie a cópia para "config.js".
 * 2. Em hospedagem estática, os valores desse arquivo ficam públicos no
 *    navegador. Use somente a chave anon/publishable do Supabase e proteja os
 *    dados com as políticas RLS de supabase/migrations.
 * 3. Preencha os valores abaixo e abra o index.html com um servidor HTTP.
 *
 * Onde conseguir cada valor:
 * - SUPABASE_URL e SUPABASE_ANON_KEY: painel do Supabase > Project Settings > API
 * - TMDB_READ_TOKEN: themoviedb.org > Settings > API > "API Read Access Token (v4 auth)"
 */
window.APP_CONFIG = {
  SUPABASE_URL: "https://SEU-PROJETO.supabase.co",
  SUPABASE_ANON_KEY: "SUA_CHAVE_ANON_PUBLICA_AQUI",
  TMDB_READ_TOKEN: "SEU_TOKEN_DE_LEITURA_TMDB_AQUI"
};
