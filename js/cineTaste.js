export const CINE_TASTE_VERSION = 1;

export const CINE_TASTE_QUESTIONS = [
  {
    id: 'interesses',
    titulo: 'Quais tipos de filme mais chamam sua atenção?',
    ajuda: 'Escolha quantos quiser.',
    multipla: true,
    opcoes: [
      ['acao', 'Ação'],
      ['aventura', 'Aventura'],
      ['suspense', 'Suspense'],
      ['misterio', 'Mistério'],
      ['drama', 'Drama'],
      ['comedia', 'Comédia'],
      ['terror', 'Terror'],
      ['ficcao_cientifica', 'Ficção científica'],
      ['fantasia', 'Fantasia'],
      ['romance', 'Romance'],
      ['documentario', 'Documentário'],
      ['animacao', 'Animação']
    ]
  },
  {
    id: 'climas',
    titulo: 'Que clima você costuma procurar?',
    ajuda: 'Isso ajuda o Descobrir a entender o momento certo.',
    multipla: true,
    opcoes: [
      ['rir', '😄 Rir'],
      ['chorar', '😭 Chorar'],
      ['romance', '💘 Romance'],
      ['pensar', '💭 Pensar'],
      ['tensao', '🤯 Tensão'],
      ['acao', '💥 Ação'],
      ['medo', '👻 Medo'],
      ['leve', '🍿 Relaxar'],
      ['real', '🌍 Algo real'],
      ['cult', '🎬 Clássico/cult'],
      ['qualquer', '🎲 Qualquer coisa']
    ]
  },
  {
    id: 'evita',
    titulo: 'Tem algo que você prefere evitar?',
    ajuda: 'Pode deixar sem marcar se nada incomoda.',
    multipla: true,
    opcoes: [
      ['terror_pesado', 'Terror pesado'],
      ['muito_parado', 'Filme muito parado'],
      ['romance', 'Romance'],
      ['violencia_pesada', 'Violência pesada'],
      ['triste', 'Filme triste'],
      ['muito_longo', 'Filme muito longo'],
      ['documentario', 'Documentário'],
      ['musical', 'Musical'],
      ['nada', 'Nada específico']
    ]
  },
  {
    id: 'estilos',
    titulo: 'Você prefere histórias mais…',
    ajuda: 'Escolha o jeito de história que costuma funcionar para você.',
    multipla: true,
    opcoes: [
      ['leves', 'Leves e divertidas'],
      ['emocionantes', 'Emocionantes'],
      ['reflexivas', 'Inteligentes/reflexivas'],
      ['intensas', 'Intensas'],
      ['diferentes', 'Estranhas/diferentes'],
      ['epicas', 'Épicas/grandiosas'],
      ['realistas', 'Realistas']
    ]
  },
  {
    id: 'streamings',
    titulo: 'Onde você costuma assistir?',
    ajuda: 'Se não marcar nada, o Descobrir considera todos.',
    multipla: true,
    opcoes: [
      ['netflix', 'Netflix'],
      ['prime-video', 'Prime Video'],
      ['disney-plus', 'Disney+'],
      ['max', 'Max'],
      ['globoplay', 'Globoplay'],
      ['apple-tv-plus', 'Apple TV+'],
      ['paramount-plus', 'Paramount+'],
      ['qualquer', 'Tanto faz']
    ]
  }
];

const CAMPOS_VALIDOS = new Set(CINE_TASTE_QUESTIONS.map(pergunta => pergunta.id));

export function normalizarPreferenciasDescoberta(preferencias = {}) {
  const respostas = {};
  CAMPOS_VALIDOS.forEach(campo => {
    respostas[campo] = normalizarListaBruta(preferencias[campo]).map(item => item.toLowerCase());
  });
  if (respostas.climas.includes('qualquer') && respostas.climas.length > 1) {
    respostas.climas = respostas.climas.filter(item => item !== 'qualquer');
  }
  if (respostas.evita.includes('nada') && respostas.evita.length > 1) {
    respostas.evita = ['nada'];
  }
  if (respostas.streamings.includes('qualquer')) respostas.streamings = [];
  return {
    versao: CINE_TASTE_VERSION,
    ...respostas,
    atualizado_em: preferencias.atualizado_em || new Date().toISOString()
  };
}

