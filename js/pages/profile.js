import {
  requireSession,
  getCurrentProfile,
  getUserId,
  atualizarPerfil
} from '../auth.js';
import {
  getEspacosDoUsuario,
  getEspacoAtivo,
  getMembrosDoEspaco,
  setEspacoAtivo,
  criarEspaco,
  atualizarEspaco,
  excluirEspaco,
  sairDoEspaco,
  criarConviteEspaco,
  consultarConviteEspaco,
  entrarEspacoPorCodigo,
  atualizarPapelMembro,
  removerMembroEspaco,
  normalizarCodigo
} from '../espacos.js';
import { normalizarModoAtivo, aplicarTema } from '../themes.js';
import { renderNavbar, escapeHtml, safeImageSrc, showToast, confirmarAcao } from '../ui.js';

const CHAVE_CONVITE_PENDENTE = 'cine_diario_convite_pendente';

let session;
let perfilAtual;
let espacoAtivo;
let membrosEspaco = [];
let modoAtivo;
let espacosUsuario = [];
let conviteAtual = null;

init();

async function init() {
  session = await requireSession();
  if (!session) return;

  perfilAtual = await getCurrentProfile(session);
  espacoAtivo = await getEspacoAtivo();
  membrosEspaco = await getMembrosDoEspaco(espacoAtivo.id);
  modoAtivo = normalizarModoAtivo(membrosEspaco, getUserId(session));
  aplicarTema(perfilAtual.tema, perfilAtual.cor_destaque);
  renderCabecalho();

  preencherPerfil(perfilAtual);
  await renderEspacos();
  renderDetalhesEspaco();
  ligarEventos();
  await processarConvitePendente();
}

function renderCabecalho() {
  renderNavbar(document.getElementById('navbar'), {
    activePage: 'profile',
    modoAtivo,
    perfilAtual,
    membros: membrosEspaco,
    usuarioId: getUserId(session),
    onModoChange: novoModo => { modoAtivo = novoModo; }
  });
}

function preencherPerfil(perfil) {
  document.getElementById('profile-name').value = perfil.nome_exibicao || perfil.nome || '';
  document.getElementById('profile-avatar').value = perfil.avatar_url || '';
  document.getElementById('profile-theme').value = normalizarTemaPerfil(perfil.tema);
  document.getElementById('profile-color').value = perfil.cor_destaque || '#c98fd0';
  renderPreviaPerfil();
}

function normalizarTemaPerfil(tema) {
  return ({ caio: 'azul', noemy: 'lavanda', casal: 'cinema' })[tema] || tema || 'cinema';
}

