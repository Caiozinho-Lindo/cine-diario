/**
 * CONFIGURAÇÃO DO APP — Diário Cinematográfico do Casal
 *
 * 1. Copie este arquivo e renomeie a cópia para "config.js"
 *    (config.js está no .gitignore e NUNCA deve ser commitado)
 * 2. Preencha os valores abaixo com suas credenciais reais.
 * 3. Abra o index.html com um servidor local (ex: Live Server do VSCode)
 *
 * Onde conseguir cada valor:
 * - SUPABASE_URL e SUPABASE_ANON_KEY: painel do Supabase > Project Settings > API
 * - TMDB_READ_TOKEN: themoviedb.org > Settings > API > "API Read Access Token (v4 auth)"
 */
window.APP_CONFIG = {
  SUPABASE_URL: "https://SEU-PROJETO.supabase.co",
  SUPABASE_ANON_KEY: "SUA_CHAVE_ANON_PUBLICA_AQUI",
  TMDB_READ_TOKEN: "SEU_TOKEN_DE_LEITURA_TMDB_AQUI",

  // E-mails usados para autenticação no Supabase (criados manualmente no painel)
  CAIO_EMAIL: "caio@diario.local",
  NOEMY_EMAIL: "noemy@diario.local"
};
