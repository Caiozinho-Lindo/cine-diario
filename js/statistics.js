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

export function calcularEstatisticas(titulos, modo = 'casal') {
  const catalogo = titulos.filter(t => !t.quero_assistir);
  const avaliados = catalogo
    .map(t => ({ titulo: t, nota: notaPorModo(t, modo) }))
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

function notaPorModo(titulo, modo) {
  if (modo === 'caio') {
    return titulo.avaliacaoCaio ? Number(titulo.avaliacaoCaio.nota) : null;
  }
  if (modo === 'noemy') {
    return titulo.avaliacaoNoemy ? Number(titulo.avaliacaoNoemy.nota) : null;
  }
  if (modo === 'pessoal') {
    return titulo.avaliacaoAtual ? Number(titulo.avaliacaoAtual.nota) : null;
  }
  return titulo.pendente || titulo.media === null ? null : Number(titulo.media);
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
