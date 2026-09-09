import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const homeHtml = await readFile(new URL('../pages/home.html', import.meta.url), 'utf8');
const homeJs = await readFile(new URL('../js/pages/home.js', import.meta.url), 'utf8');
const discoveryJs = await readFile(new URL('../js/discovery.js', import.meta.url), 'utf8');
const componentsCss = await readFile(new URL('../css/components.css', import.meta.url), 'utf8');
const themeBootJs = await readFile(new URL('../js/themeBoot.js', import.meta.url), 'utf8');

test('a Home usa uma tela limpa enquanto prepara os dados iniciais', () => {
  assert.match(homeHtml, /<body class="theme-cinema app-loading" data-page="home">/);
  assert.match(homeHtml, /themeBoot\.js\?v=20260909\.4/);
  assert.match(homeHtml, /id="app-startup"/);
  assert.match(homeJs, /concluirCarregamentoInicial/);
  assert.match(homeJs, /void renderDescobertasPessoais/);
  assert.match(componentsCss, /\.app-loading > \.navbar/);
  assert.match(componentsCss, /\.app-loading > main/);
  assert.match(componentsCss, /\.app-startup-card/);
  assert.match(themeBootJs, /cine_diario_tema_inicial/);
  assert.match(themeBootJs, /document\.body\.classList\.add\('theme-' \+ tema\)/);
});

test('a Home mostra uma prévia de Descobrir levando ao catálogo', () => {
  assert.match(homeHtml, /id="descobrir-para-voce"/);
  assert.match(homeHtml, /href="catalog\.html\?secao=descobrir"/);
  assert.match(homeJs, /carregarDescobertasPessoais/);
  assert.match(homeJs, /criarCardDescobertaCatalogo/);
  assert.doesNotMatch(homeJs, /Sugestões seguras/);
});

test('a Home usa o bloqueio compartilhado de recomendações', () => {
  assert.match(homeJs, /bloquearRecomendacao/);
  assert.match(homeJs, /onBloquear: ocultarDescoberta/);
});

test('a Home renova Descobrir com um botão de dado', () => {
  assert.match(homeHtml, /id="home-discovery-more"/);
  assert.match(homeHtml, /aria-label="Mais recomendações"/);
  assert.match(homeHtml, />🎲<\/button>/);
  assert.match(homeJs, /renovarDescobertas/);
  assert.match(homeJs, /rodadaDescobertas \+= 1/);
  assert.match(homeJs, /criarCacheRodadasDescoberta/);
  assert.match(homeJs, /cacheDescobertas\.preparar\(rodadaDescobertas \+ 1\)/);
  assert.match(homeJs, /classList\.add\('is-loading'\)/);
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
