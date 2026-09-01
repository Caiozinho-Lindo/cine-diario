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
      pontuacaoRecomendacao: pontuarTitulo(titulo, { historico, participantes, clima, permitidos })
    }))
    .sort((a, b) => b.pontuacaoRecomendacao - a.pontuacaoRecomendacao);

  if (elegiveis.length <= limite) return elegiveis;

  // Duas escolhas seguras e uma surpresa entre as próximas opções bem colocadas.
  const seguros = elegiveis.slice(0, Math.max(1, limite - 1));
  const faixaSurpresa = elegiveis.slice(seguros.length, Math.min(elegiveis.length, seguros.length + 5));
  const surpresa = faixaSurpresa[Math.floor(random() * faixaSurpresa.length)];
  return [...seguros, surpresa].filter(Boolean).slice(0, limite);
}

export function pontuarTitulo(titulo, { historico = [], participantes = [], clima = 'qualquer', permitidos = new Set() } = {}) {
  const generos = normalizarGeneros(titulo.generos);
  const generosClima = GENEROS_POR_CLIMA[clima] || [];
  let pontos = clima === 'qualquer' ? 1 : generos.filter(genero => generosClima.includes(genero)).length * 3;

  if (permitidos.size && (titulo.provedores || []).some(item => permitidos.has(item.slug || item))) pontos += 2;
  pontos += Math.min(1, diasNaLista(titulo.criado_em) / 180);

  const afinidades = participantes.map(usuarioId => afinidadeDoParticipante(generos, historico, usuarioId));
  afinidades.forEach(afinidade => { pontos += afinidade; });

  if (afinidades.length > 1 && afinidades.every(valor => valor > 0)) pontos += 2;
  if (afinidades.some(valor => valor <= -2)) pontos -= 4;

  return Number(pontos.toFixed(3));
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

function afinidadeDoParticipante(generosCandidato, historico, usuarioId) {
  if (!usuarioId || !generosCandidato.length) return 0;
  const amostras = [];

  historico.forEach(titulo => {
    const avaliacao = (titulo.avaliacoesMembros || [])
      .find(item => item.membro.usuario_id === usuarioId)?.avaliacao;
    if (!avaliacao) return;

    const intersecao = normalizarGeneros(titulo.generos)
      .filter(genero => generosCandidato.includes(genero)).length;
    if (intersecao) amostras.push((Number(avaliacao.nota) - 5) * intersecao);
  });

  if (!amostras.length) return 0;
  return amostras.reduce((soma, valor) => soma + valor, 0) / amostras.length;
}

function normalizarGeneros(generos = []) {
  return generos.map(normalizarTexto).filter(Boolean);
}

function normalizarTexto(valor) {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function diasNaLista(data) {
  const timestamp = new Date(data || 0).getTime();
  if (!Number.isFinite(timestamp) || timestamp <= 0) return 0;
  return Math.max(0, (Date.now() - timestamp) / 86_400_000);
}
