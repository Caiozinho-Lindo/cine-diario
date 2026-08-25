# 🎬 Cine Diário

Um diário compartilhado para registrar os filmes e séries que Caio e Noemy assistem juntos — com avaliações individuais, média automática do casal, estatísticas e três identidades visuais (Caio, Noemy e Casal).

Site estático (HTML + CSS + JavaScript puro, sem build step), com [Supabase](https://supabase.com) como banco de dados e autenticação, e [TMDB](https://www.themoviedb.org) como fonte de busca de filmes e séries.

## Evolução multiusuário

O projeto está sendo evoluído para contas individuais e espaços compartilhados
(casal, família, amigos, clube de cinema ou outro grupo). O acervo original de
Caio e Noemy é o espaço legado prioritário e não pode perder informações.

### Ordem segura da migração

1. Exporte `perfis`, `titulos` e `avaliacoes` no painel do Supabase.
2. Anote a contagem de linhas das três tabelas.
3. Execute `supabase/migrations/002_multiusuario_espacos.sql`.
4. Execute `supabase/migrations/003_validar_migracao_multiusuario.sql`.
5. Confirme que os totais originais não mudaram, que o espaço **Caio & Noemy**
   tem dois membros e que as consultas de problemas retornam zero linhas.
6. Teste login, catálogo, lista e avaliações com as duas contas antes de
   permitir novos cadastros.

A migração 002 é aditiva: ela não remove tabelas, colunas nem registros. Se
uma validação interna falhar, a transação é revertida integralmente.

### Modelo atual

- `perfis`: identidade e personalização de cada conta por `auth.uid()`;
- `espacos`: catálogos pessoais ou compartilhados;
- `espaco_membros`: participação e papel dentro de cada espaço;
- `titulos`: obras pertencentes a um espaço;
- `biblioteca_usuario`: estado pessoal, favorito e privacidade da obra;
- `avaliacoes`: nota e observação sempre vinculadas ao autor;
- `preferencias_usuario`: tema e preferências privadas.

---

## Índice

1. [Estrutura do projeto](#estrutura-do-projeto)
2. [Criar conta e projeto no TMDB](#1-criar-conta-e-projeto-no-tmdb)
3. [Criar projeto no Supabase](#2-criar-projeto-no-supabase)
4. [Criar as tabelas no Supabase](#3-criar-as-tabelas-no-supabase)
5. [Criar os dois usuários (Caio e Noemy)](#4-criar-os-dois-usuários-caio-e-noemy)
6. [Configurar políticas de segurança (RLS)](#5-configurar-políticas-de-segurança-rls)
7. [Configurar as variáveis do projeto](#6-configurar-as-variáveis-do-projeto)
8. [Testar localmente](#7-testar-localmente)
9. [Subir para o GitHub](#8-subir-para-o-github)
10. [Ativar o GitHub Pages](#9-ativar-o-github-pages)
11. [Acessar pelo celular](#10-acessar-pelo-celular)
12. [Atualizar o site no futuro](#11-atualizar-o-site-no-futuro)
13. [Limitações conhecidas](#limitações-conhecidas)

---

## Estrutura do projeto

```
/
├── index.html              → tela de login
├── config.example.js       → modelo de configuração (copie para config.js)
├── supabase/migrations/    → correções de schema e políticas RLS
├── css/
│   ├── global.css
│   ├── themes.css          → temas Caio / Noemy / Casal
│   ├── components.css
│   └── responsive.css
├── js/
│   ├── supabaseClient.js
│   ├── auth.js
│   ├── tmdb.js
│   ├── perfis.js           → mapeia usuário logado -> Caio/Noemy
│   ├── titulos.js          → CRUD de títulos e avaliações
│   ├── statistics.js
│   ├── filters.js
│   ├── themes.js
│   ├── ui.js
│   └── pages/               → um script por página
│       ├── login.js
│       ├── home.js
│       ├── catalog.js
│       ├── details.js
│       └── add.js
└── pages/
    ├── home.html
    ├── catalog.html
    ├── details.html
    └── add.html
```

> A tela de login está em `index.html` (raiz), pois é o ponto de entrada do site no GitHub Pages.

---

## 1. Criar conta e projeto no TMDB

1. Crie uma conta gratuita em [themoviedb.org](https://www.themoviedb.org/signup).
2. Vá em **Configurações (Settings) → API** e solicite uma chave de API (uso pessoal/educacional é aprovado automaticamente).
3. Copie o **"API Read Access Token (v4 auth)"** — é uma string longa começando com `eyJ...`. É esse token que o app usa (não a "API Key" v3).

---

## 2. Criar projeto no Supabase

1. Crie uma conta gratuita em [supabase.com](https://supabase.com).
2. Clique em **New Project**, escolha um nome (ex: `diario-cinematografico`) e uma senha de banco (guarde-a, mas ela não é usada pelo app).
3. Aguarde o projeto ser provisionado (leva ~2 minutos).
4. Em **Project Settings → API**, anote:
   - **Project URL** (algo como `https://xxxx.supabase.co`)
   - **anon public key**

---

## 3. Criar as tabelas no Supabase

No painel do Supabase, abra **SQL Editor → New query** e cole o script abaixo. Ele cria as três tabelas usadas pelo app:

```sql
-- Tabela de perfis: liga o user_id do Supabase Auth ao nome "caio" ou "noemy"
create table perfis (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null unique check (nome in ('caio', 'noemy'))
);

-- Tabela de títulos (filmes e séries)
create table titulos (
  id uuid primary key default gen_random_uuid(),
  tmdb_id integer,
  tipo text not null check (tipo in ('filme', 'serie')),
  nome text not null,
  nome_original text,
  ano integer,
  generos text[] default '{}',
  capa_url text,
  backdrop_url text,
  sinopse text,
  data_assistido date,
  criado_por uuid references auth.users(id),
  quero_assistir boolean not null default false,
  criado_em timestamptz not null default now()
);

-- Tabela de avaliações individuais
-- A temporada 0 representa a obra inteira. Temporadas específicas usam 1, 2...
create table avaliacoes (
  id uuid primary key default gen_random_uuid(),
  titulo_id uuid not null references titulos(id) on delete cascade,
  usuario_id uuid not null references auth.users(id),
  temporada integer not null default 0 check (temporada >= 0),
  nota numeric(3,1) not null check (nota >= 0 and nota <= 10),
  observacao text default '',
  data_avaliacao date not null default current_date,
  unique (titulo_id, usuario_id, temporada)
);
```

Execute (**Run**). As três tabelas devem aparecer em **Table Editor**.

---

## 4. Criar os dois usuários (Caio e Noemy)

1. No painel do Supabase, vá em **Authentication → Users → Add user → Create new user**.
2. Crie um usuário para o Caio, por exemplo:
   - E-mail: `caio@diario.local`
   - Senha: escolha uma senha forte
   - Marque **Auto Confirm User**
3. Repita para a Noemy: `noemy@diario.local`.
4. Copie o **User UID** de cada um (aparece na lista de usuários).
5. Volte ao **SQL Editor** e rode (substituindo pelos UIDs reais):

```sql
insert into perfis (id, nome) values
  ('UID-DO-CAIO-AQUI', 'caio'),
  ('UID-DA-NOEMY-AQUI', 'noemy');
```

> Use os e-mails que você escolheu aqui em `CAIO_EMAIL` e `NOEMY_EMAIL` no `config.js` (passo 6).

---

## 5. Configurar políticas de segurança (RLS)

Depois de criar e preencher a tabela `perfis`, execute no **SQL Editor** o arquivo
[`supabase/migrations/001_corrigir_schema_e_rls.sql`](supabase/migrations/001_corrigir_schema_e_rls.sql).

Ele:

- adiciona a coluna da lista “Para assistir” em bancos antigos;
- corrige e consolida avaliações duplicadas causadas por `temporada = null`;
- habilita RLS nas três tabelas;
- restringe o acesso às contas Caio e Noemy cadastradas em `perfis`;
- permite que cada pessoa altere somente a própria avaliação.

---

## 6. Configurar as variáveis do projeto

1. Na raiz do projeto, copie `config.example.js` para um novo arquivo chamado **`config.js`**.
2. Preencha:

```js
window.APP_CONFIG = {
  SUPABASE_URL: "https://xxxx.supabase.co",
  SUPABASE_ANON_KEY: "sua-anon-key-aqui",
  TMDB_READ_TOKEN: "seu-token-de-leitura-tmdb-aqui",
  CAIO_EMAIL: "caio@diario.local",
  NOEMY_EMAIL: "noemy@diario.local"
};
```

Este é um aplicativo estático: os valores usados pelo navegador são públicos.
Use exclusivamente a chave **anon/publishable** do Supabase. Nunca coloque a
chave `service_role`, senha do banco ou outro segredo no `config.js`. A proteção
dos dados deve ser feita pelas políticas RLS do passo anterior.

---

## 7. Testar localmente

Como o app usa ES Modules (`import`/`export`), ele precisa ser aberto via **um servidor HTTP local** — abrir o `index.html` direto com duplo clique (`file://`) não funciona.

Opções simples:

- **VSCode**: instale a extensão "Live Server", clique com o botão direito em `index.html` → "Open with Live Server".
- **Node.js**: na pasta do projeto, rode:
  ```bash
  npx serve .
  ```
  e acesse o endereço mostrado no terminal (ex: `http://localhost:3000`).
- **Python**:
  ```bash
  python3 -m http.server 8000
  ```
  e acesse `http://localhost:8000`.

Faça login com o e-mail e senha criados no passo 4.

Para verificar sintaxe JavaScript, referências locais, IDs duplicados e
marcadores de conflito, execute:

```bash
npm run check
```

---

## 8. Subir para o GitHub

```bash
git init
git add .
git commit -m "Diário cinematográfico do casal"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/SEU-REPOSITORIO.git
git push -u origin main
```

> Para publicar diretamente pelo GitHub Pages, o `config.js` precisa acompanhar
> o site. Confirme que ele contém somente credenciais próprias para uso público
> no navegador.

---

## 9. Ativar o GitHub Pages

1. No repositório do GitHub, vá em **Settings → Pages**.
2. Em **Source**, selecione a branch `main` e a pasta `/ (root)`.
3. Salve. Após 1–2 minutos, o site estará disponível em:
   `https://SEU-USUARIO.github.io/SEU-REPOSITORIO/`

⚠️ Como o app é 100% estático, o `config.js` precisa ser publicado para o site
funcionar. Mesmo que GitHub Actions gere esse arquivo usando Secrets, os valores
resultantes continuam visíveis para quem abrir o site no navegador. Secrets
protegem o processo de build, mas não transformam configuração client-side em
segredo. Use RLS e nunca publique credenciais administrativas.

---

## 10. Acessar pelo celular

Basta abrir a URL do GitHub Pages no navegador do celular (Chrome, Safari, etc.) e fazer login normalmente. O design é mobile-first e se adapta automaticamente. Para um acesso mais rápido, adicione a página à tela inicial do celular ("Adicionar à tela de início").

---

## 11. Atualizar o site no futuro

Sempre que quiser alterar algo:

```bash
git add .
git commit -m "descrição da alteração"
git push
```

O GitHub Pages atualiza automaticamente em 1–2 minutos após o push.

---

## Limitações conhecidas

- **Chave do TMDB fica visível no código client-side** — isso é inerente a qualquer app estático sem backend próprio. O token usado é o "read access token", feito justamente para uso público/client-side.
- **Dois usuários fixos** — não há tela de cadastro de novos usuários; Caio e Noemy são criados manualmente no painel do Supabase (passo 4).
- **GitHub Pages é uma URL pública** — qualquer pessoa com o link pode ver a tela de login, mas não os dados (protegidos por autenticação + RLS no Supabase).
- **Avaliação por temporada** não está implementada nesta versão. A temporada `0` representa a obra inteira; valores a partir de `1` ficam reservados para temporadas futuras.