export function temCineDiarioMontado(perfil = {}) {
  return Boolean(
    perfil?.onboarding_cine_diario_concluido_em
    || preferenciasTemRespostas(perfil?.preferencias_descoberta)
  );
}

export function preferenciasTemRespostas(preferencias = {}) {
  const prefs = normalizarPreferenciasDescoberta(preferencias || {});
  return [
    prefs.interesses,
    prefs.climas,
    prefs.evita.filter(item => item !== 'nada'),
    prefs.estilos,
    prefs.streamings
  ].some(lista => lista.length > 0);
}

export function contarAvaliacoesDoUsuario(historico = [], usuarioId) {
  if (!usuarioId) return 0;
  return (historico || []).filter(titulo => avaliacaoDoUsuario(titulo, usuarioId)).length;
}

export function deveAbrirMontagemInicial(perfil, historico, usuarioId) {
  return !temCineDiarioMontado(perfil) && contarAvaliacoesDoUsuario(historico, usuarioId) === 0;
}

export function montarPayloadCineDiario(respostas) {
  const preferencias = normalizarPreferenciasDescoberta({
    ...respostas,
    atualizado_em: new Date().toISOString()
  });
  return {
    preferencias_descoberta: preferencias,
    onboarding_cine_diario_concluido_em: new Date().toISOString()
  };
}

export function pontuarPreferenciasDescoberta(titulo, preferencias = {}) {
  const prefs = normalizarPreferenciasDescoberta(preferencias);
  const generos = normalizarLista(titulo?.generos);
  const texto = normalizarTexto([
    titulo?.nome,
    titulo?.sinopse,
    ...(titulo?.palavras_chave || [])
  ].filter(Boolean).join(' '));

  let pontos = 0;
  prefs.interesses.forEach(interesse => {
    pontos += generos.some(genero => generoCombina(interesse, genero)) ? 6 : 0;
  });
  prefs.climas.forEach(clima => {
    pontos += generos.some(genero => generoCombina(clima, genero)) ? 4 : 0;
  });
  prefs.estilos.forEach(estilo => {
    pontos += estiloCombina(estilo, generos, texto) ? 5 : 0;
  });
  prefs.evita.forEach(evitar => {
    pontos -= evitarCombina(evitar, generos, texto, titulo) ? 12 : 0;
  });

  return pontos;
}

export function generosPreferidosTmdb(preferencias = {}, tipo = 'filme') {
  const prefs = normalizarPreferenciasDescoberta(preferencias);
  const mapaFilme = {
    acao: 28,
    aventura: 12,
    suspense: 53,
    misterio: 9648,
    drama: 18,
    comedia: 35,
    terror: 27,
    ficcao_cientifica: 878,
    fantasia: 14,
    romance: 10749,
    documentario: 99,
    animacao: 16
  };
  const mapaSerie = {
    acao: 10759,
    aventura: 10759,
    suspense: 9648,
    misterio: 9648,
    drama: 18,
    comedia: 35,
    terror: 9648,
    ficcao_cientifica: 10765,
    fantasia: 10765,
    romance: 10749,
    documentario: 99,
    animacao: 16
  };
  const mapa = tipo === 'serie' ? mapaSerie : mapaFilme;
  return [...new Set(prefs.interesses.map(item => mapa[item]).filter(Boolean))];
}

export function resumoCineDiarioMontado(preferencias = {}) {
  const prefs = normalizarPreferenciasDescoberta(preferencias);
  const interesses = rotulos('interesses', prefs.interesses).slice(0, 3);
  const climas = rotulos('climas', prefs.climas).slice(0, 2);
  return [...interesses, ...climas].join(' · ') || 'Ainda não respondido';
}

function rotulos(perguntaId, valores) {
  const pergunta = CINE_TASTE_QUESTIONS.find(item => item.id === perguntaId);
  const mapa = new Map((pergunta?.opcoes || []).map(([valor, rotulo]) => [valor, rotulo.replace(/^[^\p{L}\p{N}]+/u, '')]));
  return normalizarListaBruta(valores).map(valor => mapa.get(valor) || valor);
}

function avaliacaoDoUsuario(titulo, usuarioId) {
  if (titulo?.avaliacaoAtual?.usuario_id === usuarioId) return titulo.avaliacaoAtual;
  return (titulo?.avaliacoesMembros || [])
    .find(item => item.membro?.usuario_id === usuarioId)?.avaliacao || null;
}

