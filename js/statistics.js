// js/statistics.js
// Calcula estatísticas gerais e destaques a partir da lista de títulos enriquecidos.

export function formatarNota(nota) {
  if (nota === null || nota === undefined) return '—';
  const arredondada = Math.round(nota * 100) / 100;
  return arredondada
    .toFixed(2)
    .replace(/\.?0+$/, '')
    .replace('.', ',');
}

export function calcularEstatisticas(titulos) {
  const catalogo = titulos.filter(t => !t.quero_assistir);
  const avaliados = catalogo.filter(t => !t.pendente && t.media !== null);

  const filmes = catalogo.filter(t => t.tipo === 'filme');
  const series = catalogo.filter(t => t.tipo === 'serie');

  const assistiriamos = avaliados.filter(t => t.status === 'assistiriamos').length;
  const naoAssistiriamos = avaliados.filter(t => t.status === 'nao_assistiriamos').length;

  const mediaGeral = avaliados.length
    ? avaliados.reduce((soma, t) => soma + t.media, 0) / avaliados.length
    : null;

  return {
    totalFilmes: filmes.length,
    totalSeries: series.length,
    totalTitulos: catalogo.length,
    assistiriamos,
    naoAssistiriamos,
    mediaGeral,
    pendentes: catalogo.filter(t => t.pendente).length
  };
}

export function calcularDestaques(titulos) {
  const catalogo = titulos.filter(t => !t.quero_assistir);
  const avaliados = catalogo.filter(t => !t.pendente && t.media !== null);
  const comCaio = catalogo.filter(t => t.avaliacaoCaio);
  const comNoemy = catalogo.filter(t => t.avaliacaoNoemy);

  return {
    melhorFilme: topPorMedia(avaliados.filter(t => t.tipo === 'filme')),
    melhorSerie: topPorMedia(avaliados.filter(t => t.tipo === 'serie')),
    maiorDiscordancia: topPorDiferenca(avaliados),
    melhorAvaliacaoCaio: topPorNotaPessoa(comCaio, 'avaliacaoCaio'),
    melhorAvaliacaoNoemy: topPorNotaPessoa(comNoemy, 'avaliacaoNoemy'),
    ultimoAdicionado: catalogo.length
      ? [...catalogo].sort((a, b) => new Date(b.criado_em) - new Date(a.criado_em)).slice(0, 1)
      : []
  };
}

function topPorMedia(lista) {
  if (!lista.length) return [];
  const max = Math.max(...lista.map(t => t.media));
  return lista.filter(t => t.media === max);
}

function topPorDiferenca(lista) {
  const comDiferenca = lista.filter(t => t.diferenca !== null && t.diferenca > 0);
  if (!comDiferenca.length) return [];
  const max = Math.max(...comDiferenca.map(t => t.diferenca));
  return comDiferenca.filter(t => t.diferenca === max);
}

function topPorNotaPessoa(lista, campo) {
  if (!lista.length) return [];
  const max = Math.max(...lista.map(t => Number(t[campo].nota)));
  return lista.filter(t => Number(t[campo].nota) === max);
}
