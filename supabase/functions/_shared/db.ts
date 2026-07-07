// supabase/functions/_shared/db.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export function serviceClient(url: string, serviceKey: string) {
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}
