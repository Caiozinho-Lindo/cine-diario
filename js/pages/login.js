// js/pages/login.js
import { login, getSession } from '../auth.js';

const form = document.getElementById('login-form');
const errorEl = document.getElementById('login-error');
const btn = document.getElementById('login-btn');

init();

async function init() {
  // Se já está logado, vai direto para a home.
  const session = await getSession().catch(() => null);
  if (session) {
    window.location.href = 'pages/home.html';
  }
}

form.addEventListener('submit', async e => {
  e.preventDefault();
  errorEl.hidden = true;
  btn.disabled = true;
  btn.textContent = 'Entrando...';

  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;

  try {
    await login(email, password);
    window.location.href = 'pages/home.html';
  } catch (err) {
    errorEl.textContent = 'E-mail ou senha incorretos. Verifique suas credenciais.';
    errorEl.hidden = false;
    btn.disabled = false;
    btn.textContent = 'Entrar';
  }
});
