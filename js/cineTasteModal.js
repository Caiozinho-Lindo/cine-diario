import {
  CINE_TASTE_QUESTIONS,
  montarPayloadCineDiario,
  normalizarPreferenciasDescoberta
} from './cineTaste.js';
import { escapeHtml, showToast } from './ui.js';
import { salvarMeusStreamings } from './streamings.js';
import { atualizarPerfil } from './auth.js';

export function abrirMontarCineDiario({
  perfilAtual = {},
  usuarioId,
  streamingsAtuais = [],
  titulo = 'Montar meu Cine Diário',
  onSalvar
} = {}) {
  return new Promise(resolve => {
    const preferencias = normalizarPreferenciasDescoberta(perfilAtual?.preferencias_descoberta || {});
    if (streamingsAtuais.length && !preferencias.streamings.length) {
      preferencias.streamings = [...streamingsAtuais];
    }

    const respostas = Object.fromEntries(
      CINE_TASTE_QUESTIONS.map(pergunta => [pergunta.id, new Set(preferencias[pergunta.id] || [])])
    );
    let indice = 0;

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay cine-taste-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'cine-taste-title');

    const fechar = resultado => {
      document.removeEventListener('keydown', aoTeclar);
      overlay.remove();
      resolve(resultado || null);
    };
    const aoTeclar = event => {
      if (event.key === 'Escape') fechar(null);
    };

    const render = () => {
      const pergunta = CINE_TASTE_QUESTIONS[indice];
      const selecionados = respostas[pergunta.id];
      overlay.innerHTML = `
        <div class="modal-box cine-taste-box">
          <button class="discovery-modal-close" type="button" data-action="close" aria-label="Fechar">×</button>
          <div class="cine-taste-progress" aria-hidden="true">
            ${CINE_TASTE_QUESTIONS.map((_, atual) => `<span class="${atual <= indice ? 'active' : ''}"></span>`).join('')}
          </div>
          <span class="eyebrow">${escapeHtml(titulo)}</span>
          <h3 id="cine-taste-title">${escapeHtml(pergunta.titulo)}</h3>
          <p>${escapeHtml(pergunta.ajuda)}</p>
          <div class="cine-taste-options">
            ${pergunta.opcoes.map(([valor, rotulo]) => `
              <button class="cine-taste-option ${selecionados.has(valor) ? 'selected' : ''}" data-option="${escapeHtml(valor)}" type="button">
                ${escapeHtml(rotulo)}
              </button>`).join('')}
          </div>
          <div class="cine-taste-actions">
            <button class="btn btn-secondary" data-action="back" type="button" ${indice === 0 ? 'disabled' : ''}>Voltar</button>
            <button class="btn btn-primary" data-action="${indice === CINE_TASTE_QUESTIONS.length - 1 ? 'finish' : 'next'}" type="button">
              ${indice === CINE_TASTE_QUESTIONS.length - 1 ? 'Salvar gosto' : 'Continuar'}
            </button>
          </div>
        </div>`;
    };

    overlay.addEventListener('click', async event => {
      const fecharSolicitado = event.target === overlay || event.target.dataset.action === 'close';
      if (fecharSolicitado) {
        fechar(null);
        return;
      }

      const opcao = event.target.closest('[data-option]');
      if (opcao) {
        const pergunta = CINE_TASTE_QUESTIONS[indice];
        const selecionados = respostas[pergunta.id];
        const valor = opcao.dataset.option;
        if (selecionados.has(valor)) selecionados.delete(valor);
        else {
          if (!pergunta.multipla) selecionados.clear();
          if (valor === 'nada' || valor === 'qualquer') selecionados.clear();
          else selecionados.delete('nada');
          if (pergunta.id === 'streamings') selecionados.delete('qualquer');
          selecionados.add(valor);
        }
        render();
        return;
      }

      if (event.target.dataset.action === 'back') {
        indice = Math.max(0, indice - 1);
        render();
        return;
      }

      if (event.target.dataset.action === 'next') {
        indice = Math.min(CINE_TASTE_QUESTIONS.length - 1, indice + 1);
        render();
        return;
      }

      if (event.target.dataset.action === 'finish') {
        const botao = event.target;
        botao.disabled = true;
        botao.textContent = 'Salvando…';
        try {
          const payload = montarPayloadCineDiario(coletarRespostas(respostas));
          const perfil = await atualizarPerfil(usuarioId, payload);
          await salvarMeusStreamings(usuarioId, payload.preferencias_descoberta.streamings || []);
          showToast('Seu Cine Diário foi ajustado.');
          await onSalvar?.(perfil, payload.preferencias_descoberta);
          fechar(perfil);
        } catch (error) {
          console.error(error);
          showToast('Não foi possível salvar agora.', 'error');
          botao.disabled = false;
          botao.textContent = 'Salvar gosto';
        }
      }
    });

    document.addEventListener('keydown', aoTeclar);
    render();
    document.body.appendChild(overlay);
    overlay.querySelector('[data-option], [data-action="next"]')?.focus();
  });
}

function coletarRespostas(respostas) {
  return Object.fromEntries(
    Object.entries(respostas).map(([campo, valores]) => [campo, [...valores]])
  );
}
