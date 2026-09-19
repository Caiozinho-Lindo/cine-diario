import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const catalogHtml = await readFile(new URL('../pages/catalog.html', import.meta.url), 'utf8');
const catalogJs = await readFile(new URL('../js/pages/catalog.js', import.meta.url), 'utf8');
const discoveryJs = await readFile(new URL('../js/discovery.js', import.meta.url), 'utf8');
const titulosJs = await readFile(new URL('../js/titulos.js', import.meta.url), 'utf8');
const uiJs = await readFile(new URL('../js/ui.js', import.meta.url), 'utf8');

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

test('quando há resultado fora do catálogo, o aviso vira um atalho compacto', () => {
  assert.match(catalogJs, /buscaExternaResumo/);
  assert.match(catalogJs, /catalog-empty-action-compact/);
  assert.match(catalogJs, /view-external-results/);
  assert.match(catalogJs, /rolarParaResultadosExternos/);
  assert.match(catalogJs, /renderResultados\(\)/);
});

test('os filtros visíveis não repetem as mesmas faixas de nota', () => {
  assert.doesNotMatch(catalogHtml, /value="assistiriamos"/);
  assert.doesNotMatch(catalogHtml, /value="nao_assistiriamos"/);
  assert.doesNotMatch(catalogHtml, /value="maior_igual_7"/);
  assert.doesNotMatch(catalogHtml, /value="menor_7"/);
  assert.match(catalogHtml, /value="pendentes"/);
  assert.match(catalogHtml, /value="abaixo_7"/);
});

test('o catálogo tem uma aba Descobrir baseada no perfil pessoal', () => {
  assert.match(catalogHtml, /data-catalog-section="descobrir"/);
  assert.match(catalogHtml, /id="catalog-personal-discovery"/);
  assert.match(catalogJs, /secaoCatalogo === 'descobrir'/);
  assert.match(catalogJs, /getMeusStreamings/);
});

test('o Descobrir do catálogo agrupa sugestões por filme de referência', () => {
  assert.match(catalogJs, /montarSecoesDescoberta/);
  assert.match(discoveryJs, /Sugestões para você/);
  assert.doesNotMatch(discoveryJs, /Sugestões relacionadas a:/);
  assert.match(catalogJs, /discovery-reason-group/);
  assert.match(catalogJs, /criarCardDescobertaCatalogo/);
});

test('o Descobrir do catálogo usa o mesmo bloqueio da Home', () => {
  assert.match(catalogJs, /bloquearRecomendacao/);
  assert.match(catalogJs, /onBloquear: ocultarDescobertaCatalogo/);
  assert.match(discoveryJs, /filtrarRecomendacoesBloqueadas/);
});

test('o Descobrir do catálogo tem mais recomendações com dado', () => {
  assert.match(catalogHtml, /id="catalog-discovery-more"/);
  assert.match(catalogHtml, /aria-label="Mais recomendações"/);
  assert.match(catalogHtml, />🎲<\/button>/);
  assert.match(catalogJs, /renovarDescobertasCatalogo/);
  assert.match(catalogJs, /rodadaDescobertasCatalogo \+= 1/);
  assert.match(catalogJs, /criarCacheRodadasDescoberta/);
  assert.match(catalogJs, /cacheDescobertasCatalogo\.preparar\(rodadaDescobertasCatalogo \+ 1\)/);
  assert.match(discoveryJs, /page: paginaRelacionada\(rodada\)/);
});

test('o catálogo abre com cache leve e atualiza pelo Supabase em segundo plano', () => {
  assert.match(catalogJs, /getTitulosCacheSnapshot/);
  assert.match(catalogJs, /aplicarTitulosNoCatalogo\(cacheTitulos\)/);
  assert.match(catalogJs, /atualizarCatalogoEmSegundoPlano/);
  assert.match(catalogJs, /contexto: contextoTitulos/);
  assert.match(catalogJs, /showCardSkeletons\(grid, 8\)/);
});

test('ações que mudam títulos limpam o cache local', () => {
  assert.match(titulosJs, /CACHE_PREFIXO_TITULOS/);
  assert.match(titulosJs, /salvarTitulosCacheSnapshot/);
  assert.match(titulosJs, /invalidarCacheTitulos/);
  assert.match(titulosJs, /removerCachePorPrefixo\(CACHE_PREFIXO_TITULOS\)/);
});

test('a navegação principal prepara páginas vizinhas sem mudar o fluxo', () => {
  assert.match(uiJs, /prepararNavegacaoLeve/);
  assert.match(uiJs, /prefetch\.rel = 'prefetch'/);
  assert.match(uiJs, /requestIdleCallback/);
});
