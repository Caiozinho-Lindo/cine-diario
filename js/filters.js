// js/filters.js
// Filtros e ordenação da lista de títulos, respeitando a pessoa ou visão geral ativa.

import { notaNoModo } from './themes.js';

/**
 * Retorna a "nota relevante" de um título de acordo com o modo ativo.
 * - modo "membro:<uuid>" -> nota daquela pessoa
 * - modo "geral" -> média do espaço quando todas as pessoas avaliaram
 */
export function notaPorModo(titulo, modo) {
  return notaNoModo(titulo, modo);
}

export function aplicarFiltros(titulos, filtros, modo) {
  let resultado = [...titulos];

  if (filtros.tipo && filtros.tipo !== 'todos') {
    resultado = resultado.filter(t => t.tipo === filtros.tipo);
  }

  if (filtros.busca) {
    const termo = filtros.busca.toLowerCase().trim();
    resultado = resultado.filter(t => t.nome.toLowerCase().includes(termo));
  }

  if (filtros.genero) {
    resultado = resultado.filter(t => (t.generos || []).includes(filtros.genero));
  }

  if (filtros.ano) {
    resultado = resultado.filter(t => String(t.ano) === String(filtros.ano));
  }

  if (filtros.avaliacao) {
    resultado = resultado.filter(t => atendeAvaliacaoFiltro(t, filtros.avaliacao, modo));
  }

  if (filtros.ordenacao) {
    resultado = ordenar(resultado, filtros.ordenacao, modo);
  }

  return resultado;
}

function atendeAvaliacaoFiltro(titulo, filtro, modo) {
  if (filtro === 'pendentes') return estaPendenteParaUsuario(titulo);

  const nota = notaPorModo(titulo, modo);

  switch (filtro) {
    case 'assistiriamos': return nota !== null && nota >= 7;
    case 'nao_assistiriamos': return nota !== null && nota < 7;
    case 'maior_igual_7': return nota !== null && nota >= 7;
    case 'menor_7': return nota !== null && nota < 7;
    case 'faixa_9_10': return nota !== null && nota >= 9 && nota <= 10;
    case 'faixa_8_89': return nota !== null && nota >= 8 && nota < 9;
    case 'faixa_7_79': return nota !== null && nota >= 7 && nota < 8;
    case 'abaixo_7': return nota !== null && nota < 7;
    default: return true;
  }
}

/**
 * Um título está pendente para o usuário atual somente quando outra pessoa do
 * espaço já o avaliou e o usuário logado ainda não. Funciona com qualquer
 * quantidade de membros e não confunde a lista "Para assistir" com pendências.
 */
export function estaPendenteParaUsuario(titulo) {
  if (titulo.quero_assistir || titulo.avaliacaoAtual) return false;
  return (titulo.avaliacoesMembros || []).some(item => Boolean(item.avaliacao));
}

function ordenar(lista, criterio, modo) {
  const copia = [...lista];

  switch (criterio) {
    case 'maior_nota':
      return copia.sort((a, b) => (notaPorModo(b, modo) ?? -1) - (notaPorModo(a, modo) ?? -1));
    case 'menor_nota':
      return copia.sort((a, b) => (notaPorModo(a, modo) ?? 99) - (notaPorModo(b, modo) ?? 99));
    case 'recentes':
      return copia.sort((a, b) => new Date(b.criado_em) - new Date(a.criado_em));
    case 'antigos':
      return copia.sort((a, b) => new Date(a.criado_em) - new Date(b.criado_em));
    case 'alfabetica':
      return copia.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    default:
      return copia;
  }
}

export function extrairGenerosUnicos(titulos) {
  const set = new Set();
  titulos.forEach(t => (t.generos || []).forEach(g => set.add(g)));
  return [...set].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

export function extrairAnosUnicos(titulos) {
  const set = new Set(titulos.map(t => t.ano).filter(Boolean));
  return [...set].sort((a, b) => b - a);
}
