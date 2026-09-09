// Preferências visuais e visão de avaliações do espaço ativo.

const STORAGE_KEY = 'diario_modo_ativo';
const CHAVE_TEMA_INICIAL = 'cine_diario_tema_inicial';
export const TEMAS_PERFIL = [
  {
    id: 'cinema',
    nome: 'Cinema',
    descricao: 'Roxo e dourado',
    cores: ['#150f22', '#c98fd0', '#e0b878']
  },
  {
    id: 'azul',
    nome: 'Noite azul',
    descricao: 'Azul-marinho e luz fria',
    cores: ['#0a1220', '#3f7bd6', '#6ea8ff']
  },
  {
    id: 'lavanda',
    nome: 'Lavanda',
    descricao: 'Claro e delicado',
    cores: ['#f6f0fb', '#9b6fd6', '#c9a4ec']
  },
  {
    id: 'claro',
    nome: 'Claro',
    descricao: 'Neutro e luminoso',
    cores: ['#f4f2ee', '#2b5f87', '#d09b45']
  },
  {
    id: 'noir',
    nome: 'Noir',
    descricao: 'Preto e branco clássico',
    cores: ['#090909', '#f2f2f2', '#888888']
  },
  {
    id: 'aranha',
    nome: 'Aranha',
    descricao: 'Vermelho e azul',
    cores: ['#0a1830', '#e32636', '#2f7de1']
  },
  {
    id: 'matrix',
    nome: 'Matrix',
    descricao: 'Preto e verde digital',
    cores: ['#050907', '#27d17f', '#8af7bd']
  },
  {
    id: 'classico',
    nome: 'Clássico',
    descricao: 'Sépia de cinema antigo',
    cores: ['#211a13', '#d6b778', '#f0dfb5']
  },
  {
    id: 'chefao',
    nome: 'Poderoso Chefão',
    descricao: 'Preto, vinho e dourado',
    cores: ['#080706', '#651d2a', '#c8a45f']
  },
  {
    id: 'tubarao',
    nome: 'Tubarão',
    descricao: 'Oceano, espuma e suspense',
    cores: ['#031522', '#1e6d92', '#d5393e']
  },
  {
    id: 'star-wars',
    nome: 'Star Wars',
    descricao: 'Espaço, estrelas e sabres',
    cores: ['#03050a', '#f1cf32', '#3b8ff5']
  }
];
const THEME_CLASSES = TEMAS_PERFIL.map(tema => `theme-${tema.id}`);
const PREFIXO_MEMBRO = 'membro:';

export function getModoAtivo() {
  return sessionStorage.getItem(STORAGE_KEY) || '';
}

export function setModoAtivo(modo) {
  sessionStorage.setItem(STORAGE_KEY, modo);
}

export function modoDoMembro(usuarioId) {
  return `${PREFIXO_MEMBRO}${usuarioId}`;
}

export function usuarioDoModo(modo) {
  return modo?.startsWith(PREFIXO_MEMBRO) ? modo.slice(PREFIXO_MEMBRO.length) : null;
}

export function normalizarModoAtivo(membros = [], usuarioId = null) {
  let atual = getModoAtivo();

  const permitidos = new Set([
    ...(membros.length > 1 ? ['geral'] : []),
    ...membros.map(item => modoDoMembro(item.usuario_id))
  ]);

  const padrao = membros.length > 1
    ? 'geral'
    : modoDoMembro(membros[0]?.usuario_id || usuarioId || 'atual');
  const modo = permitidos.has(atual) ? atual : padrao;
  setModoAtivo(modo);
  return modo;
}

export function avaliacaoNoModo(titulo, modo) {
  const usuarioId = usuarioDoModo(modo);
  if (!usuarioId) return null;
  return titulo.avaliacoesMembros
    ?.find(item => item.membro.usuario_id === usuarioId)?.avaliacao || null;
}

export function notaNoModo(titulo, modo) {
  const avaliacao = avaliacaoNoModo(titulo, modo);
  if (usuarioDoModo(modo)) return avaliacao ? Number(avaliacao.nota) : null;
  return titulo.pendente || titulo.media === null ? null : Number(titulo.media);
}

export function nomeDoModo(modo, membros = [], usuarioIdAtual = null) {
  if (modo === 'geral') return 'Visão geral';
  const usuarioId = usuarioDoModo(modo);
  const membro = membros.find(item => item.usuario_id === usuarioId);
  if (usuarioId && usuarioId === usuarioIdAtual) return 'Meu diário';
  return membro?.perfil?.nome_exibicao || membro?.perfil?.nome || 'Participante';
}

export function normalizarTema(tema = 'cinema') {
  const equivalencias = { caio: 'azul', noemy: 'lavanda', casal: 'cinema' };
  const temaNormalizado = equivalencias[tema] || tema;
  return TEMAS_PERFIL.some(item => item.id === temaNormalizado) ? temaNormalizado : 'cinema';
}

export function aplicarTema(tema = 'cinema', { lembrar = true } = {}) {
  const body = document.body;
  const temaVisual = normalizarTema(tema);
  THEME_CLASSES.forEach(classe => body.classList.remove(classe));
  body.classList.add(`theme-${temaVisual}`);
  if (lembrar) salvarTemaInicial(temaVisual);
  body.style.removeProperty('--accent');
  body.style.removeProperty('--accent-2');
  body.style.removeProperty('--accent-glow');

  if (!body.querySelector(':scope > .bg-decor')) {
    const decor = document.createElement('div');
    decor.className = 'bg-decor';
    body.prepend(decor);
  }
}

export function salvarTemaInicial(tema = 'cinema') {
  try {
    localStorage.setItem(CHAVE_TEMA_INICIAL, normalizarTema(tema));
  } catch {
    // Se o navegador bloquear armazenamento local, o tema continua vindo do perfil.
  }
}
