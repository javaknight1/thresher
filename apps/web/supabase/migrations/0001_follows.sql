-- Thresher — follows (demand-driven universe). Paste into the Supabase SQL
-- editor (or run via the Supabase CLI). Idempotent: safe to re-run.
--
-- Auth is Clerk, not Supabase Auth, so there is no RLS-by-auth.uid() here — the
-- app reaches these tables only through server routes using the service-role
-- key, which bypasses RLS. Keep the service-role key server-only.

create table if not exists public.follows (
  user_id    text        not null,             -- Clerk user id (or IP identity in open mode)
  symbol     text        not null,             -- normalized ticker (upper-case)
  created_at timestamptz not null default now(),
  primary key (user_id, symbol)
);

-- Reverse lookup for the notification fan-out ("who follows X?").
create index if not exists follows_symbol_idx on public.follows (symbol);

-- Per-user list ordering.
create index if not exists follows_user_created_idx on public.follows (user_id, created_at);
