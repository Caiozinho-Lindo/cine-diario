import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const recommendJs = await readFile(new URL('../js/pages/recommend.js', import.meta.url), 'utf8');
const recommendCss = await readFile(new URL('../css/recommend.css', import.meta.url), 'utf8');
const sessoesJs = await readFile(new URL('../js/sessoes.js', import.meta.url), 'utf8');
const discoveryJs = await readFile(new URL('../js/discovery.js', import.meta.url), 'utf8');
const tmdbJs = await readFile(new URL('../js/tmdb.js', import.meta.url), 'utf8');
const blocksJs = await readFile(new URL('../js/recommendationBlocks.js', import.meta.url), 'utf8');
const blockMigration = await readFile(new URL('../supabase/migrations/010_recomendacoes_bloqueadas.sql', import.meta.url), 'utf8');
const homeHtml = await readFile(new URL('../pages/home.html', import.meta.url), 'utf8');
const recommendHtml = await readFile(new URL('../pages/recommend.html', import.meta.url), 'utf8');

test('a escolha concluída não repete explicações sobre a próxima visita', () => {
  assert.doesNotMatch(recommendJs, /Na próxima visita/);
  assert.doesNotMatch(recommendJs, /aviso discreto aparecerá no Início/);
  assert.doesNotMatch(recommendJs, /session-side/);
  assert.match(recommendCss, /\.session-layout\s*\{\s*display:\s*block/);
});

test('uma sessão pendente pode ser cancelada sem remover o título', () => {
  assert.match(recommendJs, /Cancelar escolha/);
  assert.match(recommendJs, /cancelarSessao\(sessaoPendente\.id\)/);
  assert.match(sessoesJs, /rpc\('cancelar_sessao'/);
  assert.doesNotMatch(sessoesJs, /\.from\('titulos'\).*delete/s);
});

test('sugestões permitem bloquear um título nos detalhes', () => {
  assert.match(recommendJs, /data-details/);
  assert.match(recommendJs, /bloquearFinalista/);
  assert.match(recommendJs, /filtrarRecomendacoesBloqueadas/);
  assert.match(discoveryJs, /Não recomendar este título/);
  assert.match(discoveryJs, /onBloquear/);
  assert.match(blocksJs, /usuario_recomendacoes_bloqueadas/);
});

test('bloqueio de recomendação é preparado para sincronizar entre dispositivos', () => {
  assert.match(blockMigration, /create table if not exists public\.usuario_recomendacoes_bloqueadas/);
  assert.match(blockMigration, /usuario_id uuid not null references auth\.users/);
  assert.match(blockMigration, /primary key \(usuario_id, tipo, chave\)/);
  assert.match(blockMigration, /enable row level security/);
  assert.match(blockMigration, /usuario_id = auth\.uid\(\)/);
});

test('ações de sortear ou pedir outras opções usam só o dado visível', () => {
  assert.doesNotMatch(homeHtml, /Ainda em dúvida\? Sortear/);
  assert.doesNotMatch(homeHtml, /Mostrar outras três opções/);
  assert.doesNotMatch(recommendHtml, /Ainda em dúvida\? Sortear/);
  assert.doesNotMatch(recommendHtml, /Mostrar outras três opções/);
  assert.match(homeHtml, /id="recommend-raffle"[^>]+aria-label="Sortear uma opção"[^>]*>🍀<\/button>/);
  assert.match(homeHtml, /id="recommend-more"[^>]+aria-label="Mostrar outras opções"[^>]*>🎲<\/button>/);
  assert.match(recommendHtml, /id="recommend-raffle"[^>]+aria-label="Sortear uma opção"[^>]*>🍀<\/button>/);
  assert.match(recommendHtml, /id="recommend-more"[^>]+aria-label="Mostrar outras opções"[^>]*>🎲<\/button>/);
});

test('inspiração da vez mostra capas e pode ser automática por clima', () => {
  assert.match(homeHtml, /Inspiração da vez/);
  assert.match(recommendHtml, /Inspiração da vez/);
  assert.doesNotMatch(homeHtml, /datalist id="recommend-reference-options"/);
  assert.match(homeHtml, /class="reference-options"/);
  assert.match(recommendJs, /selecionarReferenciaAutomatica/);
  assert.match(recommendJs, /avaliarCompatibilidadeClima\(titulo,\s*clima\)/);
  assert.match(recommendJs, /inspirado automaticamente em/);
  assert.match(recommendJs, /safeImageSrc\(titulo\.capa_url\)/);
  assert.match(recommendCss, /\.reference-option img/);
});

test('sugestão nova busca com mais abrangência sem deixar a inspiração automática mandar no gênero', () => {
  assert.match(recommendJs, /carregarDescobertasAbrangentes/);
  assert.match(recommendJs, /const referenciaDeBusca = referencia \? referenciaCompleta : null/);
  assert.match(recommendJs, /paginasParaTentar = origem === 'novas' \? 4 : 3/);
  assert.match(recommendJs, /paginaDescoberta \+= origem === 'novas' \? 4 : 3/);
});

test('Descobrir guarda buscas pesadas em memória para responder mais rápido', () => {
  assert.match(discoveryJs, /criarCacheRodadasDescoberta/);
  assert.match(discoveryJs, /temPronta/);
  assert.match(discoveryJs, /preparar/);
  assert.match(tmdbJs, /detalhesCache/);
  assert.match(tmdbJs, /relacionadosCache/);
});
