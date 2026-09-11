import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  CINE_TASTE_QUESTIONS,
  contarAvaliacoesDoUsuario,
  deveAbrirMontagemInicial,
  generosPreferidosTmdb,
  montarPayloadCineDiario,
  pontuarPreferenciasDescoberta,
  preferenciasTemRespostas,
  resumoCineDiarioMontado,
  temCineDiarioMontado
} from '../js/cineTaste.js';
import { pontuarTitulo } from '../js/recommendations.js';

const migration = await readFile(new URL('../supabase/migrations/011_montar_cine_diario.sql', import.meta.url), 'utf8');
const profileHtml = await readFile(new URL('../pages/profile.html', import.meta.url), 'utf8');
const profileJs = await readFile(new URL('../js/pages/profile.js', import.meta.url), 'utf8');
const homeJs = await readFile(new URL('../js/pages/home.js', import.meta.url), 'utf8');
const catalogJs = await readFile(new URL('../js/pages/catalog.js', import.meta.url), 'utf8');

function titulo(id, extras = {}) {
  return {
    id,
    tipo: 'filme',
    generos: ['Drama'],
    sinopse: '',
    avaliacoesMembros: [],
    ...extras
  };
}

test('Montar meu Cine Diário tem perguntas curtas e clicáveis', () => {
  assert.equal(CINE_TASTE_QUESTIONS.length, 5);
  assert.ok(CINE_TASTE_QUESTIONS.every(pergunta => pergunta.multipla));
  assert.ok(CINE_TASTE_QUESTIONS.find(pergunta => pergunta.id === 'interesses').opcoes.some(([valor]) => valor === 'documentario'));
  assert.ok(CINE_TASTE_QUESTIONS.find(pergunta => pergunta.id === 'climas').opcoes.some(([valor]) => valor === 'pensar'));
  assert.ok(CINE_TASTE_QUESTIONS.find(pergunta => pergunta.id === 'evita').opcoes.some(([valor]) => valor === 'terror_pesado'));
});

test('usuário novo abre montagem inicial apenas quando não tem respostas nem avaliações', () => {
  const usuarioId = 'usuario-novo';
  assert.equal(deveAbrirMontagemInicial({}, [], usuarioId), true);
  assert.equal(deveAbrirMontagemInicial(
    {},
    [titulo('avaliado', { avaliacoesMembros: [{ membro: { usuario_id: usuarioId }, avaliacao: { nota: 8 } }] })],
    usuarioId
  ), false);
  assert.equal(temCineDiarioMontado({ preferencias_descoberta: { interesses: ['acao'] } }), true);
});

test('preferências vazias não contam como Cine Diário montado', () => {
  assert.equal(preferenciasTemRespostas({}), false);
  assert.equal(temCineDiarioMontado({ preferencias_descoberta: {} }), false);
  assert.equal(resumoCineDiarioMontado({}), 'Ainda não respondido');
});

test('o gosto inicial favorece interesses e respeita evitações', () => {
  const preferencias = { interesses: ['comedia'], evita: ['terror_pesado'], estilos: ['leves'] };
  const comedia = titulo('comedia', { generos: ['Comédia', 'Família'] });
  const terror = titulo('terror', { generos: ['Terror'] });

  assert.ok(pontuarPreferenciasDescoberta(comedia, preferencias) > 0);
  assert.ok(pontuarPreferenciasDescoberta(terror, preferencias) < 0);
  assert.ok(
    pontuarTitulo(comedia, { participantes: ['u1'], preferenciasDescoberta: preferencias })
    > pontuarTitulo(terror, { participantes: ['u1'], preferenciasDescoberta: preferencias })
  );
});

test('o peso das perguntas diminui quando existem avaliações reais', () => {
  const preferencias = { interesses: ['comedia'] };
  const candidato = titulo('comedia', { generos: ['Comédia'] });
  const historico = Array.from({ length: 21 }, (_, indice) => titulo(`h${indice}`, {
    avaliacoesMembros: [{ membro: { usuario_id: 'u1' }, avaliacao: { nota: 8 } }]
  }));

  assert.ok(
    pontuarTitulo(candidato, { participantes: ['u1'], preferenciasDescoberta: preferencias })
    > pontuarTitulo(candidato, { historico, participantes: ['u1'], preferenciasDescoberta: preferencias })
  );
});

test('preferências geram gêneros de busca no TMDB e payload de perfil', () => {
  assert.deepEqual(generosPreferidosTmdb({ interesses: ['acao', 'documentario'] }, 'filme'), [28, 99]);
  const payload = montarPayloadCineDiario({ interesses: ['acao'], streamings: ['netflix'] });
  assert.equal(payload.preferencias_descoberta.versao, 1);
  assert.equal(payload.preferencias_descoberta.interesses[0], 'acao');
  assert.ok(payload.onboarding_cine_diario_concluido_em);
});

test('a tela de perfil permite responder novamente', () => {
  assert.match(profileHtml, /Montar meu Cine Diário/);
  assert.match(profileHtml, /id="open-cine-taste"/);
  assert.match(profileJs, /abrirMontarCineDiario/);
  assert.match(profileJs, /resumoCineDiarioMontado/);
});

test('Home e Descobrir oferecem a montagem sem duplicar', () => {
  assert.match(homeJs, /talvezAbrirMontagemInicial/);
  assert.match(homeJs, /montagemInicialAberta/);
  assert.match(catalogJs, /oferecerMontagemNoDescobrir/);
  assert.match(catalogJs, /montagemDescobrirOferecida/);
});

test('a migração salva preferências de descoberta no perfil', () => {
  assert.match(migration, /add column if not exists preferencias_descoberta jsonb/);
  assert.match(migration, /add column if not exists onboarding_cine_diario_concluido_em timestamptz/);
});
