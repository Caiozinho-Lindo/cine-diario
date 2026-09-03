// Regras puras do recomendador. Mantidas separadas da interface para permitir testes.

const GENEROS_POR_CLIMA = {
  rir: ['comedia', 'familia', 'animacao', 'romance'],
  emocao: ['drama', 'romance', 'musica', 'familia'],
  tensao: ['thriller', 'terror', 'misterio', 'crime', 'acao'],
  pensar: ['ficcao cientifica', 'documentario', 'misterio', 'historia', 'drama'],
  qualquer: []
};

export function recomendarDaLista({
  candidatos,
  historico = [],
  participantes = [],
  tipo = 'filme',
  duracaoMax = null,
  clima = 'qualquer',
  streamings = [],
  referencia = null,
  limite = 3,
  random = Math.random
}) {
  const permitidos = new Set(streamings);
  const limiteDuracao = Number(duracaoMax);
  const elegiveis = candidatos
    .filter(titulo => titulo.tipo === tipo)
    .filter(titulo => !Number.isFinite(limiteDuracao)
      || limiteDuracao <= 0
      || !titulo.duracao_minutos
      || titulo.duracao_minutos <= limiteDuracao)
    .filter(titulo => {
      if (!permitidos.size) return true;
      return (titulo.provedores || []).some(provedor => permitidos.has(provedor.slug || provedor));
    })
    .map(titulo => ({
      ...titulo,
      pontuacaoRecomendacao: pontuarTitulo(titulo, {
        historico,
        participantes,
        clima,
        permitidos,
        referencia
      })
    }))
    .sort((a, b) => b.pontuacaoRecomendacao - a.pontuacaoRecomendacao);

  if (elegiveis.length <= limite) return elegiveis;

  // Duas escolhas seguras e uma surpresa entre as próximas opções bem colocadas.
  const seguros = elegiveis.slice(0, Math.max(1, limite - 1));
  const faixaSurpresa = elegiveis.slice(seguros.length, Math.min(elegiveis.length, seguros.length + 5));
  const surpresa = faixaSurpresa[Math.floor(random() * faixaSurpresa.length)];
  return [...seguros, surpresa].filter(Boolean).slice(0, limite);
}

export function misturarOrigens(lista, novas, { limite = 3, random = Math.random } = {}) {
  const daLista = deduplicar(lista);
  const sugestoes = deduplicar(novas);
  if (!daLista.length) return sugestoes.slice(0, limite);
  if (!sugestoes.length) return daLista.slice(0, limite);

  const escolhidos = [daLista[0], sugestoes[0]];
  const usados = new Set(escolhidos.map(chaveTitulo));
  const restantes = [...daLista.slice(1), ...sugestoes.slice(1)]
    .filter(item => !usados.has(chaveTitulo(item)))
    .sort((a, b) => (b.pontuacaoRecomendacao || 0) - (a.pontuacaoRecomendacao || 0));

  while (escolhidos.length < limite && restantes.length) {
    const faixa = restantes.splice(0, Math.min(5, restantes.length));
    const indice = Math.floor(random() * faixa.length);
    escolhidos.push(faixa[indice]);
    restantes.unshift(...faixa.filter((_, atual) => atual !== indice));
  }
  return escolhidos.slice(0, limite);
}

export function pontuarTitulo(titulo, {
  historico = [],
  participantes = [],
  clima = 'qualquer',
  permitidos = new Set(),
  referencia = null
} = {}) {
  const generos = normalizarLista(titulo.generos);
  const generosClima = GENEROS_POR_CLIMA[clima] || [];
  let pontos = clima === 'qualquer'
    ? 1
    : generos.filter(genero => generosClima.includes(genero)).length * 3;

  if (permitidos.size && (titulo.provedores || []).some(item => permitidos.has(item.slug || item))) pontos += 2;
  if (titulo.origem_recomendacao === 'lista') pontos += Math.min(1, diasNaLista(titulo.criado_em) / 180);

  participantes.forEach(usuarioId => {
    pontos += afinidadeDoParticipante(titulo, historico, usuarioId);
  });

  if (referencia) pontos += calcularSemelhancaReferencia(titulo, referencia) * 2.5;

  const usuariosCompativeis = Number(titulo.usuarios_compativeis) || 0;
  const membrosCompativeis = Number(titulo.membros_compativeis) || 0;
  if (usuariosCompativeis) pontos += Math.log2(usuariosCompativeis + 1) * 2;
  if (membrosCompativeis) pontos += membrosCompativeis * 1.5;

  const mediaTmdb = Number(titulo.media_tmdb);
  if (Number.isFinite(mediaTmdb) && mediaTmdb > 0) pontos += Math.max(-1, mediaTmdb - 6) * 0.55;

  return Number(pontos.toFixed(3));
}

export function calcularSemelhancaReferencia(titulo, referencia) {
  if (!titulo || !referencia) return 0;
  let pontos = 0;
  pontos += intersecao(titulo.generos, referencia.generos) * 4;
  pontos += intersecao(titulo.palavras_chave, referencia.palavras_chave) * 5;
  pontos += intersecao(titulo.pessoas_chave, referencia.pessoas_chave) * 2;
  pontos += intersecao(titulo.paises_origem, referencia.paises_origem);

  if (titulo.idioma_original && titulo.idioma_original === referencia.idioma_original) pontos += 1;
  if (mesmaDecada(titulo.ano, referencia.ano)) pontos += 1;
  if (titulo.colecao_id && titulo.colecao_id === referencia.colecao_id) pontos += 8;
  if ((referencia.recomendacoes_tmdb || []).map(String).includes(String(titulo.tmdb_id))) pontos += 6;
  return pontos;
}

