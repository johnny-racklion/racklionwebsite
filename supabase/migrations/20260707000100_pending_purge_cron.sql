create extension if not exists pg_cron;

select cron.schedule(
  'purge-pending-subscribers',
  '0 * * * *',
  $$delete from public.newsletter_subscribers
      where status = 'pending' and confirm_expires_at < now()$$
);
