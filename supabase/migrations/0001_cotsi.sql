-- Cotsi web app storage. Run once in Supabase: SQL Editor → paste → Run.
-- One table holds every learner's data as JSON documents, keyed by user and name.
-- Row-level security is on with no policies, so browsers can never read or write it
-- directly: only the Cotsi API (which uses the service role) can.

create table if not exists public.cotsi_kv (
  user_id    text        not null,
  key        text        not null,
  value      jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

alter table public.cotsi_kv enable row level security;

-- Adds numbers to fields of a JSON document in one atomic step (used for the daily
-- spending counters, so two requests at once can't lose an update).
create or replace function public.cotsi_bump(p_user text, p_key text, p_fields jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  insert into cotsi_kv (user_id, key, value)
  values (p_user, p_key, p_fields)
  on conflict (user_id, key) do update
    set value = (
          select jsonb_object_agg(
                   k,
                   coalesce((cotsi_kv.value ->> k)::numeric, 0) + coalesce((p_fields ->> k)::numeric, 0)
                 )
          from jsonb_object_keys(cotsi_kv.value || p_fields) as k
        ),
        updated_at = now()
  returning value into result;
  return result;
end;
$$;

revoke all on function public.cotsi_bump(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.cotsi_bump(text, text, jsonb) to service_role;
