// supabase/functions/_shared/turnstile.ts
export async function verifyTurnstile(
  token: string | undefined,
  secret: string,
  remoteip?: string
): Promise<boolean> {
  if (!token) return false;
  const body = new URLSearchParams({ secret, response: token });
  if (remoteip) body.set('remoteip', remoteip);
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body
  });
  const data = await res.json().catch(() => ({ success: false }));
  return data?.success === true;
}
