import { supabase } from '../supabaseClient.js';

const status = document.getElementById('deletion-status');
const token = new URLSearchParams(window.location.search).get('token');

if (!token) {
  status.textContent = 'Este link de confirmação está incompleto.';
} else {
  confirmar();
}

async function confirmar() {
  try {
    const { error } = await supabase.functions.invoke('account-deletion', { body: { action: 'confirm', token } });
    if (error) throw error;
    status.textContent = 'Sua conta e os dados associados foram excluídos. Você já pode fechar esta página.';
  } catch (error) {
    console.error(error);
    status.textContent = 'Não foi possível confirmar a exclusão. O link pode ter expirado ou já ter sido utilizado.';
  }
}
