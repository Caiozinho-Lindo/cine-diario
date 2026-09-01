import test from 'node:test';
import assert from 'node:assert/strict';
import { calcularDestaques } from '../js/statistics.js';

const usuario1 = 'usuario-1';
const usuario2 = 'usuario-2';

function titulo(id, { tipo = 'filme', notas, datas, criadoEm = '2026-01-01' }) {
  const avaliacoesMembros = Object.entries(notas).map(([usuario_id, nota]) => ({
    membro: {
      usuario_id,
      perfil: { nome_exibicao: usuario_id === usuario1 ? 'Pessoa 1' : 'Pessoa 2' }
    },
    avaliacao: { nota, data_avaliacao: datas[usuario_id] }
  }));
  const valores = Object.values(notas).map(Number);
  return {
    id,
    tipo,
    quero_assistir: false,
    pendente: false,
    criado_em: criadoEm,
    avaliacoesMembros,
    media: valores.reduce((soma, nota) => soma + nota, 0) / valores.length,
    diferenca: valores.length > 1 ? Math.max(...valores) - Math.min(...valores) : null
  };
}

test('em empate de melhor filme, mostra somente o avaliado mais recentemente', () => {
  const antigo = titulo('antigo', {
    notas: { [usuario1]: 10, [usuario2]: 10 },
    datas: { [usuario1]: '2026-01-10', [usuario2]: '2026-01-10' }
  });
  const recente = titulo('recente', {
    notas: { [usuario1]: 10, [usuario2]: 10 },
    datas: { [usuario1]: '2026-02-12', [usuario2]: '2026-02-12' }
  });

  assert.deepEqual(calcularDestaques([antigo, recente]).melhorFilme.map(item => item.id), ['recente']);
});

test('cada pessoa tem apenas sua avaliação máxima mais recente', () => {
  const primeiro = titulo('primeiro', {
    notas: { [usuario1]: 10, [usuario2]: 7 },
    datas: { [usuario1]: '2026-03-01', [usuario2]: '2026-03-01' }
  });
  const ultimo = titulo('ultimo', {
    notas: { [usuario1]: 10, [usuario2]: 8 },
    datas: { [usuario1]: '2026-04-01', [usuario2]: '2026-04-01' }
  });

  const destaques = calcularDestaques([primeiro, ultimo]);
  const destaqueUsuario1 = destaques.melhoresPorMembro
    .find(item => item.membro.usuario_id === usuario1);

  assert.deepEqual(destaqueUsuario1.titulos.map(item => item.id), ['ultimo']);
});

test('empate de maior discordância também gera um único destaque', () => {
  const antigo = titulo('discordancia-antiga', {
    notas: { [usuario1]: 10, [usuario2]: 5 },
    datas: { [usuario1]: '2026-05-01', [usuario2]: '2026-05-01' }
  });
  const recente = titulo('discordancia-recente', {
    notas: { [usuario1]: 9, [usuario2]: 4 },
    datas: { [usuario1]: '2026-06-01', [usuario2]: '2026-06-01' }
  });

  assert.deepEqual(calcularDestaques([antigo, recente]).maiorDiscordancia.map(item => item.id), ['discordancia-recente']);
});
