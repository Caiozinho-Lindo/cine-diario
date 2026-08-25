import {
  requireSession,
  getCurrentProfile,
  getProfileFromSession,
  getUserId,
  atualizarPerfil
} from '../auth.js';
import {
  getEspacosDoUsuario,
  getEspacoAtivo,
  setEspacoAtivo,
  criarEspaco
} from '../espacos.js';
import { normalizarModoAtivo, aplicarTema } from '../themes.js';
import { renderNavbar, escapeHtml, showToast } from '../ui.js';

let session;

init();

async function init() {
  session = await requireSession();
  if (!session) return;

  const perfil = await getCurrentProfile(session);
  const perfilNavbar = getProfileFromSession(session);
  const modo = normalizarModoAtivo(perfilNavbar);
  aplicarTema(perfil.tema || 'casal');
  renderNavbar(document.getElementById('navbar'), {
    activePage: 'profile',
    modoAtivo: modo,
    perfilLogado: perfilNavbar,
    onModoChange: aplicarTema
  });

  preencherPerfil(perfil);
  await renderEspacos();
  ligarEventos();
}

function preencherPerfil(perfil) {
  document.getElementById('profile-name').value = perfil.nome_exibicao || perfil.nome || '';
  document.getElementById('profile-avatar').value = perfil.avatar_url || '';
  document.getElementById('profile-theme').value = perfil.tema || 'casal';
  document.getElementById('profile-color').value = perfil.cor_destaque || '#c98fd0';
}

async function renderEspacos() {
  const [espacos, ativo] = await Promise.all([getEspacosDoUsuario(), getEspacoAtivo()]);
  document.getElementById('spaces-list').innerHTML = espacos.map(espaco => `
    <div class="space-row ${espaco.id === ativo.id ? 'active' : ''}">
      <div><strong>${escapeHtml(espaco.nome)}</strong><small>${escapeHtml(espaco.tipo)}</small></div>
      ${espaco.id === ativo.id
        ? '<span class="chip chip-yes">Ativo</span>'
        : `<button class="btn btn-secondary btn-sm" data-activate-space="${escapeHtml(espaco.id)}" type="button">Usar</button>`}
    </div>`).join('');

  document.querySelectorAll('[data-activate-space]').forEach(button => {
    button.addEventListener('click', async () => {
      await setEspacoAtivo(button.dataset.activateSpace);
      window.location.reload();
    });
  });
}

function ligarEventos() {
  document.getElementById('profile-form').addEventListener('submit', salvarPerfil);
  document.getElementById('show-space-form').addEventListener('click', () => {
    document.getElementById('space-form').hidden = false;
    document.getElementById('space-name').focus();
  });
  document.getElementById('space-form').addEventListener('submit', salvarEspaco);
}

async function salvarPerfil(event) {
  event.preventDefault();
  const btn = document.getElementById('save-profile-btn');
  btn.disabled = true;
  try {
    const tema = document.getElementById('profile-theme').value;
    await atualizarPerfil(getUserId(session), {
      nome_exibicao: document.getElementById('profile-name').value.trim(),
      avatar_url: document.getElementById('profile-avatar').value.trim() || null,
      tema,
      cor_destaque: document.getElementById('profile-color').value
    });
    aplicarTema(tema);
    showToast('Perfil atualizado.');
  } catch (error) {
    console.error(error);
    showToast('Não foi possível atualizar o perfil.', 'error');
  } finally {
    btn.disabled = false;
  }
}

async function salvarEspaco(event) {
  event.preventDefault();
  const btn = document.getElementById('create-space-btn');
  btn.disabled = true;
  try {
    await criarEspaco({
      nome: document.getElementById('space-name').value,
      tipo: document.getElementById('space-type').value
    }, getUserId(session));
    showToast('Espaço criado.');
    window.location.reload();
  } catch (error) {
    console.error(error);
    showToast('Não foi possível criar o espaço.', 'error');
    btn.disabled = false;
  }
}
