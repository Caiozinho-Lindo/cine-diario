// js/titulos.js
// CRUD de títulos por espaço e avaliações individuais no Supabase.

import { supabase } from './supabaseClient.js';
import { getEspacoAtivo, getMembrosDoEspaco } from './espacos.js';

const TEMPORADA_OBRA_INTEIRA = 0;

async function contextoAtivo() {
  const espaco = await getEspacoAtivo();
  const membros = await getMembrosDoEspaco(espaco.id);
  const { data: { user } } = await supabase.auth.getUser();
  return { espaco, membros, usuarioId: user?.id || null };
}

export async function getAllTitulosComAvaliacoes({ incluirDesejos = false } = {}) {
  const { espaco, membros, usuarioId } = await contextoAtivo();
  let consultaTitulos = supabase
    .from('titulos')
    .select('*')
    .order('criado_em', { ascending: false });

  if (espaco.id) consultaTitulos = consultaTitulos.eq('espaco_id', espaco.id);

  if (!incluirDesejos) consultaTitulos = consultaTitulos.eq('quero_assistir', false);

  const { data: titulos, error: titulosError } = await consultaTitulos;
  if (titulosError) throw titulosError;

  const { data: avaliacoes, error: avaliacoesError } = await supabase
    .from('avaliacoes')
    .select('*')
    .eq('temporada', TEMPORADA_OBRA_INTEIRA);
  if (avaliacoesError) throw avaliacoesError;

  return titulos.map(titulo => enrichTitulo(titulo, avaliacoes, membros, usuarioId));
}

export async function getTituloComAvaliacoes(id) {
  const { espaco, membros, usuarioId } = await contextoAtivo();
  let consultaTitulo = supabase
    .from('titulos')
    .select('*')
    .eq('id', id);
  if (espaco.id) consultaTitulo = consultaTitulo.eq('espaco_id', espaco.id);
  const { data: titulo, error: tituloError } = await consultaTitulo.single();
  if (tituloError) throw tituloError;

  const { data: avaliacoes, error: avaliacoesError } = await supabase
    .from('avaliacoes')
    .select('*')
    .eq('titulo_id', id)
    .eq('temporada', TEMPORADA_OBRA_INTEIRA);
  if (avaliacoesError) throw avaliacoesError;

  return enrichTitulo(titulo, avaliacoes, membros, usuarioId);
}

export async function criarTitulo(dadosTitulo, usuarioId) {
  const espaco = await getEspacoAtivo();
  const payload = {
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
    quero_assistir: Boolean(dadosTitulo.quero_assistir)
  };
  if (espaco.id) payload.espaco_id = espaco.id;

  if (payload.tmdb_id) {
    let consultaExistente = supabase
      .from('titulos')
      .select('*')
      .eq('tmdb_id', payload.tmdb_id)
      .eq('tipo', payload.tipo);
    if (espaco.id) consultaExistente = consultaExistente.eq('espaco_id', espaco.id);
    const { data: existentes, error: buscaError } = await consultaExistente.limit(1);
    if (buscaError) throw buscaError;

    if (existentes?.length) {
      if (payload.quero_assistir) return { ...existentes[0], jaExistia: true };
      let atualizacao = supabase
        .from('titulos')
        .update(payload)
        .eq('id', existentes[0].id);
      if (espaco.id) atualizacao = atualizacao.eq('espaco_id', espaco.id);
      const { data, error } = await atualizacao.select().single();
      if (error) throw error;
      await salvarEstadoBiblioteca(usuarioId, data.id, 'assistido', data.data_assistido);
      return data;
    }
  }

  const { data, error } = await supabase.from('titulos').insert(payload).select().single();
  if (error) throw error;
  await salvarEstadoBiblioteca(
    usuarioId,
    data.id,
    payload.quero_assistir ? 'quero_assistir' : 'assistido',
    payload.data_assistido
  );
  return data;
}

export async function getListaDesejos() {
  const espaco = await getEspacoAtivo();
  let consulta = supabase
    .from('titulos')
    .select('*')
    .eq('quero_assistir', true);
  if (espaco.id) consulta = consulta.eq('espaco_id', espaco.id);
  const { data, error } = await consulta.order('criado_em', { ascending: false });
  if (error) throw error;
  return data;
}

export async function atualizarTitulo(id, campos) {
  const espaco = await getEspacoAtivo();
  let atualizacao = supabase
    .from('titulos')
    .update(campos)
    .eq('id', id);
  if (espaco.id) atualizacao = atualizacao.eq('espaco_id', espaco.id);
  const { data, error } = await atualizacao.select().single();
  if (error) throw error;
  return data;
}

export async function excluirTitulo(id) {
  const espaco = await getEspacoAtivo();
  let exclusao = supabase
    .from('titulos')
    .delete()
    .eq('id', id);
  if (espaco.id) exclusao = exclusao.eq('espaco_id', espaco.id);
  const { error } = await exclusao;
  if (error) throw error;
}

export async function salvarAvaliacao({ tituloId, usuarioId, nota, observacao, dataAvaliacao }) {
  const { data, error } = await supabase
    .from('avaliacoes')
    .upsert(
      {
        titulo_id: tituloId,
        usuario_id: usuarioId,
        temporada: TEMPORADA_OBRA_INTEIRA,
        nota,
        observacao: observacao || '',
        data_avaliacao: dataAvaliacao || new Date().toISOString().slice(0, 10)
      },
      { onConflict: 'titulo_id,usuario_id,temporada' }
    )
    .select()
    .single();
  if (error) throw error;

  await salvarEstadoBiblioteca(usuarioId, tituloId, 'assistido', dataAvaliacao);
  return data;
}

async function salvarEstadoBiblioteca(usuarioId, tituloId, status, dataAssistido = null) {
  const { error } = await supabase
    .from('biblioteca_usuario')
    .upsert(
      {
        usuario_id: usuarioId,
        titulo_id: tituloId,
        status,
        data_assistido: status === 'assistido' ? dataAssistido || null : null,
        privacidade: 'espaco',
        atualizado_em: new Date().toISOString()
      },
      { onConflict: 'usuario_id,titulo_id' }
    );
  if (error) throw error;
}

function enrichTitulo(titulo, avaliacoes, membros, usuarioId) {
  const avaliacoesTitulo = avaliacoes.filter(avaliacao => avaliacao.titulo_id === titulo.id);
  const notas = avaliacoesTitulo.map(avaliacao => Number(avaliacao.nota));
  const media = notas.length
    ? notas.reduce((total, nota) => total + nota, 0) / notas.length
    : null;
  const diferenca = notas.length > 1 ? Math.max(...notas) - Math.min(...notas) : null;
  const pendente = avaliacoesTitulo.length < membros.length;

  return {
    ...titulo,
    avaliacoesMembros: membros.map(membro => ({
      membro,
      avaliacao: avaliacoesTitulo.find(item => item.usuario_id === membro.usuario_id) || null
    })),
    avaliacaoAtual: avaliacoesTitulo.find(item => item.usuario_id === usuarioId) || null,
    media,
    diferenca,
    pendente
  };
}
