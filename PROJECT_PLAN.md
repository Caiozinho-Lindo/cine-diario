# Plano de trabalho — Cine Diário

Atualizado em 19/09/2026.

Este arquivo registra a ordem de prioridade combinada para as próximas rodadas do projeto.

## Estado atual

- [x] 1. Fazer um teste visual completo no navegador dos fluxos **Três sugestões novas**, **Descobrir** e **Catálogo**.
- [x] 2. Medir o tempo das recomendações. O fluxo real registra no console duração total, páginas consultadas, requisições efetivas ao TMDB, candidatos, elegíveis e resultados; a auditoria também inclui duração e requisições por sessão e no resumo.

## Próximas prioridades

- [x] 3. Evitar recomendações de baixa qualidade usando limites mínimos de nota e votos. Sugestões externas exigem ao menos 20 votos e uma nota progressiva conforme a confiabilidade da amostra; o filtro vale em **Três sugestões novas** e **Descobrir** e é acompanhado pela auditoria.
- [x] 5. Revisar **Tensão**. Thriller continua sendo um sinal direto; crime, ação, guerra e faroeste isolados não bastam sem suspense, investigação, perigo, ameaça, perseguição ou outro sinal concreto de tensão.
- [x] 6. Refinar **Algo real**. Documentários e notícias entram diretamente; os demais títulos precisam indicar biografia, fatos reais, figura ou evento histórico identificável. História ou guerra isoladas e ficção histórica sem vínculo factual são rejeitadas.

## Demais itens

- [x] 4. Refinar **Romance** e **Medo** com busca focada no gênero principal e até oito páginas para sugestões novas, sem afrouxar os filtros de compatibilidade, nota ou votos. A auditoria usa duas páginas distintas por sessão nesses climas.
- [x] 7. Consolidar `formatarNota` em `js/statistics.js`, arredondando para notas terminadas em `,0` ou `,5`, com vírgula decimal e tratamento uniforme para valores ausentes ou inválidos.
- [x] 8. Manter `scripts/audit-all-moods.mjs` como verificação interna via `npm run audit:moods`, gerando um resumo por clima com sessões incompletas, descartes de qualidade, desempenho e títulos de menor aderência para revisão manual.
- [ ] 9. Criar um commit da rodada atual para estabelecer um ponto de restauração antes das próximas melhorias.

## Ordem combinada

Começar pelos itens **1, 3, 5 e 6**, pois afetam diretamente a experiência e a qualidade das sugestões. Como o item 1 já foi executado, a próxima sequência é **3 → 5 → 6**, terminando com nova auditoria e o commit da rodada.

## Última auditoria completa

Executada em 19/09/2026 após os refinamentos: **30/30 sessões completas**, 546 requisições ao TMDB e nenhum trio incompleto.

A revisão qualitativa levou a uma rodada adicional de filtros:

- **Chorar:** musicais românticos sem sinal emocional forte e romances tóxicos foram retirados; a busca passou a usar duas páginas por sessão.
- **Romance:** thrillers, violência doméstica, abuso, infidelidade, relações tóxicas e conflitos conjugais passaram a ser rejeitados.
- **Pensar:** mistério ou ação isolados não bastam; documentários puramente de entretenimento também são rejeitados, e a busca usa duas páginas por sessão.

Após o refinamento, esses três climas fecharam **9/9 sessões**, sem repetir os falsos positivos que motivaram a mudança. Permanecem como observações futuras a amostra pequena de alguns lançamentos em **Leve** e escolhas biográficas discutíveis em **Algo real**.
