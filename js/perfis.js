// js/perfis.js
// Resolve o mapeamento entre "caio" / "noemy" e o user_id do Supabase Auth,
// usando uma tabela pública de leitura "perfis" (id = auth.users.id, nome = 'caio'|'noemy').
//
// Isso é necessário porque, no dispositivo de uma pessoa, o client só tem
// acesso à própria sessão — não dá pra descobrir o ID da outra pessoa sem
// uma tabela compartilhada e legível pelos dois. Ver README para o script
// SQL que cria e popula essa tabela.

import { supabase } from './supabaseClient.js';

let _cache = null;

export async function getPerfilIds() {
  if (_cache) return _cache;

  const { data, error } = await supabase.from('perfis').select('id, nome');
  if (error) throw error;

  const caio = data.find(p => p.nome === 'caio');
  const noemy = data.find(p => p.nome === 'noemy');

  _cache = {
    caioId: caio ? caio.id : null,
    noemyId: noemy ? noemy.id : null
  };
  return _cache;
}

export function limparCachePerfis() {
  _cache = null;
}
