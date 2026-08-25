// js/pages/login.js
import {
  login,
  cadastrar,
  solicitarRecuperacaoSenha,
  atualizarSenha,
  getSession
} from '../auth.js';

const message = document.getElementById('login-error');
const tabs = [...document.querySelectorAll('[data-auth-view]')];
const panels = [...document.querySelectorAll('[data-auth-panel]')];

init();

async function init() {
  ligarNavegacao();
  ligarFormularios();

  const recuperando = new URLSearchParams(window.location.search).get('recuperar') === '1';
  if (recuperando) {
    mostrarPainel('new-password');
    return;
  }

  const session = await getSession().catch(() => null);
  if (session) window.location.href = 'pages/home.html';
}

function ligarNavegacao() {
  tabs.forEach(tab => tab.addEventListener('click', () => mostrarPainel(tab.dataset.authView)));
  document.getElementById('forgot-btn').addEventListener('click', () => mostrarPainel('recovery'));
  document.querySelectorAll('[data-back-login]').forEach(btn => {
    btn.addEventListener('click', () => mostrarPainel('login'));
  });
}

function mostrarPainel(nome) {
  panels.forEach(panel => { panel.hidden = panel.dataset.authPanel !== nome; });
  tabs.forEach(tab => tab.classList.toggle('active', tab.dataset.authView === nome));
  document.querySelector('.account-tabs').hidden = !['login', 'signup'].includes(nome);
  limparMensagem();
}

function ligarFormularios() {
  document.getElementById('login-form').addEventListener('submit', onLogin);
  document.getElementById('signup-form').addEventListener('submit', onSignup);
  document.getElementById('recovery-form').addEventListener('submit', onRecovery);
  document.getElementById('new-password-form').addEventListener('submit', onNewPassword);
}

async function onLogin(event) {
  event.preventDefault();
  const btn = document.getElementById('login-btn');
  await executar(btn, 'Entrando...', async () => {
    await login(
      document.getElementById('email').value.trim(),
      document.getElementById('password').value
    );
    window.location.href = 'pages/home.html';
  }, 'E-mail ou senha incorretos. Verifique suas credenciais.');
}

async function onSignup(event) {
  event.preventDefault();
  const btn = document.getElementById('signup-btn');
  await executar(btn, 'Criando conta...', async () => {
    const data = await cadastrar({
      nome: document.getElementById('signup-name').value,
      email: document.getElementById('signup-email').value.trim(),
      password: document.getElementById('signup-password').value
    });
    if (data.session) {
      window.location.href = 'pages/home.html';
    } else {
      exibirMensagem('Conta criada! Confira seu e-mail para confirmar o cadastro.', true);
    }
  }, mensagemErroCadastro);
}

async function onRecovery(event) {
  event.preventDefault();
  const btn = document.getElementById('recovery-btn');
  await executar(btn, 'Enviando...', async () => {
    await solicitarRecuperacaoSenha(document.getElementById('recovery-email').value.trim());
    exibirMensagem('Se o e-mail estiver cadastrado, você receberá um link de recuperação.', true);
  }, 'Não foi possível enviar o link agora. Tente novamente.');
}

async function onNewPassword(event) {
  event.preventDefault();
  const password = document.getElementById('new-password').value;
  const confirmacao = document.getElementById('new-password-confirm').value;
  if (password !== confirmacao) {
    exibirMensagem('As senhas não coincidem.');
    return;
  }

  const btn = document.getElementById('new-password-btn');
  await executar(btn, 'Salvando...', async () => {
    await atualizarSenha(password);
    exibirMensagem('Senha atualizada. Redirecionando para o seu Cine Diário...', true);
    window.setTimeout(() => { window.location.href = 'pages/home.html'; }, 900);
  }, 'O link expirou ou não foi possível atualizar a senha. Solicite outro link.');
}

async function executar(btn, texto, acao, erroPadrao) {
  limparMensagem();
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = texto;
  try {
    await acao();
  } catch (error) {
    console.error(error);
    exibirMensagem(typeof erroPadrao === 'function' ? erroPadrao(error) : erroPadrao);
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

function mensagemErroCadastro(error) {
  if (error?.status === 429 || error?.code === 'over_email_send_rate_limit') {
    return 'Muitas tentativas de cadastro em pouco tempo. Aguarde antes de tentar novamente.';
  }
  if (error?.code === 'user_already_exists' || /already registered/i.test(error?.message || '')) {
    return 'Este e-mail já possui uma conta. Tente entrar ou recuperar a senha.';
  }
  return 'Não foi possível criar a conta. Verifique os dados e tente novamente.';
}

function limparMensagem() {
  message.hidden = true;
  message.classList.remove('success');
  message.textContent = '';
}

function exibirMensagem(texto, sucesso = false) {
  message.textContent = texto;
  message.classList.toggle('success', sucesso);
  message.hidden = false;
}
