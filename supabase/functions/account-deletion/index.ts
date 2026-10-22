import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const resendKey = Deno.env.get('RESEND_API_KEY');
const appBaseUrl = Deno.env.get('APP_BASE_URL') || 'https://caiozinho-lindo.github.io/cine-diario';

const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

async function sha256(value: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function currentUser(request: Request) {
  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return null;
  const client = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
  const { data } = await client.auth.getUser();
  return data.user || null;
}

async function sendConfirmationEmail(email: string, token: string) {
  if (!resendKey) throw new Error('RESEND_API_KEY não configurada.');
  const link = `${appBaseUrl}/pages/confirmar-exclusao.html?token=${encodeURIComponent(token)}`;
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: Deno.env.get('MAIL_FROM') || 'Cine Diário <onboarding@resend.dev>',
      to: [email],
      subject: 'Confirme a exclusão da sua conta no Cine Diário',
      html: `<p>Recebemos um pedido para excluir sua conta do Cine Diário.</p><p><a href="${link}">Confirmar exclusão da conta</a></p><p>O link expira em 24 horas. Se você não fez esse pedido, ignore esta mensagem.</p>`
    })
  });
  if (!response.ok) throw new Error(`Falha ao enviar e-mail (${response.status}).`);
}

async function deleteAccountData(userId: string) {
  const { data: ownedSpaces, error: spacesError } = await admin.from('espacos').select('id').eq('criado_por', userId);
  if (spacesError) throw spacesError;

  for (const space of ownedSpaces || []) {
    const { data: members, error } = await admin.from('espaco_membros')
      .select('usuario_id, entrou_em').eq('espaco_id', space.id).neq('usuario_id', userId)
      .order('entrou_em', { ascending: true });
    if (error) throw error;
    if (members?.length) {
      const successor = members[0].usuario_id;
      const promoted = await admin.from('espaco_membros').update({ papel: 'proprietario' })
        .eq('espaco_id', space.id).eq('usuario_id', successor);
      if (promoted.error) throw promoted.error;
      const transferred = await admin.from('espacos').update({ criado_por: successor }).eq('id', space.id);
      if (transferred.error) throw transferred.error;
    } else {
      const removed = await admin.from('espacos').delete().eq('id', space.id);
      if (removed.error) throw removed.error;
    }
  }

  for (const table of ['sessao_participantes', 'avaliacoes_historico_migracao', 'avaliacoes', 'biblioteca_usuario', 'usuario_streamings', 'usuario_recomendacoes_bloqueadas', 'preferencias_usuario', 'espaco_membros', 'perfis']) {
    const result = await admin.from(table).delete().eq('usuario_id', userId);
    if (result.error) throw result.error;
  }

  const sessions = await admin.from('sessoes').delete().eq('criado_por', userId);
  if (sessions.error) throw sessions.error;
  const deleted = await admin.auth.admin.deleteUser(userId);
  if (deleted.error) throw deleted.error;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

  try {
    const user = await currentUser(request);
    const payload = await request.json().catch(() => ({}));
    if (payload.action === 'confirm') {
      const token = String(payload.token || '');
      if (!token) return json({ error: 'Token ausente.' }, 400);
      const hash = await sha256(token);
      const { data: requestRow, error } = await admin.from('solicitacoes_exclusao_conta').select('id, usuario_id, expira_em, confirmado_em, concluido_em').eq('token_hash', hash).maybeSingle();
      if (error) throw error;
      if (!requestRow || requestRow.confirmado_em || requestRow.concluido_em || new Date(requestRow.expira_em) < new Date()) return json({ error: 'Link inválido ou expirado.' }, 400);
      await admin.from('solicitacoes_exclusao_conta').update({ confirmado_em: new Date().toISOString() }).eq('id', requestRow.id);
      await deleteAccountData(requestRow.usuario_id);
      return json({ ok: true });
    }

    if (!user) return json({ error: 'Autenticação obrigatória.' }, 401);
    const token = crypto.randomUUID();
    const hash = await sha256(token);
    await admin.from('solicitacoes_exclusao_conta').update({ cancelado_em: new Date().toISOString() }).eq('usuario_id', user.id).is('concluido_em', null).is('cancelado_em', null);
    const { error } = await admin.from('solicitacoes_exclusao_conta').insert({ usuario_id: user.id, token_hash: hash });
    if (error) throw error;
    await sendConfirmationEmail(user.email!, token);
    return json({ ok: true, message: 'Enviamos um link de confirmação para o e-mail da conta.' });
  } catch (error) {
    console.error(error);
    return json({ error: error instanceof Error ? error.message : 'Não foi possível concluir a solicitação.' }, 500);
  }
});
