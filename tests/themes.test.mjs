import test from 'node:test';
import assert from 'node:assert/strict';

const memoria = new Map();
globalThis.sessionStorage = {
  getItem(chave) { return memoria.get(chave) ?? null; },
  setItem(chave, valor) { memoria.set(chave, String(valor)); },
  removeItem(chave) { memoria.delete(chave); }
};

const {
  modoDoMembro,
  usuarioDoModo,
  normalizarModoAtivo,
  notaNoModo,
  nomeDoModo
} = await import('../js/themes.js');

const membros = [
  { usuario_id: 'usuario-a', perfil: { nome_exibicao: 'Ana' } },
  { usuario_id: 'usuario-b', perfil: { nome_exibicao: 'Bruno' } },
  { usuario_id: 'usuario-c', perfil: { nome_exibicao: 'Carla' } }
];

test('cria e interpreta o modo de qualquer membro pelo UUID', () => {
  assert.equal(modoDoMembro('usuario-c'), 'membro:usuario-c');
  assert.equal(usuarioDoModo('membro:usuario-c'), 'usuario-c');
});

test('usa visão geral quando o espaço tem várias pessoas', () => {
  memoria.clear();
  assert.equal(normalizarModoAtivo(membros, 'usuario-a'), 'geral');
});

test('usa automaticamente o diário da única pessoa em espaço individual', () => {
  memoria.clear();
  assert.equal(normalizarModoAtivo([membros[0]], 'usuario-a'), 'membro:usuario-a');
});

test('obtém a nota da pessoa escolhida sem depender de nomes fixos', () => {
  const titulo = {
    avaliacoesMembros: membros.map((membro, indice) => ({
      membro,
      avaliacao: indice === 2 ? { nota: 8.5 } : null
    }))
  };
  assert.equal(notaNoModo(titulo, 'membro:usuario-c'), 8.5);
  assert.equal(notaNoModo(titulo, 'membro:usuario-b'), null);
});

test('identifica o próprio diário e exibe o nome dos demais membros', () => {
  assert.equal(nomeDoModo('membro:usuario-a', membros, 'usuario-a'), 'Meu diário');
  assert.equal(nomeDoModo('membro:usuario-c', membros, 'usuario-a'), 'Carla');
});
