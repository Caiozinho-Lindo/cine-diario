# 🎬 Cine Diário

Um diário de filmes e séries para uso individual ou compartilhado. Cada pessoa mantém sua própria nota e observação, enquanto o espaço reúne catálogo, lista para assistir, médias e estatísticas.

O projeto é um site estático em HTML, CSS e JavaScript, com Supabase para autenticação e banco de dados e TMDB para pesquisa de títulos.

## Funcionalidades

- cadastro, confirmação de e-mail, recuperação de senha e sessão lembrada;
- perfil com nome, avatar, tema e cor de destaque;
- um ou vários espaços por pessoa;
- convites por código ou link, válidos por sete dias;
- administradores que convidam, removem e alteram o papel dos participantes;
- avaliações individuais e visão geral do espaço;
- catálogo com pesquisa no TMDB, filtros e inclusão no mesmo fluxo;
- lista “Para assistir” integrada às recomendações;
- recomendador “Escolher hoje”, com clima, participantes e streamings;
- três finalistas, sorteio e sessão pendente até todos os participantes avaliarem;
- destaques e estatísticas adaptados à quantidade real de participantes.

## Modelo de dados

- `perfis`: identidade pública e personalização da conta;
- `espacos`: catálogos individuais ou compartilhados;
- `espaco_membros`: participação e papel (`administrador` ou `participante`);
- `espaco_convites`: código temporário usado também nos links de convite;
- `titulos`: filmes e séries pertencentes a um espaço;
- `avaliacoes`: nota e observação vinculadas ao autor;
- `biblioteca_usuario`: situação pessoal de cada título;
- `preferencias_usuario`: preferências privadas reservadas para evolução futura.
- `usuario_streamings`: serviços disponíveis para cada pessoa;
- `sessoes` e `sessao_participantes`: escolhas pendentes e confirmações individuais.

## Migrações

Os arquivos ficam em `supabase/migrations/` e devem ser executados na ordem numérica.

1. `001_corrigir_schema_e_rls.sql`
2. `002_multiusuario_espacos.sql`
3. `003_validar_migracao_multiusuario.sql` para conferir a migração histórica
4. `004_convites_e_papeis.sql`
5. `005_finalizar_nomes_de_tema.sql`, somente depois de publicar o código novo
6. `006_recomendador_e_sessoes.sql`
7. `007_recomendacoes_compativeis.sql`

A migração 004 cria os convites, simplifica os papéis, remove classificações de espaço e elimina a preferência de página inicial. A migração 005 encerra a compatibilidade temporária com a versão anterior do site. A migração 007 adiciona recomendações anônimas entre usuários compatíveis, sem expor identidades ou avaliações individuais. Antes de qualquer migração no ambiente online, exporte as tabelas principais e confira as contagens.

## Estrutura principal

```text
/
├── index.html
├── config.example.js
├── css/
├── js/
│   ├── auth.js
│   ├── compatibility.js
│   ├── espacos.js
│   ├── filters.js
│   ├── statistics.js
│   ├── recommendations.js
│   ├── sessoes.js
│   ├── streamings.js
│   ├── themes.js
│   ├── titulos.js
│   ├── tmdb.js
│   ├── ui.js
│   └── pages/
│       ├── login.js
│       ├── home.js
│       ├── catalog.js
│       ├── details.js
│       ├── edit.js
│       ├── profile.js
│       └── recommend.js
├── pages/
│   ├── home.html
│   ├── catalog.html
│   ├── details.html
│   ├── edit.html
│   ├── profile.html
│   ├── recommend.html
│   └── wishlist.html
└── supabase/migrations/
```

## Configuração

Copie `config.example.js` para `config.js` e preencha somente valores próprios para uso público no navegador:

```js
window.APP_CONFIG = {
  SUPABASE_URL: "https://xxxx.supabase.co",
  SUPABASE_ANON_KEY: "sua-chave-anon-ou-publishable",
  TMDB_READ_TOKEN: "seu-token-de-leitura-do-tmdb"
};
```

Nunca coloque `service_role`, senha do banco ou outro segredo no site. A proteção dos dados depende das políticas RLS e das funções seguras das migrações.

## Executar localmente

O projeto usa módulos JavaScript e precisa de um servidor HTTP local. Por exemplo:

```bash
python -m http.server 8000
```

Depois, acesse `http://localhost:8000`.

Validações locais:

```bash
npm run check
npm test
```

## Publicação

O repositório pode ser publicado diretamente pelo GitHub Pages a partir da branch `main`. O `config.js` precisa acompanhar o site e deve conter apenas a chave pública do Supabase e o token de leitura do TMDB.
