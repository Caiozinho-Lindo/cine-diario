import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const recommendJs = await readFile(new URL('../js/pages/recommend.js', import.meta.url), 'utf8');
const recommendCss = await readFile(new URL('../css/recommend.css', import.meta.url), 'utf8');
const sessoesJs = await readFile(new URL('../js/sessoes.js', import.meta.url), 'utf8');

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