export function motivosDaRecomendacao(titulo, {
  historico = [],
  participantes = [],
  referencia = null
} = {}) {
  const motivos = [];
  if (referencia && calcularSemelhancaReferencia(titulo, referencia) > 0) {
    motivos.push(`Porque é parecido com “${referencia.nome}”`);
  }

  const usuarios = Number(titulo.usuarios_compativeis) || 0;
  if (usuarios > 0) {
    motivos.push(`${usuarios} ${usuarios === 1 ? 'pessoa com gosto parecido deu' : 'pessoas com gosto parecido deram'} nota 8 ou mais`);
  }

  const genero = generoBemAvaliadoEmComum(titulo, historico, participantes);
  if (genero) motivos.push(`Porque o espaço costuma gostar de ${genero}`);

  const mediaTmdb = Number(titulo.media_tmdb);
  if (motivos.length < 2 && Number.isFinite(mediaTmdb) && mediaTmdb >= 7.5) {
    motivos.push(`Bem avaliado pelo público: ${mediaTmdb.toFixed(1).replace('.', ',')}/10`);
  }

  if (!motivos.length) motivos.push('Combina com o clima escolhido para hoje');
  return motivos.slice(0, 2);
}

export function generosDoClima(clima) {
  return [...(GENEROS_POR_CLIMA[clima] || [])];
}

export function formatarDuracao(minutos) {
  const valor = Number(minutos);
  if (!Number.isFinite(valor) || valor <= 0) return 'Duração não informada';
  const horas = Math.floor(valor / 60);
  const restante = valor % 60;
  if (!horas) return `${restante} min`;
  return restante ? `${horas}h${String(restante).padStart(2, '0')}` : `${horas}h`;
}

function afinidadeDoParticipante(candidato, historico, usuarioId) {
  if (!usuarioId) return 0;
  const amostras = [];

  historico.forEach(titulo => {
    const avaliacao = (titulo.avaliacoesMembros || [])
      .find(item => item.membro.usuario_id === usuarioId)?.avaliacao;
    if (!avaliacao) return;

    const proximidade = Math.max(0,
      intersecao(candidato.generos, titulo.generos) * 2
      + intersecao(candidato.palavras_chave, titulo.palavras_chave) * 3
      + intersecao(candidato.pessoas_chave, titulo.pessoas_chave)
    );
    if (!proximidade) return;

    const nota = Number(avaliacao.nota);
    let contribuicao = (nota - 5) * proximidade;
    if (nota <= 5) contribuicao -= (6 - nota) * proximidade;
    // No Cine Diário, notas abaixo de 7 representam “não assistiria novamente”.
    if (nota < 7) contribuicao -= proximidade;
    amostras.push(contribuicao);
  });

  if (!amostras.length) return 0;
  return amostras.reduce((soma, valor) => soma + valor, 0) / amostras.length;
}

function generoBemAvaliadoEmComum(titulo, historico, participantes) {
  const nomesGeneros = new Map((titulo.generos || []).map(genero => [normalizarTexto(genero), genero]));
  const generosCandidato = [...nomesGeneros.keys()];
  const placar = new Map();
  historico.forEach(item => {
    const notas = (item.avaliacoesMembros || [])
      .filter(avaliacao => participantes.includes(avaliacao.membro.usuario_id) && avaliacao.avaliacao)
      .map(avaliacao => Number(avaliacao.avaliacao.nota));
    if (!notas.some(nota => nota >= 8)) return;
    normalizarLista(item.generos)
      .filter(genero => generosCandidato.includes(genero))
      .forEach(genero => placar.set(genero, (placar.get(genero) || 0) + 1));
  });
  const melhor = [...placar.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  return melhor ? nomesGeneros.get(melhor) || melhor : null;
}

function intersecao(a = [], b = []) {
  const direita = new Set(normalizarLista(b));
  return normalizarLista(a).filter(item => direita.has(item)).length;
}

function normalizarLista(valores = []) {
  return (valores || []).map(normalizarTexto).filter(Boolean);
}

function normalizarTexto(valor) {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function mesmaDecada(anoA, anoB) {
  const a = Number(anoA);
  const b = Number(anoB);
  return Number.isFinite(a) && Number.isFinite(b) && Math.floor(a / 10) === Math.floor(b / 10);
}

function deduplicar(lista) {
  const vistos = new Set();
  return (lista || []).filter(item => {
    const chave = chaveTitulo(item);
    if (vistos.has(chave)) return false;
    vistos.add(chave);
    return true;
  });
}

function chaveTitulo(titulo) {
  return `${titulo.tipo}:${titulo.tmdb_id || titulo.id}`;
}

function diasNaLista(data) {
  const timestamp = new Date(data || 0).getTime();
  if (!Number.isFinite(timestamp) || timestamp <= 0) return 0;
  return Math.max(0, (Date.now() - timestamp) / 86_400_000);
}
