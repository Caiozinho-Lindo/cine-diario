# Plano de trabalho — Cine Diário

Atualizado em 24/09/2026.

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

## Decisões futuras — Seus espaços

As regras funcionais abaixo continuam planejadas para rodadas futuras. A primeira etapa visual de **Seus espaços** no Perfil foi implementada em 24/09/2026, reutilizando apenas os dados e as ações que já existiam.

- Todo usuário novo terá um espaço individual chamado **Meu Cine Diário**. O limite será de um espaço Individual por vez; após sua exclusão definitiva, o usuário poderá criar outro.
- O onboarding futuro perguntará se o usuário pretende usar o produto com outras pessoas, se possui um código de convite e se deseja criar outro espaço.
- Os tipos iniciais serão **Individual**, **Casal** e **Amigos**, com identidade visual e regras coletivas adequadas a cada contexto. Cada usuário poderá ter apenas um espaço Individual. Casal terá no máximo dois participantes; Amigos não terá limite inicial.
- Individual que receber um convite deverá ser convertido em Casal ou Amigos. Casal que perder um participante continuará Casal; Amigos continuará Amigos independentemente de ficar com apenas duas pessoas, sem conversão automática.
- A criação usará um formulário curto com nome, tipo e escolha entre tema fixo do espaço ou tema pessoal do usuário.
- No tema fixo, todos veem o tema escolhido para o espaço. No tema pessoal, cada participante vê o mesmo espaço com o próprio tema.
- O administrador poderá alterar posteriormente o tema fixo ou alternar entre tema fixo e tema pessoal.
- Perfil, preferências pessoais e gosto aprendido pertencem ao usuário; catálogo, lista para assistir, participantes, convites e atividade pertencem ao espaço.
- Ao encontrar em outro espaço um título já avaliado, o usuário poderá copiar a avaliação ou criar uma avaliação específica. A cópia não permanecerá sincronizada com a original.
- Todos os participantes poderão adicionar títulos. Apenas quem adicionou e o administrador poderão editar ou remover o título.
- Ao remover outra pessoa, quem remove decide se as avaliações dela permanecem visíveis no espaço. Se não permanecerem, continuam privadas na conta da pessoa. Ao sair por conta própria, a pessoa confirma a remoção da visibilidade das avaliações no espaço, mantendo seu histórico privado.
- Quando o autor de um título sair, o administrador assume o registro e decide se o manté ou exclui.
- Quando vários autores saírem, o administrador usará uma tela de decisão em lote para escolher quais títulos e avaliações permanecem.
- O administrador poderá transferir a administração de forma imediata, perdendo o cargo após confirmação. Se sair sem transferir, o cargo passa ao participante mais antigo ainda presente; em empate, vence quem esteve ativo mais recentemente.
- Convites terão código e link, expirarão em sete dias, serão de uso único e poderão ser cancelados antes do vencimento.
- A atividade recente considerará acesso ao espaço, inclusão ou edição de título, avaliação e participação em sessão ou recomendação.
- Espaços arquivados permanecerão visíveis em modo somente leitura por 30 dias e poderão ser restaurados por qualquer participante. Após a restauração, haverá carência de sete dias para um novo arquivamento.
- Exclusão definitiva exigirá digitar o nome do espaço. Em Amigos, exigirá aprovação de mais de 50% dos membros ativos nos 30 dias anteriores e, se houver mais de um membro no espaço, no mínimo duas aprovações. Em Casal, exigirá aprovação dos dois enquanto ambos ainda forem membros, independentemente da atividade recente.
- Avisos de arquivamento, restauração, votação e exclusão serão inicialmente exibidos apenas dentro do aplicativo, sem envio de e-mail.
- A seção permanecerá no Perfil. O espaço ativo terá destaque **Espaço atual**; os demais terão ação **Trocar para este espaço**.
- Cada card mostrará nome, tipo, participantes, quantidade de títulos, última atividade, prévia numérica e indicação de administrador.
