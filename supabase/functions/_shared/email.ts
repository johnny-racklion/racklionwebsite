// supabase/functions/_shared/email.ts
export async function sendEmail(opts: {
  apiKey: string;
  from: string;
  to: string | string[];
  replyTo?: string;
  subject: string;
  text: string;
}): Promise<void> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${opts.apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: opts.from,
      to: Array.isArray(opts.to) ? opts.to : [opts.to],
      reply_to: opts.replyTo,
      subject: opts.subject,
      text: opts.text
    })
  });
  if (!res.ok) {
    throw new Error(`resend ${res.status}: ${await res.text().catch(() => '')}`);
  }
}
