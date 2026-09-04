import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const catalogHtml = await readFile(new URL('../pages/catalog.html', import.meta.url), 'utf8');
const catalogJs = await readFile(new URL('../js/pages/catalog.js', import.meta.url), 'utf8');

test('o catálogo usa uma única caixa de busca', () => {
  const buscas = catalogHtml.match(/type="search"/g) || [];
  assert.equal(buscas.length, 1);
  assert.doesNotMatch(catalogHtml, /open-add-view|catalog-add-search/);
});

test('um título novo oferece os caminhos assistido e para assistir', () => {
  assert.match(catalogHtml, /id="catalog-mark-watched"/);
  assert.match(catalogHtml, /id="catalog-add-watchlist"/);
  assert.match(catalogHtml, /Sua avaliação/);
  assert.match(catalogHtml, /Nota \(0 a 10\)/);
});

test('a busca externa não repete títulos existentes', () => {
  assert.match(catalogJs, /filter\(resultado => !encontrarTituloExistente\(resultado\)\)/);
  assert.match(catalogJs, /encontrarTituloExistente/);
});

test('a busca informa quando o título está na outra seção', () => {
  assert.match(catalogJs, /secaoCatalogo === 'assistidos'/);
  assert.match(catalogJs, /secaoCatalogo === 'para_assistir'/);
  assert.match(catalogJs, /está em “\$\{rotuloSecaoAlternativa\}”/);
  assert.match(catalogJs, /Abrir em \$\{rotuloSecaoAlternativa\}/);
  assert.match(catalogJs, /abrirSecaoComBusca/);
});

test('os filtros visíveis não repetem as mesmas faixas de nota', () => {
  assert.doesNotMatch(catalogHtml, /value="assistiriamos"/);
  assert.doesNotMatch(catalogHtml, /value="nao_assistiriamos"/);
  assert.doesNotMatch(catalogHtml, /value="maior_igual_7"/);
  assert.doesNotMatch(catalogHtml, /value="menor_7"/);
  assert.match(catalogHtml, /value="pendentes"/);
  assert.match(catalogHtml, /value="abaixo_7"/);
});
