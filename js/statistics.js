// js/statistics.js
// Calcula estatísticas gerais e destaques a partir da lista de títulos enriquecidos.

import { notaNoModo } from './themes.js';

export function formatarNota(nota) {
  if (nota === null || nota === undefined) return '—';
  const arredondada = Math.round(nota * 100) / 100;
  return arredondada
    .toFixed(2)
    .replace(/\.?0+$/, '')
    .replace('.', ',');
}

export function calcularEstatisticas(titulos, modo = 'geral') {
  const catalogo = titulos.filter(t => !t.quero_assistir);
  const avaliados = catalogo
    .map(t => ({ titulo: t, nota: notaNoModo(t, modo) }))
    .filter(item => item.nota !== null);

  const filmes = avaliados.filter(item => item.titulo.tipo === 'filme');
  const series = avaliados.filter(item => item.titulo.tipo === 'serie');

  const assistiriamos = avaliados.filter(item => item.nota >= 7).length;
  const naoAssistiriamos = avaliados.filter(item => item.nota < 7).length;

  const mediaGeral = avaliados.length
    ? avaliados.reduce((soma, item) => soma + item.nota, 0) / avaliados.length
    : null;

  return {
    totalFilmes: filmes.length,
    totalSeries: series.length,
    totalTitulos: catalogo.length,
    assistiriamos,
    naoAssistiriamos,
    mediaGeral,
    pendentes: catalogo.length - avaliados.length
  };
}

export function calcularDestaques(titulos) {
  const catalogo = titulos.filter(t => !t.quero_assistir);
  const avaliados = catalogo.filter(t => !t.pendente && t.media !== null);
  const membros = new Map();
  catalogo.forEach(titulo => {
    (titulo.avaliacoesMembros || []).forEach(({ membro }) => {
      membros.set(membro.usuario_id, membro);
    });
  });

  return {
    melhorFilme: topPorMedia(avaliados.filter(t => t.tipo === 'filme')),
    melhorSerie: topPorMedia(avaliados.filter(t => t.tipo === 'serie')),
    maiorDiscordancia: topPorDiferenca(avaliados),
    melhoresPorMembro: [...membros.values()].map(membro => ({
      membro,
      titulos: topPorNotaMembro(catalogo, membro.usuario_id)
    })),
    ultimoAdicionado: catalogo.length
      ? [...catalogo].sort((a, b) => new Date(b.criado_em) - new Date(a.criado_em)).slice(0, 1)
      : []
  };
}

function topPorMedia(lista) {
  if (!lista.length) return [];
  const max = Math.max(...lista.map(t => t.media));
  return maisRecente(lista.filter(t => t.media === max));
}

function topPorDiferenca(lista) {
  const comDiferenca = lista.filter(t => t.diferenca !== null && t.diferenca > 0);
  if (!comDiferenca.length) return [];
  const max = Math.max(...comDiferenca.map(t => t.diferenca));
  return maisRecente(comDiferenca.filter(t => t.diferenca === max));
}

function topPorNotaMembro(lista, usuarioId) {
  const avaliados = lista
    .map(titulo => ({
      titulo,
      avaliacao: titulo.avaliacoesMembros
        ?.find(item => item.membro.usuario_id === usuarioId)?.avaliacao || null
    }))
    .filter(item => item.avaliacao);
  if (!avaliados.length) return [];
  const max = Math.max(...avaliados.map(item => Number(item.avaliacao.nota)));
  return avaliados
    .filter(item => Number(item.avaliacao.nota) === max)
    .sort((a, b) => dataDaAvaliacao(b.avaliacao, b.titulo) - dataDaAvaliacao(a.avaliacao, a.titulo))
    .slice(0, 1)
    .map(item => item.titulo);
}

function maisRecente(lista) {
  return [...lista]
    .sort((a, b) => dataMaisRecente(b) - dataMaisRecente(a))
    .slice(0, 1);
}

function dataMaisRecente(titulo) {
  const datas = (titulo.avaliacoesMembros || [])
    .map(item => dataDaAvaliacao(item.avaliacao, titulo));
  return Math.max(...datas, dataSegura(titulo.criado_em));
}

function dataDaAvaliacao(avaliacao, titulo) {
  return dataSegura(avaliacao?.data_avaliacao)
    || dataSegura(titulo?.data_assistido)
    || dataSegura(titulo?.criado_em);
}

function dataSegura(valor) {
  const timestamp = new Date(valor || 0).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}
