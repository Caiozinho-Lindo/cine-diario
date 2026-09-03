import { supabase } from './supabaseClient.js';

export async function getSugestoesDeUsuariosCompativeis(espacoId, tipo, limite = 30) {
  if (!espacoId) return [];

  const { data, error } = await supabase.rpc('sugestoes_usuarios_compativeis', {
    p_espaco_id: espacoId,
    p_tipo: tipo,
    p_limite: limite
  });

  if (error) {
    if (recursoAindaNaoMigrado(error)) return [];
    throw error;
  }

  return (data || []).map(item => ({
    tmdb_id: Number(item.tmdb_id),
    tipo: item.tipo,
    usuarios_compativeis: Number(item.usuarios_compativeis) || 0,
    membros_compativeis: Number(item.membros_compativeis) || 0,
    media_compativel: Number(item.media_nota) || null
  }));
}

function recursoAindaNaoMigrado(error) {
  return ['42883', 'PGRST202', 'PGRST205'].includes(error?.code);
}
