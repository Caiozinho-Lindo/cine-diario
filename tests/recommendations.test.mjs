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
  formatarDuracao,
  temQualidadeMinimaTmdb
} from '../js/recommendations.js';

test('sugestões externas exigem qualidade proporcional ao volume de votos', () => {
  assert.equal(temQualidadeMinimaTmdb({ media_tmdb: 4.2, votos_tmdb: 8 }), false);
  assert.equal(temQualidadeMinimaTmdb({ media_tmdb: 7.8, votos_tmdb: 19 }), false);
  assert.equal(temQualidadeMinimaTmdb({ media_tmdb: 6.4, votos_tmdb: 40 }), false);
  assert.equal(temQualidadeMinimaTmdb({ media_tmdb: 6.5, votos_tmdb: 40 }), true);
  assert.equal(temQualidadeMinimaTmdb({ media_tmdb: 6.1, votos_tmdb: 150 }), false);
  assert.equal(temQualidadeMinimaTmdb({ media_tmdb: 6.2, votos_tmdb: 150 }), true);
  assert.equal(temQualidadeMinimaTmdb({ media_tmdb: 5.9, votos_tmdb: 1000 }), false);
  assert.equal(temQualidadeMinimaTmdb({ media_tmdb: 6, votos_tmdb: 1000 }), true);
  assert.equal(temQualidadeMinimaTmdb({ media_tmdb: null, votos_tmdb: 0 }), false);
  assert.equal(temQualidadeMinimaTmdb({ media_tmdb: 8 }), false);
});

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

test('varia as três escolhas entre as opções mais bem colocadas', () => {
  const candidatos = Array.from({ length: 7 }, (_, indice) => titulo(`t${indice}`, {
    generos: indice < 2 ? ['Comédia'] : ['Comédia', 'Família']
  }));
  const primeira = recomendarDaLista({
    candidatos,
    tipo: 'filme',
    duracaoMax: 120,
    streamings: ['netflix'],
    clima: 'rir',
    random: () => 0
  });
  const segunda = recomendarDaLista({
    candidatos,
    tipo: 'filme',
    duracaoMax: 120,
    streamings: ['netflix'],
    clima: 'rir',
    random: () => 0.99
  });

  assert.equal(primeira.length, 3);
  assert.equal(segunda.length, 3);
  assert.notDeepEqual(primeira.map(item => item.id), segunda.map(item => item.id));
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
  const misterio = titulo('misterio', {
    generos: ['Mistério', 'Drama'],
    palavras_chave: ['investigation']
  });
  const compatibilidade = avaliarCompatibilidadeClima(misterio, 'pensar');

  assert.equal(compatibilidade.elegivel, true);
  assert.match(compatibilidade.motivo, /mistério/i);
});

test('Pensar rejeita mistério ou ação sem reflexão suficiente', () => {
  assert.equal(avaliarCompatibilidadeClima(titulo('misterio-generico', {
    generos: ['Mistério', 'Crime', 'Thriller']
  }), 'pensar').elegivel, false);
  assert.equal(avaliarCompatibilidadeClima(titulo('acao-com-memoria', {
    generos: ['Ação', 'Mistério', 'Ficção científica'],
    palavras_chave: ['memory', 'identity']
  }), 'pensar').elegivel, false);
});

test('Romance rejeita relações abusivas ou tóxicas', () => {
  for (const tema of ['domestic violence', 'abusive relationship', 'toxic love', 'marital conflict', 'infidelity', 'black comedy', 'bad boy', 'stepbrother']) {
    assert.equal(avaliarCompatibilidadeClima(titulo(`romance-${tema}`, {
      generos: ['Drama', 'Romance'],
      palavras_chave: [tema]
    }), 'romance').elegivel, false);
  }
});

test('Romance rejeita thriller mesmo quando também é romântico', () => {
  assert.equal(avaliarCompatibilidadeClima(titulo('romance-thriller', {
    generos: ['Drama', 'Romance', 'Thriller']
  }), 'romance').elegivel, false);
});

test('Chorar rejeita musical romântico sem sinal emocional forte', () => {
  assert.equal(avaliarCompatibilidadeClima(titulo('danca-romantica', {
    generos: ['Drama', 'Música', 'Romance'],
    palavras_chave: ['dance', 'summer romance']
  }), 'chorar').elegivel, false);
});

