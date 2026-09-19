import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const recommendJs = await readFile(new URL('../js/pages/recommend.js', import.meta.url), 'utf8');
const recommendCss = await readFile(new URL('../css/recommend.css', import.meta.url), 'utf8');
const sessoesJs = await readFile(new URL('../js/sessoes.js', import.meta.url), 'utf8');
const discoveryJs = await readFile(new URL('../js/discovery.js', import.meta.url), 'utf8');
const tmdbJs = await readFile(new URL('../js/tmdb.js', import.meta.url), 'utf8');
const blocksJs = await readFile(new URL('../js/recommendationBlocks.js', import.meta.url), 'utf8');
const blockMigration = await readFile(new URL('../supabase/migrations/010_recomendacoes_bloqueadas.sql', import.meta.url), 'utf8');
const homeHtml = await readFile(new URL('../pages/home.html', import.meta.url), 'utf8');
const recommendHtml = await readFile(new URL('../pages/recommend.html', import.meta.url), 'utf8');

test('a escolha concluída não repete explicações sobre a próxima visita', () => {
  assert.doesNotMatch(recommendJs, /Na próxima visita/);
  assert.doesNotMatch(recommendJs, /aviso discreto aparecerá no Início/);
  assert.doesNotMatch(recommendJs, /session-side/);
  assert.match(recommendCss, /\.session-layout\s*\{\s*display:\s*block/);
});

test('uma sessão pendente pode ser cancelada sem remover o título', () => {
  assert.match(recommendJs, /Cancelar escolha/);
  assert.match(recommendJs, /cancelarSessao\(sessaoPendente\.id\)/);
  assert.match(sessoesJs, /rpc\('cancelar_sessao'/);
  assert.doesNotMatch(sessoesJs, /\.from\('titulos'\).*delete/s);
});

test('sugestões permitem bloquear um título nos detalhes', () => {
  assert.match(recommendJs, /data-details/);
  assert.match(recommendJs, /bloquearFinalista/);
  assert.match(recommendJs, /filtrarRecomendacoesBloqueadas/);
  assert.match(discoveryJs, /Não recomendar este título/);
  assert.match(discoveryJs, /onBloquear/);
  assert.match(blocksJs, /usuario_recomendacoes_bloqueadas/);
});

test('bloqueio de recomendação é preparado para sincronizar entre dispositivos', () => {
  assert.match(blockMigration, /create table if not exists public\.usuario_recomendacoes_bloqueadas/);
  assert.match(blockMigration, /usuario_id uuid not null references auth\.users/);
  assert.match(blockMigration, /primary key \(usuario_id, tipo, chave\)/);
  assert.match(blockMigration, /enable row level security/);
  assert.match(blockMigration, /usuario_id = auth\.uid\(\)/);
});

test('ações de sortear ou pedir outras opções usam só o dado visível', () => {
  assert.doesNotMatch(homeHtml, /Ainda em dúvida\? Sortear/);
  assert.doesNotMatch(homeHtml, /Mostrar outras três opções/);
  assert.doesNotMatch(recommendHtml, /Ainda em dúvida\? Sortear/);
  assert.doesNotMatch(recommendHtml, /Mostrar outras três opções/);
  assert.match(homeHtml, /id="recommend-raffle"[^>]+aria-label="Sortear uma opção"[^>]*>🍀<\/button>/);
  assert.match(homeHtml, /id="recommend-more"[^>]+aria-label="Mostrar outras opções"[^>]*>🎲<\/button>/);
  assert.match(recommendHtml, /id="recommend-raffle"[^>]+aria-label="Sortear uma opção"[^>]*>🍀<\/button>/);
  assert.match(recommendHtml, /id="recommend-more"[^>]+aria-label="Mostrar outras opções"[^>]*>🎲<\/button>/);
});

test('inspiração da vez mostra capas e pode ser automática por clima', () => {
  assert.match(homeHtml, /Inspiração da vez/);
  assert.match(recommendHtml, /Inspiração da vez/);
  assert.doesNotMatch(homeHtml, /datalist id="recommend-reference-options"/);
  assert.match(homeHtml, /class="reference-options"/);
  assert.match(recommendJs, /selecionarReferenciaAutomatica/);
  assert.match(recommendJs, /avaliarCompatibilidadeClima\(titulo,\s*clima\)/);
  assert.doesNotMatch(recommendJs, /inspirado automaticamente em/);
  assert.doesNotMatch(recommendJs, /parecido com/);
  assert.match(recommendJs, /safeImageSrc\(titulo\.capa_url\)/);
  assert.doesNotMatch(recommendJs, /finalist-reasons/);
  assert.match(recommendCss, /\.reference-option img/);
});

test('sugestão nova busca com mais abrangência sem deixar a inspiração automática mandar no gênero', () => {
  assert.match(recommendJs, /carregarDescobertasAbrangentes/);
  assert.match(recommendJs, /const referenciaDeBusca = referencia \? referenciaCompleta : null/);
  assert.match(recommendJs, /const maximoDePaginas = origem === 'novas' \? \(climaEscasso \? 8 : 6\) : 4/);
  assert.match(recommendJs, /const paginasPorLote = 2/);
  assert.match(recommendJs, /Promise\.all\(paginas\.map/);
  assert.match(recommendJs, /limiteDetalhes: 10/);
  assert.match(recommendJs, /proximaPaginaDescoberta/);
  assert.match(recommendJs, /candidatosNovosReserva/);
  assert.match(recommendJs, /new Map\(combinados\)/);
  assert.match(recommendJs, /selecionarTrioVariado/);
  assert.match(recommendJs, /triosExibidos/);
  assert.match(recommendJs, /idsVistosNaSessao/);
  assert.match(recommendJs, /3 - finalistas\.length/);
  assert.match(recommendJs, /if \(finalistas\.length < 3\) finalistas = \[\]/);
  assert.doesNotMatch(recommendJs, /Voltamos ao início da seleção/);
});

test('prepara referência e histórico em paralelo antes de recomendar', () => {
  assert.match(recommendJs, /Promise\.all\(\[\s*enriquecerReferencia\(\),\s*prepararHistorico\(\)\s*\]\)/);
});

test('a descoberta permite limitar os detalhes completos buscados por página', () => {
  assert.match(tmdbJs, /limiteDetalhes = 18/);
  assert.match(tmdbJs, /Math\.min\(Number\(limiteDetalhes\) \|\| 18, 18\)/);
});

test('mede o desempenho real de cada rodada de recomendações', () => {
  assert.match(tmdbJs, /iniciarMedicaoTmdb/);
  assert.match(tmdbJs, /finalizarMedicaoTmdb/);
  assert.match(tmdbJs, /requisicoes_tmdb/);
  assert.match(tmdbJs, /paginas_consultadas/);
  assert.match(recommendJs, /duracao_total_ms/);
  assert.match(recommendJs, /candidatos: medicaoRecomendacao\.candidatos\.size/);
  assert.match(recommendJs, /elegiveis: medicaoRecomendacao\.elegiveis\.size/);
  assert.match(recommendJs, /\[métricas recomendação\]/);
});

test('sugestões novas descartam títulos sem qualidade mínima no TMDB', () => {
  assert.match(recommendJs, /temQualidadeMinimaTmdb/);
  assert.match(recommendJs, /\.filter\(temQualidadeMinimaTmdb\)/);
  assert.match(discoveryJs, /temQualidadeMinimaTmdb/);
  assert.match(discoveryJs, /\.filter\(temQualidadeMinimaTmdb\)/);
  assert.match(tmdbJs, /votos_tmdb: Number\(r\.vote_count\) \|\| 0/);
});

test('climas mais escassos usam buscas do TMDB mais focadas', () => {
  assert.match(tmdbJs, /clima === 'chorar'/);
  assert.match(tmdbJs, /18,10749/);
  assert.match(tmdbJs, /clima === 'cult'/);
  assert.match(tmdbJs, /primary_release_date\.lte/);
  assert.match(tmdbJs, /vote_count\.gte/);
  assert.match(tmdbJs, /pensar: \[9648, 99, 36\]/);
  assert.match(tmdbJs, /clima === 'romance'/);
  assert.match(tmdbJs, /params\.set\('with_genres', '10749'\)/);
  assert.match(tmdbJs, /clima === 'medo'/);
  assert.match(tmdbJs, /params\.set\('with_genres', '27'\)/);
  assert.match(recommendJs, /\['chorar', 'romance', 'medo', 'pensar'\]\.includes\(clima\)/);
  assert.match(recommendJs, /climaEscasso \? 8 : 6/);
});

test('Descobrir guarda buscas pesadas em memória para responder mais rápido', () => {
  assert.match(discoveryJs, /criarCacheRodadasDescoberta/);
  assert.match(discoveryJs, /temPronta/);
  assert.match(discoveryJs, /preparar/);
  assert.match(tmdbJs, /detalhesCache/);
  assert.match(tmdbJs, /relacionadosCache/);
});
