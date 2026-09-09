import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const homeHtml = await readFile(new URL('../pages/home.html', import.meta.url), 'utf8');
const homeJs = await readFile(new URL('../js/pages/home.js', import.meta.url), 'utf8');
const discoveryJs = await readFile(new URL('../js/discovery.js', import.meta.url), 'utf8');

test('a Home mostra uma prévia de Descobrir levando ao catálogo', () => {
  assert.match(homeHtml, /id="descobrir-para-voce"/);
  assert.match(homeHtml, /href="catalog\.html\?secao=descobrir"/);
  assert.match(homeJs, /carregarDescobertasPessoais/);
  assert.match(homeJs, /montarSecoesDescoberta/);
  assert.match(homeJs, /criarCardDescobertaCatalogo/);
});

test('o carrossel de adicionados recentemente avança a cada cinco segundos', () => {
  assert.match(homeHtml, /data-carousel-viewport/);
  assert.match(homeHtml, /data-carousel-next/);
  assert.match(homeJs, /setInterval\(\(\) => mover\(1\), 5000\)/);
});

test('a prévia de Descobrir não carrega candidatos demais', () => {
  assert.match(discoveryJs, /Math\.max\(12, Math\.min\(32, limite \* 2\)\)/);
});

test('detalhes de Descobrir abrem em pop-up sem expandir o card', () => {
  assert.match(discoveryJs, /abrirModalDescoberta/);
  assert.match(discoveryJs, /role', 'dialog'/);
  assert.doesNotMatch(discoveryJs, /detalhes\.hidden = !detalhes\.hidden/);
});
