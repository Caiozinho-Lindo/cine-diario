import test from 'node:test';
import assert from 'node:assert/strict';
import { aplicarFiltros, estaPendenteParaUsuario } from '../js/filters.js';

const avaliacao = nota => ({ nota });
const titulo = (id, campos = {}) => ({
  id,
  nome: `Título ${id}`,
  quero_assistir: false,
  avaliacaoAtual: null,
  avaliacoesMembros: [],
  ...campos
});

test('considera pendente quando outra pessoa avaliou e o usuário atual ainda não', () => {
  const item = titulo('outra-avaliou', {
    avaliacoesMembros: [
      { membro: { usuario_id: 'atual' }, avaliacao: null },
      { membro: { usuario_id: 'outra' }, avaliacao: avaliacao(8) },
      { membro: { usuario_id: 'terceira' }, avaliacao: null }
    ]
  });

  assert.equal(estaPendenteParaUsuario(item), true);
});

test('não considera pendente em um espaço individual sem avaliação', () => {
  const item = titulo('individual', {
    avaliacoesMembros: [{ membro: { usuario_id: 'atual' }, avaliacao: null }]
  });

  assert.equal(estaPendenteParaUsuario(item), false);
});

test('não considera pendente quando ninguém avaliou', () => {
  const item = titulo('ninguem-avaliou', {
    avaliacoesMembros: [
      { membro: { usuario_id: 'atual' }, avaliacao: null },
      { membro: { usuario_id: 'outra' }, avaliacao: null }
    ]
  });

  assert.equal(estaPendenteParaUsuario(item), false);
});

test('não considera pendente quando o usuário atual já avaliou', () => {
  const item = titulo('atual-avaliou', {
    avaliacaoAtual: avaliacao(9),
    avaliacoesMembros: [
      { membro: { usuario_id: 'atual' }, avaliacao: avaliacao(9) },
      { membro: { usuario_id: 'outra' }, avaliacao: null }
    ]
  });

  assert.equal(estaPendenteParaUsuario(item), false);
});

test('não mistura títulos da lista Para assistir com avaliações pendentes', () => {
  const item = titulo('lista', {
    quero_assistir: true,
    avaliacoesMembros: [{ membro: { usuario_id: 'outra' }, avaliacao: avaliacao(7) }]
  });

  assert.equal(estaPendenteParaUsuario(item), false);
});

test('o filtro retorna somente pendências do usuário atual', () => {
  const pendente = titulo('pendente', {
    avaliacoesMembros: [{ membro: { usuario_id: 'outra' }, avaliacao: avaliacao(8) }]
  });
  const semAvaliacao = titulo('sem-avaliacao');
  const jaAvaliado = titulo('ja-avaliado', { avaliacaoAtual: avaliacao(9) });
  const paraAssistir = titulo('para-assistir', { quero_assistir: true });

  const resultado = aplicarFiltros(
    [pendente, semAvaliacao, jaAvaliado, paraAssistir],
    { avaliacao: 'pendentes' },
    'geral'
  );

  assert.deepEqual(resultado.map(item => item.id), ['pendente']);
});

test('o filtro de recomendação acompanha a pessoa selecionada', () => {
  const item = titulo('opiniao-diferente', {
    media: 6,
    pendente: false,
    avaliacoesMembros: [
      { membro: { usuario_id: 'atual' }, avaliacao: avaliacao(9) },
      { membro: { usuario_id: 'outra' }, avaliacao: avaliacao(3) }
    ]
  });

  assert.deepEqual(
    aplicarFiltros([item], { avaliacao: 'assistiriamos' }, 'membro:atual').map(t => t.id),
    ['opiniao-diferente']
  );
  assert.deepEqual(
    aplicarFiltros([item], { avaliacao: 'assistiriamos' }, 'geral').map(t => t.id),
    []
  );
});
