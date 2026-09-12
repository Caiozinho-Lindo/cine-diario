import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const editHtml = await readFile(new URL('../pages/edit.html', import.meta.url), 'utf8');
const editJs = await readFile(new URL('../js/pages/edit.js', import.meta.url), 'utf8');
const componentsCss = await readFile(new URL('../css/components.css', import.meta.url), 'utf8');

test('a tela de avaliação tem auxiliar de nota abaixo da data assistida', () => {
  assert.match(editHtml, /id="f-data-assistido"/);
  assert.match(editHtml, /id="rating-helper-btn"/);
  assert.ok(editHtml.indexOf('id="f-data-assistido"') < editHtml.indexOf('id="rating-helper-btn"'));
});

test('a data da avaliação é automática e não aparece como campo editável', () => {
  assert.doesNotMatch(editHtml, /f-data-avaliacao/);
  assert.doesNotMatch(editHtml, /Data da sua avaliação/);
  assert.match(editJs, /dataAvaliacao:\s*new Date\(\)\.toISOString\(\)\.slice\(0,\s*10\)/);
});

test('o auxiliar usa perguntas humanas sem mostrar pesos na interface', () => {
  assert.match(editJs, /Você assistiria novamente\?/);
  assert.match(editJs, /Você recomendaria para alguém\?/);
  assert.match(editJs, /Como você ficou depois que acabou\?/);
  assert.match(editJs, /O filme entregou o que prometia\?/);
  assert.match(editJs, /Teve algo memorável\?/);
  assert.match(editJs, /Nota sugerida:/);
  assert.doesNotMatch(editJs, />\s*10\s*</);
  assert.doesNotMatch(editJs, />\s*7\s*</);
  assert.doesNotMatch(editJs, />\s*5\s*</);
});

test('o auxiliar avança ao escolher uma resposta e mantém voltar discreto', () => {
  assert.doesNotMatch(editJs, /data-next-rating-helper/);
  assert.doesNotMatch(editJs, />\s*Continuar\s*</);
  assert.doesNotMatch(editJs, /Ver nota sugerida/);
  assert.match(editJs, /etapa \+= 1;\s*render\(\);/);
  assert.match(componentsCss, /\.rating-helper-back/);
  assert.match(componentsCss, /background:\s*transparent/);
});

test('o campo de observação não pode ser redimensionado manualmente', () => {
  assert.match(componentsCss, /\.person-form-block textarea\s*\{\s*resize:\s*none;/);
});
