create table if not exists public.consultation_leads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  company text,
  pressure text,
  message text not null,
  source text,
  created_at timestamptz not null default now(),
  ip inet,
  user_agent text,
  consent_at timestamptz
);

alter table public.consultation_leads enable row level security;
-- Intentionally NO policies: anon/authenticated cannot read or write.
-- Only the service role (used by the edge functions) bypasses RLS.

create index if not exists consultation_leads_created_at_idx
  on public.consultation_leads (created_at);
create index if not exists consultation_leads_ip_created_idx
  on public.consultation_leads (ip, created_at);

create table if not exists public.newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  topics text[] not null default '{}',
  source text,
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'unsubscribed')),
  confirm_token text,
  confirm_expires_at timestamptz,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  ip inet
);

create unique index if not exists newsletter_subscribers_email_key
  on public.newsletter_subscribers (lower(email));
create index if not exists newsletter_subscribers_token_idx
  on public.newsletter_subscribers (confirm_token);
create index if not exists newsletter_subscribers_created_at_idx
  on public.newsletter_subscribers (created_at);

alter table public.newsletter_subscribers enable row level security;
-- Intentionally NO policies (server-role only), same as above.
