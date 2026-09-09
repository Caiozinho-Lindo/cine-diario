import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const recommendJs = await readFile(new URL('../js/pages/recommend.js', import.meta.url), 'utf8');
const recommendCss = await readFile(new URL('../css/recommend.css', import.meta.url), 'utf8');
const sessoesJs = await readFile(new URL('../js/sessoes.js', import.meta.url), 'utf8');
const discoveryJs = await readFile(new URL('../js/discovery.js', import.meta.url), 'utf8');
const blocksJs = await readFile(new URL('../js/recommendationBlocks.js', import.meta.url), 'utf8');
const blockMigration = await readFile(new URL('../supabase/migrations/010_recomendacoes_bloqueadas.sql', import.meta.url), 'utf8');

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
