// Cache leve de tela: acelera a primeira pintura sem substituir o Supabase.

export function lerCache(chave, { maxAgeMs = 10 * 60 * 1000 } = {}) {
  try {
    const pacote = JSON.parse(sessionStorage.getItem(chave) || 'null');
    if (!pacote || !Number.isFinite(pacote.salvoEm)) return null;
    if (Date.now() - pacote.salvoEm > maxAgeMs) return null;
    return pacote.valor ?? null;
  } catch {
    return null;
  }
}

export function salvarCache(chave, valor) {
  try {
    sessionStorage.setItem(chave, JSON.stringify({
      salvoEm: Date.now(),
      valor
    }));
  } catch {
    // Se o navegador não permitir armazenamento, o app segue usando o Supabase.
  }
}

export function removerCachePorPrefixo(prefixo) {
  try {
    Object.keys(sessionStorage)
      .filter(chave => chave.startsWith(prefixo))
      .forEach(chave => sessionStorage.removeItem(chave));
  } catch {
    // Cache é só melhoria de experiência.
  }
}