test('Chorar rejeita romance tóxico mesmo quando também é drama', () => {
  assert.equal(avaliarCompatibilidadeClima(titulo('drama-toxico', {
    generos: ['Drama', 'Romance'],
    palavras_chave: ['dysfunctional relationship', 'marital conflict']
  }), 'chorar').elegivel, false);
});

test('Pensar rejeita documentário de entretenimento sem tema reflexivo', () => {
  assert.equal(avaliarCompatibilidadeClima(titulo('comedia-documental', {
    generos: ['Documentário', 'Comédia', 'Ação']
  }), 'pensar').elegivel, false);
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

test('Rir não aceita comédia de terror como O Macaco', () => {
  const oMacaco = titulo('o-macaco', {
    nome: 'O Macaco',
    generos: ['Comédia', 'Terror'],
    sinopse: 'Um brinquedo sinistro provoca mortes terríveis ao redor de dois irmãos.',
    palavras_chave: ['dark comedy', 'cursed toy']
  });

  assert.equal(avaliarCompatibilidadeClima(oMacaco, 'rir').elegivel, false);
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

test('Quero chorar rejeita crime e ação com apenas morte ou sacrifício', () => {
  const poderosoChefao = titulo('poderoso-chefao', {
    generos: ['Drama', 'Crime'],
    sinopse: 'Uma família mafiosa enfrenta morte, tragédia e sacrifício pelo poder.'
  });
  const batmanBegins = titulo('batman-begins', {
    generos: ['Drama', 'Ação', 'Crime'],
    sinopse: 'Após uma tragédia, um herói combate criminosos e se sacrifica pela cidade.'
  });

  assert.equal(avaliarCompatibilidadeClima(poderosoChefao, 'chorar').elegivel, false);
  assert.equal(avaliarCompatibilidadeClima(batmanBegins, 'chorar').elegivel, false);
});

test('Quero chorar reconhece descrições emocionais sem depender de morte', () => {
  const despedida = titulo('despedida', {
    generos: ['Drama'],
    sinopse: 'Uma despedida emocionante acompanha uma família durante o luto.'
  });
  const superacao = titulo('superacao', {
    generos: ['Drama'],
    palavras_chave: ['emotional', 'mourning']
  });

  assert.equal(avaliarCompatibilidadeClima(despedida, 'chorar').elegivel, true);
  assert.equal(avaliarCompatibilidadeClima(superacao, 'chorar').elegivel, true);
});

test('Quero chorar aceita combinações naturalmente emocionais mesmo sem palavra-chave', () => {
  const dramaFamiliar = titulo('drama-familiar', { generos: ['Drama', 'Família'] });
  const animacaoDramatica = titulo('animacao-dramatica', { generos: ['Drama', 'Animação'] });

  assert.equal(avaliarCompatibilidadeClima(dramaFamiliar, 'chorar').elegivel, true);
  assert.equal(avaliarCompatibilidadeClima(animacaoDramatica, 'chorar').elegivel, true);
});

test('Quero chorar rejeita romance erótico e musical sem emoção', () => {
  const cinquentaTons = titulo('cinquenta-tons', {
    nome: 'Cinquenta Tons de Cinza',
    generos: ['Drama', 'Romance'],
    palavras_chave: ['bdsm', 'eroticism', 'sexual relationship']
  });
  const dias365 = titulo('365-dias-hoje', {
    nome: '365 Dias: Hoje',
    generos: ['Drama', 'Romance'],
    sinopse: 'Um relacionamento marcado por sedução e erotismo.'
  });
  const michael = titulo('michael', {
    nome: 'Michael',
    generos: ['Drama', 'Música'],
    palavras_chave: ['biography', 'singer', 'music']
  });

  assert.equal(avaliarCompatibilidadeClima(cinquentaTons, 'chorar').elegivel, false);
  assert.equal(avaliarCompatibilidadeClima(dias365, 'chorar').elegivel, false);
  assert.equal(avaliarCompatibilidadeClima(michael, 'chorar').elegivel, false);
});

test('Quero chorar não confunde perdão, abuso emocional ou luto de terror com emoção', () => {
  const after = titulo('after', {
    generos: ['Drama', 'Romance'],
    sinopse: 'O casal enfrenta ciúme, ódio e perdão.'
  });
  const whiplash = titulo('whiplash', {
    generos: ['Drama', 'Música', 'Thriller'],
    palavras_chave: ['emotional abuse', 'public humiliation']
  });
  const midsommar = titulo('midsommar', {
    generos: ['Terror', 'Drama', 'Mistério'],
    sinopse: 'Uma jovem em luto visita um festival sinistro.',
    palavras_chave: ['loss of loved one', 'grieving']
  });

  assert.equal(avaliarCompatibilidadeClima(after, 'chorar').elegivel, false);
  assert.equal(avaliarCompatibilidadeClima(whiplash, 'chorar').elegivel, false);
  assert.equal(avaliarCompatibilidadeClima(midsommar, 'chorar').elegivel, false);
});

test('Quero chorar rejeita faroeste, fantasia sombria e guerra de ficção com perda isolada', () => {
  const faroeste = titulo('era-uma-vez-oeste', {
    generos: ['Drama', 'Faroeste'],
    palavras_chave: ['loss of loved one']
  });
  const donnie = titulo('donnie-darko', {
    generos: ['Fantasia', 'Drama', 'Mistério'],
    palavras_chave: ['loss']
  });
  const planeta = titulo('planeta-macacos-guerra', {
    generos: ['Drama', 'Ficção científica', 'Guerra'],
    palavras_chave: ['loss of family', 'death']
  });

  assert.equal(avaliarCompatibilidadeClima(faroeste, 'chorar').elegivel, false);
  assert.equal(avaliarCompatibilidadeClima(donnie, 'chorar').elegivel, false);
  assert.equal(avaliarCompatibilidadeClima(planeta, 'chorar').elegivel, false);
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

test('Tensão não aceita crime ou ação isolados', () => {
  const umSonhoDeLiberdade = titulo('um-sonho-de-liberdade', {
    generos: ['Drama', 'Crime'],
    sinopse: 'Um homem condenado enfrenta décadas dentro de uma prisão.'
  });
  const madMax = titulo('mad-max', {
    generos: ['Ação', 'Aventura', 'Ficção científica']
  });

  assert.equal(avaliarCompatibilidadeClima(umSonhoDeLiberdade, 'tensao').elegivel, false);
  assert.equal(avaliarCompatibilidadeClima(madMax, 'tensao').elegivel, false);
});

test('Tensão aceita ação ou crime quando há perigo concreto', () => {
  const perseguicao = titulo('perseguicao', {
    generos: ['Ação', 'Crime'],
    sinopse: 'Uma perseguição coloca os reféns em perigo durante uma fuga.'
  });
  const investigacao = titulo('investigacao', {
    generos: ['Crime', 'Mistério'],
    sinopse: 'Uma investigação procura um assassino em série.'
  });

  assert.equal(avaliarCompatibilidadeClima(perseguicao, 'tensao').elegivel, true);
  assert.equal(avaliarCompatibilidadeClima(investigacao, 'tensao').elegivel, true);
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

test('Algo real não aceita o gênero História sozinho', () => {
  const oPatriota = titulo('o-patriota', {
    generos: ['História', 'Guerra', 'Ação', 'Drama'],
    sinopse: 'Um personagem fictício busca vingança durante uma guerra.',
    palavras_chave: ['historical fiction']
  });
  const dramaDeEpoca = titulo('drama-de-epoca', {
    generos: ['História', 'Drama'],
    sinopse: 'Uma família inventada atravessa um período do passado.'
  });

  assert.equal(avaliarCompatibilidadeClima(oPatriota, 'real').elegivel, false);
  assert.equal(avaliarCompatibilidadeClima(dramaDeEpoca, 'real').elegivel, false);
});

test('Algo real aceita biografia, fatos reais e evento histórico identificado', () => {
  const biografia = titulo('biografia', {
    generos: ['Drama', 'História'],
    palavras_chave: ['biography', 'historical figure']
  });
  const fatosReais = titulo('fatos-reais', {
    generos: ['Drama'],
    sinopse: 'Baseado em uma história real.'
  });
  const evento = titulo('nuremberg', {
    generos: ['Drama', 'História'],
    palavras_chave: ['nuremberg trials']
  });

  assert.equal(avaliarCompatibilidadeClima(biografia, 'real').elegivel, true);
  assert.equal(avaliarCompatibilidadeClima(fatosReais, 'real').elegivel, true);
  assert.equal(avaliarCompatibilidadeClima(evento, 'real').elegivel, true);
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

test('Quero medo rejeita super-heroi policial apenas por serial killer', () => {
  const theBatman = titulo('the-batman', {
    nome: 'The Batman',
    generos: ['Crime', 'Misterio', 'Thriller'],
    palavras_chave: ['serial killer', 'superhero', 'dc comics']
  });

  assert.equal(avaliarCompatibilidadeClima(theBatman, 'medo').elegivel, false);
});

test('Romance exige gênero romântico ou múltiplos sinais românticos', () => {
  assert.equal(avaliarCompatibilidadeClima(titulo('interestelar', { generos: ['Drama', 'Ficção científica'], palavras_chave: ['love'] }), 'romance').elegivel, false);
  assert.equal(avaliarCompatibilidadeClima(titulo('romance', { generos: ['Drama'], palavras_chave: ['love', 'relationship'] }), 'romance').elegivel, true);
});

test('Leve rejeita dramas e thrillers pesados', () => {
  assert.equal(avaliarCompatibilidadeClima(titulo('titanic', { generos: ['Drama', 'Romance'] }), 'leve').elegivel, false);
  assert.equal(avaliarCompatibilidadeClima(titulo('comedia-leve', { generos: ['Comédia', 'Família'] }), 'leve').elegivel, true);
});

test('Cult rejeita super-heróis e blockbusters comerciais', () => {
  assert.equal(avaliarCompatibilidadeClima(titulo('batman', { generos: ['Ação', 'Crime', 'Drama'], palavras_chave: ['superhero', 'dc comics'], ano: 2022, media_tmdb: 8 }), 'cult').elegivel, false);
});

test('Chorar aceita drama romântico, mas continua rejeitando ação e erotismo', () => {
  assert.equal(avaliarCompatibilidadeClima(titulo('titanic', {
    generos: ['Drama', 'Romance'],
    sinopse: 'Um casal vive um amor impossível durante uma viagem.'
  }), 'chorar').elegivel, true);
  assert.equal(avaliarCompatibilidadeClima(titulo('romance-acao', {
    generos: ['Drama', 'Romance', 'Ação']
  }), 'chorar').elegivel, false);
  assert.equal(avaliarCompatibilidadeClima(titulo('romance-erotico', {
    generos: ['Drama', 'Romance'], palavras_chave: ['eroticism', 'bdsm']
  }), 'chorar').elegivel, false);
});

test('Pensar aceita ficção dramática e crime reflexivo sem liberar blockbuster de ação', () => {
  assert.equal(avaliarCompatibilidadeClima(titulo('ficcao-dramatica', {
    generos: ['Drama', 'Ficção científica']
  }), 'pensar').elegivel, true);
  assert.equal(avaliarCompatibilidadeClima(titulo('crime-reflexivo', {
    generos: ['Drama', 'Crime'], palavras_chave: ['social commentary']
  }), 'pensar').elegivel, true);
  assert.equal(avaliarCompatibilidadeClima(titulo('heroi', {
    generos: ['Ação', 'Ficção científica'], palavras_chave: ['superhero']
  }), 'pensar').elegivel, false);
});

test('Romance rejeita ação, terror e guerra mesmo quando o TMDB também marca romance', () => {
  for (const genero of ['Ação', 'Terror', 'Guerra']) {
    assert.equal(avaliarCompatibilidadeClima(titulo(`romance-${genero}`, {
      generos: ['Romance', genero]
    }), 'romance').elegivel, false);
  }
});

test('Leve rejeita comédias com vários sinais de conteúdo pesado', () => {
  assert.equal(avaliarCompatibilidadeClima(titulo('magia-seducao', {
    generos: ['Romance', 'Fantasia', 'Comédia'],
    palavras_chave: ['exorcism', 'haunting']
  }), 'leve').elegivel, false);
  assert.equal(avaliarCompatibilidadeClima(titulo('forrest', {
    generos: ['Comédia', 'Drama', 'Romance'],
    palavras_chave: ['vietnam war', 'post-traumatic stress disorder (ptsd)']
  }), 'leve').elegivel, false);
});

test('Cult não aceita lançamento recente apenas por gênero e nota alta', () => {
  assert.equal(avaliarCompatibilidadeClima(titulo('operacao-sombra', {
    generos: ['Ação', 'Crime', 'Drama', 'Thriller'],
    ano: new Date().getFullYear() - 1,
    media_tmdb: 8.3
  }), 'cult').elegivel, false);
  assert.equal(avaliarCompatibilidadeClima(titulo('premiado-recente', {
    generos: ['Drama'],
    ano: new Date().getFullYear() - 1,
    palavras_chave: ['film festival', 'award-winning']
  }), 'cult').elegivel, true);
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
    generos: ['Mistério', 'Drama'],
    palavras_chave: ['investigation'],
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
