# Edge Function: account-deletion

Secrets necessários no Supabase:

- `SUPABASE_SERVICE_ROLE_KEY` (somente nos secrets da função)
- `RESEND_API_KEY`
- `APP_BASE_URL` (URL pública do GitHub Pages)
- `MAIL_FROM` (remetente verificado no Resend)

A função recebe `POST { action: "request" }` com o JWT do usuário para enviar o e-mail de confirmação. A confirmação recebe `POST { action: "confirm", token }` e remove os dados da conta antes de excluir o usuário do Auth.