async function renderEspacos() {
  const [espacos, ativo] = await Promise.all([getEspacosDoUsuario(), getEspacoAtivo()]);
  espacosUsuario = espacos;
  espacoAtivo = ativo;
  document.getElementById('spaces-list').innerHTML = espacos.map(espaco => `
    <div class="space-row ${espaco.id === ativo.id ? 'active' : ''}">
      <div><strong>${escapeHtml(espaco.nome)}</strong></div>
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

function renderPreviaPerfil() {
  const nome = document.getElementById('profile-name').value.trim() || 'Seu nome';
  const avatar = document.getElementById('profile-avatar').value.trim();
  const inicial = nome.charAt(0).toUpperCase() || '•';
  document.getElementById('profile-preview').innerHTML = `
    <span class="profile-preview-avatar">
      ${avatar ? `<img src="${safeImageSrc(avatar)}" alt="" data-avatar-preview />` : escapeHtml(inicial)}
    </span>
    <span><strong>${escapeHtml(nome)}</strong><small>Assim você aparece no Cine Diário</small></span>`;

  const imagem = document.querySelector('[data-avatar-preview]');
  if (imagem) imagem.addEventListener('error', () => {
    imagem.parentElement.textContent = inicial;
  }, { once: true });
}

function renderDetalhesEspaco() {
  const usuarioId = getUserId(session);
  const membroAtual = membrosEspaco.find(membro => membro.usuario_id === usuarioId);
  const papelAtual = papelNormalizado(membroAtual?.papel);
  const podeAdministrar = papelAtual === 'administrador';
  const ehCriador = espacoAtivo.criado_por === usuarioId;

  document.getElementById('active-space-title').textContent = espacoAtivo.nome;
  document.getElementById('current-role').textContent = papelLabel(papelAtual);
  document.getElementById('current-role').className = `chip ${podeAdministrar ? 'chip-yes' : ''}`;
  document.getElementById('members-count').textContent = `${membrosEspaco.length} ${membrosEspaco.length === 1 ? 'membro' : 'membros'}`;
  document.getElementById('invite-actions').hidden = !podeAdministrar;

  const formulario = document.getElementById('edit-space-form');
  formulario.hidden = true;
  document.getElementById('edit-space-name').value = espacoAtivo.nome;

  document.getElementById('members-list').innerHTML = membrosEspaco.map(membro => {
    const nome = membro.perfil?.nome_exibicao || membro.perfil?.nome || 'Participante';
    const avatar = membro.perfil?.avatar_url;
    const souEu = membro.usuario_id === usuarioId;
    const membroEhCriador = membro.usuario_id === espacoAtivo.criado_por;
    const papel = papelNormalizado(membro.papel);
    const podeGerenciarEste = podeAdministrar && !souEu && !membroEhCriador;

    return `
      <div class="member-row">
        <span class="member-avatar">${avatar
          ? `<img src="${safeImageSrc(avatar)}" alt="" />`
          : escapeHtml(nome.charAt(0).toUpperCase())}</span>
        <span class="member-copy">
          <strong>${escapeHtml(nome)}${souEu ? ' (você)' : ''}</strong>
          <small>${escapeHtml(papelLabel(papel))}${membroEhCriador ? ' · Criador' : ''}</small>
        </span>
        ${podeGerenciarEste ? `
          <span class="member-role-actions">
            <select data-member-role="${escapeHtml(membro.usuario_id)}" aria-label="Papel de ${escapeHtml(nome)}">
              <option value="participante" ${papel === 'participante' ? 'selected' : ''}>Participante</option>
              <option value="administrador" ${papel === 'administrador' ? 'selected' : ''}>Administrador</option>
            </select>
            <button class="btn btn-danger btn-sm" data-remove-member="${escapeHtml(membro.usuario_id)}" data-member-name="${escapeHtml(nome)}" type="button">Remover</button>
          </span>` : ''}
      </div>`;
  }).join('');

  document.getElementById('sharing-note').textContent = podeAdministrar
    ? 'Administradores podem convidar, remover participantes e alterar papéis.'
    : 'Você participa deste espaço e mantém sua própria avaliação para cada título.';

  const acoes = [];
  if (ehCriador) {
    acoes.push('<button class="btn btn-secondary" data-space-action="edit" type="button">Editar espaço</button>');
  } else {
    acoes.push('<button class="btn btn-danger" data-space-action="leave" type="button">Sair do espaço</button>');
  }
  if (ehCriador && espacosUsuario.length > 1) {
    acoes.push('<button class="btn btn-danger" data-space-action="delete" type="button">Excluir espaço</button>');
  }
  document.getElementById('space-actions').innerHTML = acoes.join('');
}

function papelNormalizado(papel) {
  return papel === 'administrador' ? 'administrador' : 'participante';
}

function papelLabel(papel) {
  return papel === 'administrador' ? 'Administrador' : 'Participante';
}

function ligarEventos() {
  document.getElementById('profile-form').addEventListener('submit', salvarPerfil);
  document.getElementById('show-space-form').addEventListener('click', () => alternarFormulario('space-form', 'space-name'));
  document.getElementById('show-join-form').addEventListener('click', () => alternarFormulario('join-space-form', 'join-code'));
  document.getElementById('space-form').addEventListener('submit', salvarEspaco);
  document.getElementById('join-space-form').addEventListener('submit', solicitarEntradaPorCodigo);
  document.getElementById('edit-space-form').addEventListener('submit', salvarEdicaoEspaco);
  document.getElementById('active-space-panel').addEventListener('click', tratarAcaoEspaco);
  document.getElementById('active-space-panel').addEventListener('change', alterarPapelPeloControle);
  document.getElementById('profile-name').addEventListener('input', renderPreviaPerfil);
  document.getElementById('profile-avatar').addEventListener('input', renderPreviaPerfil);
  document.getElementById('profile-theme').addEventListener('change', aplicarPreviaVisual);
  document.getElementById('profile-color').addEventListener('input', aplicarPreviaVisual);
  document.getElementById('join-code').addEventListener('input', event => {
    event.target.value = normalizarCodigo(event.target.value);
  });
}

function alternarFormulario(id, campoFoco) {
  const formulario = document.getElementById(id);
  formulario.hidden = !formulario.hidden;
  if (!formulario.hidden) document.getElementById(campoFoco).focus();
}

function aplicarPreviaVisual() {
  aplicarTema(
    document.getElementById('profile-theme').value,
    document.getElementById('profile-color').value
  );
}

async function salvarPerfil(event) {
  event.preventDefault();
  const btn = document.getElementById('save-profile-btn');
  btn.disabled = true;
  try {
    const tema = document.getElementById('profile-theme').value;
    perfilAtual = await atualizarPerfil(getUserId(session), {
      nome_exibicao: document.getElementById('profile-name').value.trim(),
      avatar_url: document.getElementById('profile-avatar').value.trim() || null,
      tema,
      cor_destaque: document.getElementById('profile-color').value
    });
    const membroAtual = membrosEspaco.find(membro => membro.usuario_id === getUserId(session));
    if (membroAtual) membroAtual.perfil = { ...membroAtual.perfil, ...perfilAtual };
    aplicarTema(tema, perfilAtual.cor_destaque);
    renderCabecalho();
    renderPreviaPerfil();
    renderDetalhesEspaco();
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
    await criarEspaco({ nome: document.getElementById('space-name').value }, getUserId(session));
    showToast('Espaço criado.');
    window.location.reload();
  } catch (error) {
    console.error(error);
    showToast('Não foi possível criar o espaço.', 'error');
    btn.disabled = false;
  }
}

async function salvarEdicaoEspaco(event) {
  event.preventDefault();
  const btn = document.getElementById('save-space-btn');
  btn.disabled = true;
  try {
    espacoAtivo = await atualizarEspaco(espacoAtivo.id, {
      nome: document.getElementById('edit-space-name').value
    });
    await renderEspacos();
    renderDetalhesEspaco();
    showToast('Espaço atualizado.');
  } catch (error) {
    console.error(error);
    showToast('Não foi possível atualizar o espaço.', 'error');
  } finally {
    btn.disabled = false;
  }
}

async function tratarAcaoEspaco(event) {
  const remover = event.target.closest('[data-remove-member]');
  if (remover) {
    await confirmarRemocaoMembro(remover.dataset.removeMember, remover.dataset.memberName);
    return;
  }

  const acao = event.target.closest('[data-space-action]')?.dataset.spaceAction;
  if (!acao) return;

  if (acao === 'edit') {
    document.getElementById('edit-space-form').hidden = false;
    document.getElementById('edit-space-name').focus();
    return;
  }
  if (acao === 'code') {
    await exibirConvite();
    return;
  }
  if (acao === 'invite') {
    await compartilharConvite();
    return;
  }
  if (acao === 'copy-code' || acao === 'copy-link') {
    const valor = acao === 'copy-code' ? conviteAtual?.codigo : criarLinkConvite(conviteAtual?.codigo);
    if (valor) await copiarTexto(valor, acao === 'copy-code' ? 'Código copiado.' : 'Link copiado.');
    return;
  }

  const saindo = acao === 'leave';
  const confirmado = await confirmarAcao({
    titulo: saindo ? 'Sair deste espaço?' : 'Excluir este espaço?',
    mensagem: saindo
      ? 'Você deixará de acessar o catálogo e as avaliações deste espaço.'
      : 'O catálogo, as avaliações e as listas deste espaço serão excluídos definitivamente.',
    textoConfirmar: saindo ? 'Sair' : 'Excluir'
  });
  if (!confirmado) return;

  try {
    if (saindo) await sairDoEspaco(espacoAtivo.id, getUserId(session));
    else await excluirEspaco(espacoAtivo.id);
    window.location.reload();
  } catch (error) {
    console.error(error);
    showToast(saindo ? 'Não foi possível sair do espaço.' : 'Não foi possível excluir o espaço.', 'error');
  }
}

async function alterarPapelPeloControle(event) {
  const usuarioId = event.target.dataset.memberRole;
  if (!usuarioId) return;
  event.target.disabled = true;
  try {
    await atualizarPapelMembro(espacoAtivo.id, usuarioId, event.target.value);
    await recarregarMembros();
    showToast('Papel atualizado.');
  } catch (error) {
    console.error(error);
    await recarregarMembros();
    showToast('Não foi possível alterar o papel.', 'error');
  }
}

async function confirmarRemocaoMembro(usuarioId, nome) {
  const confirmado = await confirmarAcao({
    titulo: 'Remover participante?',
    mensagem: `${nome} deixará de acessar este espaço e seu catálogo.`,
    textoConfirmar: 'Remover'
  });
  if (!confirmado) return;

  try {
    await removerMembroEspaco(espacoAtivo.id, usuarioId);
    await recarregarMembros();
    showToast('Participante removido.');
  } catch (error) {
    console.error(error);
    showToast('Não foi possível remover o participante.', 'error');
  }
}

async function recarregarMembros() {
  membrosEspaco = await getMembrosDoEspaco(espacoAtivo.id);
  modoAtivo = normalizarModoAtivo(membrosEspaco, getUserId(session));
  renderCabecalho();
  renderDetalhesEspaco();
}

async function exibirConvite() {
  try {
    conviteAtual = conviteAtual || await criarConviteEspaco(espacoAtivo.id);
    document.getElementById('invite-code-value').textContent = conviteAtual.codigo;
    document.getElementById('invite-expiration').textContent =
      `Válido até ${new Date(conviteAtual.expira_em).toLocaleString('pt-BR')}`;
    document.getElementById('invite-result').hidden = false;
    return conviteAtual;
  } catch (error) {
    console.error(error);
    showToast('Não foi possível criar o convite.', 'error');
    return null;
  }
}

async function compartilharConvite() {
  const convite = await exibirConvite();
  if (!convite) return;
  const url = criarLinkConvite(convite.codigo);
  const dados = {
    title: `Convite para ${espacoAtivo.nome}`,
    text: `Entre no meu espaço “${espacoAtivo.nome}” no Cine Diário.`,
    url
  };

  if (navigator.share) {
    try {
      await navigator.share(dados);
      return;
    } catch (error) {
      if (error?.name === 'AbortError') return;
    }
  }
  await copiarTexto(url, 'Link do convite copiado.');
}

function criarLinkConvite(codigo) {
  if (!codigo) return '';
  const url = new URL('../index.html', window.location.href);
  url.searchParams.set('convite', codigo);
  return url.href;
}

async function copiarTexto(valor, mensagem) {
  try {
    await navigator.clipboard.writeText(valor);
  } catch {
    const campo = document.createElement('textarea');
    campo.value = valor;
    campo.style.position = 'fixed';
    campo.style.opacity = '0';
    document.body.appendChild(campo);
    campo.select();
    document.execCommand('copy');
    campo.remove();
  }
  showToast(mensagem);
}

async function solicitarEntradaPorCodigo(event) {
  event.preventDefault();
  await confirmarEntradaPorCodigo(document.getElementById('join-code').value);
}

async function processarConvitePendente() {
  const params = new URLSearchParams(window.location.search);
  const codigo = normalizarCodigo(params.get('convite') || localStorage.getItem(CHAVE_CONVITE_PENDENTE));
  if (!codigo) return;
  document.getElementById('join-code').value = codigo;
  document.getElementById('join-space-form').hidden = false;
  await confirmarEntradaPorCodigo(codigo, true);
}

async function confirmarEntradaPorCodigo(codigoInformado, vindoDoLink = false) {
  const codigo = normalizarCodigo(codigoInformado);
  if (codigo.length !== 12) {
    showToast('Digite um código de convite válido.', 'error');
    return;
  }

  const btn = document.getElementById('join-space-btn');
  btn.disabled = true;
  try {
    const convite = await consultarConviteEspaco(codigo);
    if (!convite) {
      showToast('Este convite não existe ou expirou.', 'error');
      if (vindoDoLink) limparConvitePendente();
      return;
    }

    const confirmado = await confirmarAcao({
      titulo: convite.ja_membro ? 'Abrir este espaço?' : 'Entrar neste espaço?',
      mensagem: convite.ja_membro
        ? `Você já participa de “${convite.nome_espaco}”. Deseja torná-lo o espaço ativo?`
        : `Você foi convidado para “${convite.nome_espaco}”. Deseja entrar como participante?`,
      textoConfirmar: convite.ja_membro ? 'Abrir' : 'Entrar',
      destrutivo: false
    });
    if (!confirmado) {
      if (vindoDoLink) limparConvitePendente();
      return;
    }

    await entrarEspacoPorCodigo(codigo);
    limparConvitePendente();
    showToast(convite.ja_membro ? 'Espaço selecionado.' : 'Você entrou no espaço.');
    window.location.reload();
  } catch (error) {
    console.error(error);
    showToast('Não foi possível usar este convite.', 'error');
  } finally {
    btn.disabled = false;
  }
}

function limparConvitePendente() {
  localStorage.removeItem(CHAVE_CONVITE_PENDENTE);
  const url = new URL(window.location.href);
  url.searchParams.delete('convite');
  window.history.replaceState({}, '', url);
}
