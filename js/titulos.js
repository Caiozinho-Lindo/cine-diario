// js/titulos.js
// CRUD de títulos (filmes/séries) e avaliações individuais no Supabase.
//
// Modelagem:
//   titulos    -> dados do filme/série em si
//   avaliacoes -> uma linha por (titulo_id, usuario_id, temporada)
//                 "temporada" é null hoje (obra inteira). Isso permite
//                 no futuro adicionar avaliação por temporada sem
//                 reestruturar a tabela.

import { supabase } from './supabaseClient.js';
import { getPerfilIds } from './perfis.js';

/**
 * Busca todos os títulos com suas avaliações já anexadas.
 * Retorna um array de "títulos enriquecidos":
 * { ...titulo, avaliacaoCaio, avaliacaoNoemy, media, status, diferenca }
 */
export async function getAllTitulosComAvaliacoes() {
  const { data: titulos, error: err1 } = await supabase
    .from('titulos')
    .select('*')
    .order('criado_em', { ascending: false });

  if (err1) throw err1;

  const { data: avaliacoes, error: err2 } = await supabase
    .from('avaliacoes')
    .select('*')
    .is('temporada', null); // obra inteira (não por temporada)

  if (err2) throw err2;

  const { caioId, noemyId } = await getPerfilIds();

  return titulos.map(t => enrichTitulo(t, avaliacoes, caioId, noemyId));
}

export async function getTituloComAvaliacoes(id) {
  const { data: titulo, error: err1 } = await supabase
    .from('titulos')
    .select('*')
    .eq('id', id)
    .single();

  if (err1) throw err1;

  const { data: avaliacoes, error: err2 } = await supabase
    .from('avaliacoes')
    .select('*')
    .eq('titulo_id', id)
    .is('temporada', null);

  if (err2) throw err2;

  const { caioId, noemyId } = await getPerfilIds();
  return enrichTitulo(titulo, avaliacoes, caioId, noemyId);
}

/**
 * Cria um novo título a partir dos dados do TMDB + campos extras.
 */
export async function criarTitulo(dadosTitulo, usuarioId) {
  const { data, error } = await supabase
    .from('titulos')
    .insert({
      tmdb_id: dadosTitulo.tmdb_id,
      tipo: dadosTitulo.tipo,
      nome: dadosTitulo.nome,
      nome_original: dadosTitulo.nome_original,
      ano: dadosTitulo.ano,
      generos: dadosTitulo.generos || [],
      capa_url: dadosTitulo.capa_url,
      backdrop_url: dadosTitulo.backdrop_url,
      sinopse: dadosTitulo.sinopse,
      data_assistido: dadosTitulo.data_assistido || null,
      criado_por: usuarioId,
      quero_assistir: dadosTitulo.quero_assistir || false
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Retorna os títulos marcados como "quero assistir" (lista de desejos do casal).
 */
export async function getListaDesejos() {
  const { data, error } = await supabase
    .from('titulos')
    .select('*')
    .eq('quero_assistir', true)
    .order('criado_em', { ascending: false });

  if (error) throw error;
  return data;
}

export async function atualizarTitulo(id, campos) {
  const { data, error } = await supabase
    .from('titulos')
    .update(campos)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function excluirTitulo(id) {
  // As avaliações são removidas em cascata via FK "on delete cascade"
  // configurada no schema do Supabase (ver README).
  const { error } = await supabase.from('titulos').delete().eq('id', id);
  if (error) throw error;
}

/**
 * Cria ou atualiza (upsert) a avaliação de UM usuário para um título.
 * A constraint única (titulo_id, usuario_id, temporada) garante que
 * cada pessoa tenha só uma avaliação por título.
 */
export async function salvarAvaliacao({ tituloId, usuarioId, nota, observacao, dataAvaliacao }) {
  const { data, error } = await supabase
    .from('avaliacoes')
    .upsert(
      {
        titulo_id: tituloId,
        usuario_id: usuarioId,
        temporada: null,
        nota,
        observacao: observacao || '',
        data_avaliacao: dataAvaliacao || new Date().toISOString().slice(0, 10)
      },
      { onConflict: 'titulo_id,usuario_id,temporada' }
    )
    .select()
    .single();

  if (error) throw error;
  return data;
}

/* ==========================================================================
   Helpers internos
   ========================================================================== */

function enrichTitulo(titulo, avaliacoes, caioId, noemyId) {
  const avaliacaoCaio = avaliacoes.find(a => a.titulo_id === titulo.id && a.usuario_id === caioId) || null;
  const avaliacaoNoemy = avaliacoes.find(a => a.titulo_id === titulo.id && a.usuario_id === noemyId) || null;

  const temAmbas = avaliacaoCaio && avaliacaoNoemy;
  const media = temAmbas ? (Number(avaliacaoCaio.nota) + Number(avaliacaoNoemy.nota)) / 2 : null;
  const diferenca = temAmbas ? Math.abs(Number(avaliacaoCaio.nota) - Number(avaliacaoNoemy.nota)) : null;

  let status;
  if (!avaliacaoCaio && !avaliacaoNoemy) status = 'sem_avaliacao';
  else if (!avaliacaoCaio) status = 'aguardando_caio';
  else if (!avaliacaoNoemy) status = 'aguardando_noemy';
  else status = media >= 7 ? 'assistiriamos' : 'nao_assistiriamos';

  return {
    ...titulo,
    avaliacaoCaio,
    avaliacaoNoemy,
    media,
    diferenca,
    status,
    pendente: status === 'aguardando_caio' || status === 'aguardando_noemy' || status === 'sem_avaliacao'
  };
}
