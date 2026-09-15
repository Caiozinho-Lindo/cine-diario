import test from 'node:test';
import assert from 'node:assert/strict';
import {
  recomendarDaLista,
  misturarOrigens,
  pontuarTitulo,
  calcularSemelhancaReferencia,
  avaliarCompatibilidadeClima,
  motivosDaRecomendacao,
  motivoDaDescobertaPessoal,
  selecionarReferenciasPessoais,
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

test('mistério tem peso alto em Quero pensar', () => {
  const misterio = titulo('misterio', { generos: ['Mistério'] });
  const compatibilidade = avaliarCompatibilidadeClima(misterio, 'pensar');

  assert.equal(compatibilidade.elegivel, true);
  assert.match(compatibilidade.motivo, /mistério/i);
});

test('ficção científica de super-herói não entra automaticamente em Quero pensar', () => {
  const blockbuster = titulo('blockbuster', {
    generos: ['Ação', 'Aventura', 'Ficção científica'],
    palavras_chave: ['superhero', 'marvel', 'battle']
  });

  assert.equal(avaliarCompatibilidadeClima(blockbuster, 'pensar').elegivel, false);
});

test('ficção científica reflexiva pode entrar em Quero pensar', () => {
  const reflexivo = titulo('reflexivo', {
    generos: ['Ficção científica', 'Drama'],
    palavras_chave: ['artificial intelligence', 'consciousness', 'moral dilemma']
  });

  assert.equal(avaliarCompatibilidadeClima(reflexivo, 'pensar').elegivel, true);
});

test('Quero medo exige terror ou sinais realmente assustadores', () => {
  const terror = titulo('terror', { generos: ['Terror'] });
  const policial = titulo('policial', { generos: ['Crime', 'Thriller'] });

  assert.equal(avaliarCompatibilidadeClima(terror, 'medo').elegivel, true);
  assert.equal(avaliarCompatibilidadeClima(policial, 'medo').elegivel, false);
});

test('Quero chorar não aceita drama pesado sem sinal emocional', () => {
  const poderosoChefao = titulo('poderoso-chefao', {
    generos: ['Drama', 'Crime'],
    sinopse: 'Um patriarca de uma familia mafiosa transfere o controle do império clandestino ao filho.'
  });
  const oppenheimer = titulo('oppenheimer', {
    generos: ['Drama', 'História'],
    sinopse: 'A trajetória de um cientista no desenvolvimento de uma arma decisiva durante a guerra.'
  });
  const emocionante = titulo('emocionante', {
    generos: ['Drama'],
    sinopse: 'Uma história de perda, superação e sacrifício familiar.'
  });

  assert.equal(avaliarCompatibilidadeClima(poderosoChefao, 'chorar').elegivel, false);
  assert.equal(avaliarCompatibilidadeClima(oppenheimer, 'chorar').elegivel, false);
  assert.equal(avaliarCompatibilidadeClima(emocionante, 'chorar').elegivel, true);
});

test('Quero chorar não aceita aventura familiar ou animação leve', () => {
  const mario = titulo('super-mario-galaxy', {
    generos: ['Animação', 'Família', 'Aventura'],
    sinopse: 'Mario viaja por galáxias coloridas com amigos em uma aventura divertida para salvar o reino.'
  });
  const animacaoComovente = titulo('animacao-comovente', {
    generos: ['Animação', 'Drama', 'Família'],
    sinopse: 'Uma família enfrenta uma grande perda e encontra superação depois de um sacrifício emocionante.'
  });

  assert.equal(avaliarCompatibilidadeClima(mario, 'chorar').elegivel, false);
  assert.equal(avaliarCompatibilidadeClima(animacaoComovente, 'chorar').elegivel, true);
});

test('Romance é um clima próprio e não depende de tristeza', () => {
  const comediaRomantica = titulo('comedia-romantica', {
    generos: ['Comédia', 'Romance'],
    sinopse: 'Um casal improvável vive um relacionamento divertido depois de um encontro desastroso.'
  });
  const acaoComCasalSecundario = titulo('acao-com-casal', {
    generos: ['Ação', 'Aventura'],
    sinopse: 'Dois espiões em fuga precisam vencer uma batalha decisiva.'
  });

  assert.equal(avaliarCompatibilidadeClima(comediaRomantica, 'romance').elegivel, true);
  assert.equal(avaliarCompatibilidadeClima(comediaRomantica, 'chorar').elegivel, false);
  assert.equal(avaliarCompatibilidadeClima(acaoComCasalSecundario, 'romance').elegivel, false);
});

test('Rir exige comédia de verdade', () => {
  const animacaoAventura = titulo('animacao-aventura', {
    generos: ['Animação', 'Família', 'Aventura'],
    sinopse: 'Uma jornada colorida por mundos mágicos.'
  });
  const acaoComHumor = titulo('acao-com-humor', {
    generos: ['Ação', 'Aventura'],
    sinopse: 'Um herói usa humor para enfrentar uma missão cheia de explosões.'
  });
  const comedia = titulo('comedia-romantica', {
    generos: ['Comédia', 'Romance'],
    sinopse: 'Um casal improvável vive situações engraçadas.'
  });
  const standup = titulo('standup', {
    generos: [],
    sinopse: 'Um especial de stand-up comedy gravado ao vivo.'
  });

  assert.equal(avaliarCompatibilidadeClima(animacaoAventura, 'rir').elegivel, false);
  assert.equal(avaliarCompatibilidadeClima(acaoComHumor, 'rir').elegivel, false);
  assert.equal(avaliarCompatibilidadeClima(comedia, 'rir').elegivel, true);
  assert.equal(avaliarCompatibilidadeClima(standup, 'rir').elegivel, true);
});

test('Quero ação exige ação, aventura ou sinais claros de combate', () => {
  const dramaGuerra = titulo('drama-guerra', {
    generos: ['Drama', 'Guerra'],
    sinopse: 'Soldados enfrentam o peso emocional da guerra longe do front.'
  });
  const aventura = titulo('aventura', { generos: ['Aventura'] });
  const guerraComBatalha = titulo('guerra-com-batalha', {
    generos: ['Guerra'],
    sinopse: 'Uma batalha intensa muda o rumo da missão.'
  });

  assert.equal(avaliarCompatibilidadeClima(dramaGuerra, 'acao').elegivel, false);
  assert.equal(avaliarCompatibilidadeClima(aventura, 'acao').elegivel, true);
  assert.equal(avaliarCompatibilidadeClima(guerraComBatalha, 'acao').elegivel, true);
});

test('Quero tensão exige suspense, perigo ou investigação', () => {
  const romanceDramatico = titulo('romance-dramatico', {
    generos: ['Romance', 'Drama'],
    sinopse: 'Duas pessoas repensam uma relação antiga.'
  });
  const suspense = titulo('suspense-investigativo', {
    generos: ['Thriller', 'Mistério'],
    sinopse: 'Uma investigação revela uma conspiração perigosa.'
  });

  assert.equal(avaliarCompatibilidadeClima(romanceDramatico, 'tensao').elegivel, false);
  assert.equal(avaliarCompatibilidadeClima(suspense, 'tensao').elegivel, true);
});

test('Algo real exige documentário, história ou sinal de fatos reais', () => {
  const documentario = titulo('documentario', {
    generos: ['Documentário'],
    sinopse: 'Um retrato de acontecimentos reais.'
  });
  const ficcaoDrama = titulo('ficcao-drama', {
    generos: ['Drama'],
    sinopse: 'Uma família atravessa conflitos inventados ao longo de uma década.'
  });

  assert.equal(avaliarCompatibilidadeClima(documentario, 'real').elegivel, true);
  assert.equal(avaliarCompatibilidadeClima(ficcaoDrama, 'real').elegivel, false);
});

test('Clássico/cult privilegia obra marcante sem virar qualquer blockbuster leve', () => {
  const classico = titulo('classico', {
    generos: ['Drama', 'Crime'],
    ano: 1972,
    media_tmdb: 8.7
  });
  const aventuraLeve = titulo('aventura-leve-recente', {
    generos: ['Animação', 'Família', 'Aventura'],
    ano: new Date().getFullYear(),
    media_tmdb: 7.8
  });

  assert.equal(avaliarCompatibilidadeClima(classico, 'cult').elegivel, true);
  assert.equal(avaliarCompatibilidadeClima(aventuraLeve, 'cult').elegivel, false);
});

test('Quero medo não confunde suspense policial comum com terror', () => {
  const suspensePolicial = titulo('suspense-policial', {
    generos: ['Thriller', 'Crime', 'Mistério'],
    sinopse: 'Um detetive investiga uma conspiração dentro da polícia.'
  });
  const assassinoAssustador = titulo('assassino-assustador', {
    generos: ['Thriller', 'Crime'],
    sinopse: 'Um assassino em série aterroriza a cidade.'
  });

  assert.equal(avaliarCompatibilidadeClima(suspensePolicial, 'medo').elegivel, false);
  assert.equal(avaliarCompatibilidadeClima(assassinoAssustador, 'medo').elegivel, true);
});

test('climas não aceitam atalhos por palavra solta fora do contexto', () => {
  const casos = [
    ['rir', titulo('acao-com-humor-solto', {
      generos: ['Ação', 'Aventura'],
      sinopse: 'Um herói usa humor antes de uma batalha explosiva.'
    })],
    ['chorar', titulo('aventura-com-sacrificio', {
      generos: ['Ação', 'Aventura'],
      sinopse: 'Um sacrifício acontece no meio de uma grande perseguição.'
    })],
    ['romance', titulo('acao-com-casal-secundario', {
      generos: ['Ação', 'Aventura'],
      sinopse: 'Um casal de espiões precisa vencer uma batalha decisiva.'
    })],
    ['pensar', titulo('super-heroi-com-ideia-solta', {
      generos: ['Ação', 'Aventura'],
      sinopse: 'Um super-herói enfrenta uma inteligência artificial em uma sequência de lutas.'
    })],
    ['tensao', titulo('comedia-com-perigo-solto', {
      generos: ['Comédia', 'Família'],
      sinopse: 'Uma confusão sobre sequestro vira uma grande piada familiar.'
    })],
    ['medo', titulo('aventura-com-monstro', {
      generos: ['Aventura', 'Família'],
      sinopse: 'Um monstro atrapalhado aparece durante uma viagem divertida.'
    })],
    ['real', titulo('ficcao-com-realidade-solta', {
      generos: ['Ficção científica', 'Ação'],
      sinopse: 'Uma realidade alternativa ameaça o universo.'
    })],
    ['cult', titulo('animacao-recente-popular', {
      generos: ['Animação', 'Família', 'Aventura'],
      ano: new Date().getFullYear(),
      media_tmdb: 8.1
    })]
  ];

  casos.forEach(([clima, candidato]) => {
    assert.equal(avaliarCompatibilidadeClima(candidato, clima).elegivel, false, `${candidato.id} não deveria entrar em ${clima}`);
  });
});

test('a justificativa explica primeiro o clima escolhido', () => {
  const motivos = motivosDaRecomendacao(titulo('investigacao', {
    generos: ['Mistério'],
    usuarios_compativeis: 12
  }), { clima: 'pensar' });

  assert.match(motivos[0], /mistério/i);
});

test('Descobrir considera somente as avaliações do usuário conectado', () => {
  const historico = [
    historicoAvaliado('preferido-caio', ['Ficção científica'], { [caio]: 9, [noemy]: 2 }),
    historicoAvaliado('preferido-noemy', ['Romance'], { [caio]: 4, [noemy]: 10 })
  ].map((item, indice) => ({ ...item, tmdb_id: indice + 1 }));

  const referencias = selecionarReferenciasPessoais(historico, caio);

  assert.deepEqual(referencias.map(item => item.id), ['preferido-caio']);
});

test('Descobrir explica a sugestão sempre no singular', () => {
  const referencia = titulo('referencia-pessoal', {
    nome: 'Interestelar',
    generos: ['Ficção científica'],
    nota_pessoal: 10
  });
  const candidato = titulo('nova-descoberta', { generos: ['Ficção científica', 'Drama'] });

  assert.equal(
    motivoDaDescobertaPessoal(candidato, [referencia]),
    'Porque você gostou de ficção científica'
  );
});
