// js/themes.js
// Aplica e persiste o tema visual ativo (caio / noemy / casal).
// A troca é suave: o CSS já tem transição definida em --transition-theme,
// então só precisamos trocar a classe no <body>.

const STORAGE_KEY = 'diario_modo_ativo';
const THEME_CLASSES = ['theme-caio', 'theme-noemy', 'theme-casal'];

export function getModoAtivo() {
  return sessionStorage.getItem(STORAGE_KEY) || 'casal';
}

export function setModoAtivo(modo) {
  sessionStorage.setItem(STORAGE_KEY, modo);
  aplicarTema(modo);
}

export function normalizarModoAtivo(perfilLogado) {
  const atual = getModoAtivo();
  const permitidos = perfilLogado === 'pessoal'
    ? ['pessoal']
    : ['caio', 'noemy', 'casal'];
  const modo = permitidos.includes(atual) ? atual : (perfilLogado || 'casal');
  if (modo !== atual) setModoAtivo(modo);
  return modo;
}

export function aplicarTema(modo) {
  const body = document.body;
  const temaVisual = THEME_CLASSES.includes(`theme-${modo}`) ? modo : 'casal';
  THEME_CLASSES.forEach(c => body.classList.remove(c));
  body.classList.add(`theme-${temaVisual}`);

  // adiciona a camada de decoração de fundo específica do tema, se ainda não existir
  if (!body.querySelector(':scope > .bg-decor')) {
    const decor = document.createElement('div');
    decor.className = 'bg-decor';
    body.prepend(decor);
  }

  document.querySelectorAll('[data-mode-btn]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.modeBtn === modo);
  });
}

/**
 * Liga os botões de troca de modo (Caio / Noemy / Casal) da navbar.
 * onChange é chamado depois que o tema muda, para a página re-renderizar
 * os dados (notas, observações) de acordo com o novo modo.
 */
export function ligarBotoesDeModo(onChange) {
  document.querySelectorAll('[data-mode-btn]').forEach(btn => {
    btn.addEventListener('click', () => {
      const modo = btn.dataset.modeBtn;
      setModoAtivo(modo);
      if (onChange) onChange(modo);
    });
  });
}