function generoCombina(valor, genero) {
  const grupos = {
    acao: ['acao', 'acao e aventura', 'aventura', 'guerra', 'faroeste'],
    aventura: ['aventura', 'acao e aventura', 'fantasia'],
    suspense: ['thriller', 'suspense', 'crime', 'misterio'],
    misterio: ['misterio', 'crime', 'thriller'],
    drama: ['drama', 'historia', 'guerra e politica'],
    comedia: ['comedia', 'familia', 'animacao'],
    terror: ['terror'],
    ficcao_cientifica: ['ficcao cientifica', 'ficcao cientifica e fantasia'],
    fantasia: ['fantasia', 'ficcao cientifica e fantasia'],
    romance: ['romance', 'soap'],
    documentario: ['documentario', 'noticias', 'historia'],
    animacao: ['animacao', 'infantil', 'familia'],
    rir: ['comedia', 'animacao', 'familia', 'infantil'],
    chorar: ['drama', 'musica'],
    romance: ['romance', 'soap'],
    pensar: ['misterio', 'documentario', 'historia', 'guerra e politica', 'ficcao cientifica'],
    tensao: ['thriller', 'crime', 'misterio', 'terror'],
    medo: ['terror'],
    leve: ['familia', 'infantil', 'comedia', 'animacao'],
    real: ['documentario', 'historia', 'noticias'],
    cult: ['drama', 'historia', 'crime', 'misterio', 'faroeste']
  };
  return (grupos[valor] || [valor]).includes(genero);
}

function estiloCombina(estilo, generos, texto) {
  const porGenero = {
    leves: ['familia', 'infantil', 'comedia', 'animacao'],
    emocionantes: ['drama', 'romance', 'musica'],
    reflexivas: ['documentario', 'misterio', 'historia', 'ficcao cientifica'],
    intensas: ['thriller', 'crime', 'terror', 'guerra', 'acao'],
    diferentes: ['ficcao cientifica', 'fantasia', 'misterio'],
    epicas: ['aventura', 'fantasia', 'acao', 'guerra', 'ficcao cientifica'],
    realistas: ['drama', 'documentario', 'historia', 'crime']
  };
  const porTexto = {
    emocionantes: ['luto', 'perda', 'amor', 'superacao', 'sacrif'],
    reflexivas: ['memoria', 'identidade', 'filosofia', 'investigacao', 'dilema'],
    intensas: ['perseguicao', 'sobrevivencia', 'conspiracao', 'sequestro'],
    diferentes: ['surreal', 'estranho', 'experimental', 'multiverso'],
    epicas: ['jornada', 'reino', 'guerra', 'destino', 'saga'],
    realistas: ['real', 'biografia', 'politica', 'sociedade']
  };
  return generos.some(genero => (porGenero[estilo] || []).includes(genero))
    || (porTexto[estilo] || []).some(palavra => texto.includes(palavra));
}

function evitarCombina(evitar, generos, texto, titulo) {
  if (evitar === 'nada') return false;
  const porGenero = {
    terror_pesado: ['terror'],
    romance: ['romance', 'soap'],
    triste: ['drama'],
    documentario: ['documentario'],
    musical: ['musica'],
    violencia_pesada: ['terror', 'crime', 'guerra'],
    muito_parado: ['drama', 'documentario'],
    muito_longo: []
  };
  const porTexto = {
    terror_pesado: ['possessao', 'demonio', 'tortura', 'assombracao'],
    violencia_pesada: ['tortura', 'massacre', 'genocidio', 'brutal'],
    triste: ['luto', 'perda', 'doenca terminal', 'tragedia'],
    muito_parado: ['contemplativo', 'lento'],
    muito_longo: []
  };
  const duracao = Number(titulo?.duracao_minutos);
  return generos.some(genero => (porGenero[evitar] || []).includes(genero))
    || (porTexto[evitar] || []).some(palavra => texto.includes(palavra))
    || (evitar === 'muito_longo' && Number.isFinite(duracao) && duracao > 150);
}

function normalizarLista(valores = []) {
  return normalizarListaBruta(valores).map(normalizarTexto).filter(Boolean);
}

function normalizarListaBruta(valores = []) {
  return Array.isArray(valores) ? valores.map(item => String(item || '').trim()).filter(Boolean) : [];
}

function normalizarTexto(valor) {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/_/g, ' ')
    .toLowerCase()
    .trim();
}
