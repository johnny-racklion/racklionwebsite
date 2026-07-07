// supabase/functions/confirm/index.ts
import { isExpired } from '../_shared/core.mjs';
import { serviceClient } from '../_shared/db.ts';

const base = Deno.env.get('CONFIRM_BASE_URL') ?? 'https://racklion.com';

function redirect(path: string): Response {
  return new Response(null, { status: 302, headers: { Location: `${base.replace(/\/+$/, '')}${path}` } });
}

Deno.serve(async (req) => {
  if (req.method !== 'GET') return new Response('Method not allowed', { status: 405 });

  const token = new URL(req.url).searchParams.get('token');
  if (!token) return redirect('/subscribe?confirm=invalid');

  const supabase = serviceClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const { data: row } = await supabase
    .from('newsletter_subscribers')
    .select('id, status, confirm_expires_at')
    .eq('confirm_token', token)
    .maybeSingle();

  if (!row) return redirect('/subscribe?confirm=invalid');
  if (row.status === 'confirmed') return redirect('/subscribed');
  if (isExpired(row.confirm_expires_at, Date.now())) return redirect('/subscribe?confirm=expired');

  const { error } = await supabase
    .from('newsletter_subscribers')
    .update({ status: 'confirmed', confirmed_at: new Date().toISOString(), confirm_token: null })
    .eq('id', row.id);
  if (error) return redirect('/subscribe?confirm=error');

  return redirect('/subscribed');
});
