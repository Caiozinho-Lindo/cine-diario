import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const profileHtml = await readFile(new URL('../pages/profile.html', import.meta.url), 'utf8');
const profileJs = await readFile(new URL('../js/pages/profile.js', import.meta.url), 'utf8');
const profileCss = await readFile(new URL('../css/profile.css', import.meta.url), 'utf8');
const espacosJs = await readFile(new URL('../js/espacos.js', import.meta.url), 'utf8');
const uiJs = await readFile(new URL('../js/ui.js', import.meta.url), 'utf8');
const themeBootJs = await readFile(new URL('../js/themeBoot.js', import.meta.url), 'utf8');
const componentsCss = await readFile(new URL('../css/components.css', import.meta.url), 'utf8');
const globalCss = await readFile(new URL('../css/global.css', import.meta.url), 'utf8');

test('Seus espaços ganha destaque e ações claras no Perfil', () => {
  assert.match(profileHtml, /class="settings-card settings-card-spaces"/);
  assert.match(profileHtml, /\+ Novo espaço/);
  assert.match(profileHtml, /Entrar com código/);
  assert.match(profileJs, /Espaço atual/);
  assert.match(profileJs, /Trocar para este espaço/);
  assert.match(profileCss, /\.space-card\.active/);
});

test('cards dos espaços resumem participantes, títulos, tipo e atividade', () => {
  assert.match(profileJs, /totalTitulos/);
  assert.match(profileJs, /resumo\.membros\.length/);
  assert.match(profileJs, /tipoEspaco/);
  assert.match(profileJs, /formatarAtividade/);
  assert.match(espacosJs, /getResumosDosEspacos/);
});

test('convite usa uma única ação e oferece código e link no modal', () => {
  assert.doesNotMatch(profileHtml, /data-space-action="code"/);
  assert.match(profileHtml, /id="invite-modal"/);
  assert.match(profileHtml, /id="invite-code-value"/);
  assert.match(profileHtml, /id="invite-link-value"/);
  assert.match(profileJs, /abrirModalConvite/);
});

test('navegação principal evita a tela cheia de carregamento entre páginas', () => {
  assert.match(uiJs, /cine_diario_navegacao_interna/);
  assert.match(themeBootJs, /app-navigation/);
  assert.match(componentsCss, /app-navigation\.app-loading/);
  assert.match(globalCss, /@view-transition/);
});

test('indicador ativo percorre suavemente os links antes da troca de página', () => {
  assert.match(uiJs, /animarIndicadorNavegacao/);
  assert.match(uiJs, /nav-moving-indicator/);
  assert.match(componentsCss, /cubic-bezier\(\.22,\.8,\.3,1\)/);
  assert.match(uiJs, /prefers-reduced-motion: reduce/);
});

test('cabeçalho permanece visível durante a navegação interna', () => {
  assert.match(uiJs, /salvarSnapshotNavbar/);
  assert.match(uiJs, /cine_diario_nav_snapshot/);
  assert.match(themeBootJs, /navbar-snapshot/);
  assert.match(componentsCss, /\.navbar-snapshot/);
  assert.match(componentsCss, /min-height: 50px/);
});

test('Início, Catálogo e Perfil compartilham a mesma estrutura de página', () => {
  assert.match(profileHtml, /<main class="container settings-page">/);
  assert.match(componentsCss, /\.page-header,\s*\.catalog-page-header/);
  assert.match(componentsCss, /margin: 36px 0 24px/);
  assert.doesNotMatch(profileCss, /max-width:\s*1050px/);
});
