import { readFile } from 'node:fs/promises';
import {
  avaliarCompatibilidadeClima,
  recomendarDaLista,
  temQualidadeMinimaTmdb
} from '../js/recommendations.js';

const BASE_URL = 'https://api.themoviedb.org/3';
const config = await readFile(new URL('../config.js', import.meta.url), 'utf8');
const token = config.match(/TMDB_READ_TOKEN:\s*["']([^"']+)/)?.[1];
if (!token) throw new Error('TMDB_READ_TOKEN não encontrado em config.js');

const headers = { accept: 'application/json', Authorization: `Bearer ${token}` };
let requisicoesTmdb = 0;
const climas = {
  rir: [35],
  chorar: '18,10749',
  romance: [10749],
  pensar: [9648, 99, 36],
  tensao: [53, 80, 9648, 27, 18, 28],
  acao: [28, 12, 10752, 37, 80, 878, 14, 53, 16],
  medo: [27],
  leve: [10751, 35, 16, 10749, 10402],
  real: [99, 36, 10752],
  cult: [18, 36, 80, 9648, 37]
};

const nomes = {
  rir: 'Rir', chorar: 'Chorar', romance: 'Romance', pensar: 'Pensar',
  tensao: 'Tensão', acao: 'Ação', medo: 'Medo', leve: 'Leve',
  real: 'Algo real', cult: 'Clássico/cult'
};

async function obterJson(caminho) {
  let ultimoErro;
  for (let tentativa = 1; tentativa <= 3; tentativa += 1) {
    try {
      requisicoesTmdb += 1;
      const resposta = await fetch(`${BASE_URL}${caminho}`, { headers });
      if (!resposta.ok) throw new Error(`${resposta.status} em ${caminho}`);
      return resposta.json();
    } catch (error) {
      ultimoErro = error;
      if (tentativa < 3) await new Promise(resolve => setTimeout(resolve, tentativa * 300));
    }
  }
  throw ultimoErro;
}

function ano(data) {
  const valor = Number(String(data || '').slice(0, 4));
  return valor || null;
}

async function detalhes(id) {
  const dado = await obterJson(`/movie/${id}?language=pt-BR&append_to_response=keywords,watch/providers`);
  const regiao = dado['watch/providers']?.results?.BR || {};
  const provedores = [...(regiao.flatrate || []), ...(regiao.free || []), ...(regiao.ads || [])];
  return {
    tmdb_id: dado.id,
    id: `tmdb-filme-${dado.id}`,
    tipo: 'filme',
    nome: dado.title,
    ano: ano(dado.release_date),
    generos: (dado.genres || []).map(item => item.name),
    sinopse: dado.overview || '',
    palavras_chave: (dado.keywords?.keywords || []).map(item => item.name),
    media_tmdb: Number(dado.vote_average) || null,
    votos_tmdb: Number(dado.vote_count) || 0,
    popularidade: Number(dado.popularity) || 0,
    duracao_minutos: Number(dado.runtime) || null,
    provedores: provedores.map(item => ({ slug: String(item.provider_id) }))
  };
}

async function candidatos(clima, pages) {
  const generos = Array.isArray(climas[clima]) ? climas[clima].join('|') : climas[clima];
  const lotes = await Promise.all(pages.map(async page => {
    const params = new URLSearchParams({
      language: 'pt-BR',
      include_adult: 'false',
      sort_by: 'popularity.desc',
      watch_region: 'BR',
      with_watch_monetization_types: 'flatrate|free|ads',
      with_genres: generos,
      page: String(page)
    });
    if (clima === 'cult') {
      params.set('primary_release_date.lte', `${new Date().getFullYear() - 15}-12-31`);
      params.set('vote_count.gte', '300');
    }
    return obterJson(`/discover/movie?${params}`);
  }));
  const resumos = lotes.flatMap(dado => dado.results || []).slice(0, pages.length * 12);
  return (await Promise.all(resumos.map(item => detalhes(item.id).catch(() => null)))).filter(Boolean);
}

const relatorio = [];
const filtroClimas = process.argv.find(arg => arg.startsWith('--climas='))?.split('=')[1]?.split(',');
const climasAtivos = filtroClimas?.length ? Object.keys(climas).filter(clima => filtroClimas.includes(clima)) : Object.keys(climas);
for (const clima of climasAtivos) {
  for (let sessao = 1; sessao <= 3; sessao += 1) {
    const inicio = performance.now();
    const requisicoesAntes = requisicoesTmdb;
    const paginasPorSessao = ['chorar', 'romance', 'medo', 'pensar'].includes(clima) ? 2 : 1;
    const primeiraPagina = (sessao - 1) * paginasPorSessao + 1;
    const paginas = Array.from({ length: paginasPorSessao }, (_, indice) => primeiraPagina + indice);
    const lista = await candidatos(clima, paginas);
    const candidatosComQualidade = lista.filter(temQualidadeMinimaTmdb);
    const elegiveis = candidatosComQualidade.filter(item => avaliarCompatibilidadeClima(item, clima).elegivel);
    const escolhidos = recomendarDaLista({
      candidatos: candidatosComQualidade,
      clima,
      tipo: 'filme',
      limite: 3,
      random: () => 0.37
    });
    relatorio.push({
      clima,
      sessao,
      duracao_ms: Math.round(performance.now() - inicio),
      paginas_consultadas: paginas,
      requisicoes_tmdb: requisicoesTmdb - requisicoesAntes,
      analisados: lista.length,
      descartados_qualidade: lista.length - candidatosComQualidade.length,
      elegiveis: elegiveis.length,
      completos: escolhidos.length === 3,
      filmes: escolhidos.map(item => ({
        nome: item.nome,
        ano: item.ano,
        generos: item.generos,
        nota: item.media_tmdb,
        votos: item.votos_tmdb,
        aderencia: avaliarCompatibilidadeClima(item, clima).pontos,
        palavras_chave: item.palavras_chave.slice(0, 10),
        sinopse: item.sinopse
      }))
    });
  }
}

const compacto = process.argv.includes('--compact');
const incompletas = relatorio.filter(item => !item.completos);
const duracaoTotal = relatorio.reduce((total, item) => total + item.duracao_ms, 0);
const modoRelatorio = process.argv.includes('--report');

if (modoRelatorio) {
  imprimirRelatorioResumido();
} else {
  imprimirRelatorioDetalhado();
}

function imprimirRelatorioDetalhado() {
  for (const item of relatorio) {
    console.log(`MÉTRICAS duração=${item.duracao_ms}ms páginas=${item.paginas_consultadas.join(',')} requisições_tmdb=${item.requisicoes_tmdb}`);
    console.log(`\n${nomes[item.clima]} | sessão ${item.sessao} | ${item.elegiveis}/${item.analisados} elegíveis | baixa_qualidade=${item.descartados_qualidade} | trio=${item.completos ? 'sim' : 'não'}`);
    item.filmes.forEach((filme, indice) => {
      console.log(`${indice + 1}. ${filme.nome} (${filme.ano || '?'}) | ${filme.generos.join(', ')} | nota=${filme.nota ?? '-'} votos=${filme.votos}`);
      if (!compacto) {
        console.log(`   temas: ${filme.palavras_chave.join(', ') || '-'}`);
        console.log(`   sinopse: ${filme.sinopse || '-'}`);
      }
    });
  }
  console.log(`MÉTRICAS_GERAIS duração=${duracaoTotal}ms requisições_tmdb=${requisicoesTmdb}`);
  console.log(`\nRESUMO sessoes=${relatorio.length} completas=${relatorio.length - incompletas.length} incompletas=${incompletas.length}`);
  if (incompletas.length) console.log(`INCOMPLETAS ${incompletas.map(item => `${item.clima}:${item.sessao}`).join(',')}`);
}

function imprimirRelatorioResumido() {
  console.log('AUDITORIA DOS CLIMAS');
  for (const clima of climasAtivos) {
    const sessoes = relatorio.filter(item => item.clima === clima);
    const completas = sessoes.filter(item => item.completos).length;
    const descartados = sessoes.reduce((total, item) => total + item.descartados_qualidade, 0);
    const duracao = sessoes.reduce((total, item) => total + item.duracao_ms, 0);
    console.log(`${nomes[clima]}: ${completas}/${sessoes.length} completas | baixa_qualidade=${descartados} | ${duracao}ms`);
  }

  const descartadosTotal = relatorio.reduce((total, item) => total + item.descartados_qualidade, 0);
  const revisao = new Map();
  relatorio.flatMap(item => item.filmes.map(filme => ({ ...filme, clima: item.clima })))
    .filter(filme => filme.aderencia <= 6)
    .forEach(filme => revisao.set(`${filme.clima}:${filme.nome}`, filme));

  console.log(`\nResumo: ${relatorio.length} sessões | ${relatorio.length - incompletas.length} completas | ${incompletas.length} incompletas`);
  console.log(`Qualidade: ${descartadosTotal} candidatos descartados por nota ou votos`);
  console.log(`Desempenho: ${duracaoTotal}ms | ${requisicoesTmdb} requisições ao TMDB`);
  console.log(`Incompletas: ${incompletas.length ? incompletas.map(item => `${nomes[item.clima]}:${item.sessao}`).join(', ') : 'nenhuma'}`);
  console.log(`Revisão manual: ${revisao.size ? [...revisao.values()].slice(0, 12).map(item => `${nomes[item.clima]} — ${item.nome}`).join('; ') : 'nenhuma'}`);
  console.log(`RESULTADO: ${incompletas.length ? 'ATENÇÃO' : 'APROVADO'}`);
}
