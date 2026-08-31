// Preferências visuais e visão de avaliações do espaço ativo.

const STORAGE_KEY = 'diario_modo_ativo';
const THEME_CLASSES = ['theme-azul', 'theme-lavanda', 'theme-cinema'];
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

export function aplicarTema(tema = 'cinema', corDestaque = null) {
  const body = document.body;
  const equivalencias = { caio: 'azul', noemy: 'lavanda', casal: 'cinema' };
  const temaNormalizado = equivalencias[tema] || tema;
  const temaVisual = THEME_CLASSES.includes(`theme-${temaNormalizado}`) ? temaNormalizado : 'cinema';
  THEME_CLASSES.forEach(classe => body.classList.remove(classe));
  body.classList.add(`theme-${temaVisual}`);

  aplicarCorDestaque(body, corDestaque);

  if (!body.querySelector(':scope > .bg-decor')) {
    const decor = document.createElement('div');
    decor.className = 'bg-decor';
    body.prepend(decor);
  }
}

function aplicarCorDestaque(elemento, cor) {
  const hex = normalizarCorHex(cor);
  if (!hex) {
    elemento.style.removeProperty('--accent');
    elemento.style.removeProperty('--accent-2');
    elemento.style.removeProperty('--accent-glow');
    return;
  }

  const [r, g, b] = hex.match(/[a-f\d]{2}/gi).map(valor => parseInt(valor, 16));
  const clara = [r, g, b].map(canal => Math.round(canal + (255 - canal) * 0.32));
  elemento.style.setProperty('--accent', hex);
  elemento.style.setProperty('--accent-2', `rgb(${clara.join(', ')})`);
  elemento.style.setProperty('--accent-glow', `rgba(${r}, ${g}, ${b}, 0.24)`);
}

function normalizarCorHex(cor) {
  const valor = String(cor || '').trim();
  return /^#[0-9a-f]{6}$/i.test(valor) ? valor : null;
}
