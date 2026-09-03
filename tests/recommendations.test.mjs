import test from 'node:test';
import assert from 'node:assert/strict';
import {
  recomendarDaLista,
  misturarOrigens,
  pontuarTitulo,
  calcularSemelhancaReferencia,
  motivosDaRecomendacao,
  formatarDuracao
} from '../js/recommendations.js';

const caio = 'usuario-caio';
const noemy = 'usuario-noemy';

function titulo(id, extras = {}) {
  return {
    id,
    tipo: 'filme',
    generos: ['Comédia'],
    duracao_minutos: 100,
    provedores: [{ slug: 'netflix', nome: 'Netflix' }],
    criado_em: new Date().toISOString(),
    ...extras
  };
}

function historicoAvaliado(id, generos, notas) {
  return titulo(id, {
    generos,
    avaliacoesMembros: Object.entries(notas).map(([usuario_id, nota]) => ({
      membro: { usuario_id },
      avaliacao: { nota }
    }))
  });
}

test('filtra por tipo, duração máxima e streaming', () => {
  const candidatos = [
    titulo('valido'),
    titulo('longo', { duracao_minutos: 180 }),
    titulo('outro-streaming', { provedores: [{ slug: 'max', nome: 'Max' }] }),
    titulo('serie', { tipo: 'serie' })
  ];

  const resultado = recomendarDaLista({
    candidatos,
    tipo: 'filme',
    duracaoMax: 120,
    streamings: ['netflix'],
    clima: 'rir'
  });

  assert.deepEqual(resultado.map(item => item.id), ['valido']);
});

test('não limita a duração quando esse filtro não é informado', () => {
  const resultado = recomendarDaLista({
    candidatos: [titulo('curto'), titulo('longo', { duracao_minutos: 220 })],
    tipo: 'filme',
    streamings: ['netflix'],
    clima: 'rir'
  });

  assert.deepEqual(resultado.map(item => item.id), ['curto', 'longo']);
});

test('favorece gêneros que os participantes avaliaram bem', () => {
  const historico = [historicoAvaliado('h1', ['Comédia'], { [caio]: 9, [noemy]: 8 })];
  const comedia = titulo('comedia', { generos: ['Comédia'] });
  const terror = titulo('terror', { generos: ['Terror'] });

  const resultado = recomendarDaLista({
    candidatos: [terror, comedia],
    historico,
    participantes: [caio, noemy],
    tipo: 'filme',
    duracaoMax: 120,
    streamings: ['netflix'],
    clima: 'qualquer'
  });

  assert.equal(resultado[0].id, 'comedia');
});

test('penaliza gênero associado a uma nota muito baixa', () => {
  const historico = [historicoAvaliado('h1', ['Terror'], { [caio]: 2 })];
  const terror = titulo('terror', { generos: ['Terror'] });
  const comedia = titulo('comedia', { generos: ['Comédia'] });

  assert.ok(
    pontuarTitulo(comedia, { historico, participantes: [caio], clima: 'qualquer' })
    > pontuarTitulo(terror, { historico, participantes: [caio], clima: 'qualquer' })
  );
});

test('reserva a terceira vaga para uma surpresa entre boas opções', () => {
  const candidatos = Array.from({ length: 7 }, (_, indice) => titulo(`t${indice}`, {
    generos: indice < 2 ? ['Comédia'] : ['Comédia', 'Família']
  }));
  const resultado = recomendarDaLista({
    candidatos,
    tipo: 'filme',
    duracaoMax: 120,
    streamings: ['netflix'],
    clima: 'rir',
    random: () => 0.99
  });

  assert.equal(resultado.length, 3);
  assert.ok(candidatos.some(item => item.id === resultado[2].id));
});

test('formata durações para os cartões', () => {
  assert.equal(formatarDuracao(45), '45 min');
  assert.equal(formatarDuracao(120), '2h');
  assert.equal(formatarDuracao(135), '2h15');
  assert.equal(formatarDuracao(null), 'Duração não informada');
});

test('um título de referência pesa mais que uma semelhança genérica', () => {
  const referencia = titulo('referencia', {
    tmdb_id: 10,
    generos: ['Mistério'],
    palavras_chave: ['investigação', 'crime'],
    pessoas_chave: ['pessoa:1'],
    recomendacoes_tmdb: [20]
  });
  const relacionado = titulo('relacionado', {
    tmdb_id: 20,
    generos: ['Mistério'],
    palavras_chave: ['investigação'],
    pessoas_chave: ['pessoa:1']
  });
  const distante = titulo('distante', { tmdb_id: 30, generos: ['Comédia'] });

  assert.ok(
    calcularSemelhancaReferencia(relacionado, referencia)
      > calcularSemelhancaReferencia(distante, referencia)
  );
  assert.ok(
    pontuarTitulo(relacionado, { referencia, clima: 'qualquer' })
      > pontuarTitulo(distante, { referencia, clima: 'qualquer' })
  );
});

test('Tanto faz garante ao menos uma opção de cada origem', () => {
  const lista = [titulo('lista-1', { origem_recomendacao: 'lista', pontuacaoRecomendacao: 9 })];
  const novas = [
    titulo('nova-1', { origem_recomendacao: 'nova', pontuacaoRecomendacao: 8 }),
    titulo('nova-2', { origem_recomendacao: 'nova', pontuacaoRecomendacao: 7 })
  ];
  const resultado = misturarOrigens(lista, novas, { random: () => 0 });

  assert.equal(resultado.length, 3);
  assert.ok(resultado.some(item => item.origem_recomendacao === 'lista'));
  assert.ok(resultado.some(item => item.origem_recomendacao === 'nova'));
});

test('explica quando pessoas com gosto parecido avaliaram bem', () => {
  const motivos = motivosDaRecomendacao(titulo('compatível', {
    usuarios_compativeis: 12,
    media_tmdb: 8.2
  }));

  assert.ok(motivos.includes('12 pessoas com gosto parecido deram nota 8 ou mais'));
});
