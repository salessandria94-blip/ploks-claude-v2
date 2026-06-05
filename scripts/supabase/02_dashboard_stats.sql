-- PLOKS Dashboard Stats RPC
-- Replaces: client-side fetch of all leads rows
-- Deploy: paste into Supabase SQL editor → Run

create or replace function public.ploks_dashboard_stats()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  with staged as (
    select
      assigned_rep_id,
      assigned_rep,
      zip,
      case
        when assigned_rep_id is null                                    then 'open'
        when coalesce(status, '') in ('', 'No Contact')                 then 'claimed'
        when status = 'Contacted'
          and status_changed_at is not null
          and status_changed_at < now() - interval '30 days'           then 'follow_up'
        when status = 'Contacted'                                       then 'contacted'
        when status = 'Working'                                         then 'working'
        when status = 'Closed'                                          then 'closed'
        else 'open'
      end as stage
    from leads
    where leads.bucket = 'ACTIVE'
  ),
  totals as (
    select
      count(*)                                             as total,
      count(*) filter (where stage = 'open')       as open,
      count(*) filter (where stage = 'claimed')    as claimed,
      count(*) filter (where stage = 'contacted')  as contacted,
      count(*) filter (where stage = 'follow_up')  as follow_up,
      count(*) filter (where stage = 'working')    as working,
      count(*) filter (where stage = 'closed')     as closed
    from staged
  ),
  rep_agg as (
    select
      assigned_rep_id                                      as id,
      max(assigned_rep)                                    as name,
      count(*) filter (where stage = 'claimed')    as claimed,
      count(*) filter (where stage = 'contacted')  as contacted,
      count(*) filter (where stage = 'follow_up')  as follow_up,
      count(*) filter (where stage = 'working')    as working,
      count(*) filter (where stage = 'closed')     as closed
    from staged
    where assigned_rep_id is not null
    group by assigned_rep_id
  ),
  zip_agg as (
    select
      zip,
      count(*)                                             as total,
      count(*) filter (where stage = 'contacted')  as contacted,
      count(*) filter (where stage = 'follow_up')  as follow_up,
      count(*) filter (where stage = 'working')    as working,
      count(*) filter (where stage = 'closed')     as closed,
      (
        count(*) filter (where stage = 'contacted') +
        count(*) filter (where stage = 'follow_up') +
        count(*) filter (where stage = 'working')   +
        count(*) filter (where stage = 'closed')
      )                                                    as score
    from staged
    where zip is not null
    group by zip
    order by score desc, total desc
  )
  select jsonb_build_object(
    'totals',    (select to_jsonb(t) from totals t),
    'rep_stats', (select coalesce(jsonb_agg(to_jsonb(r) order by r.name), '[]') from rep_agg r),
    'zip_stats', (select coalesce(jsonb_agg(to_jsonb(z)), '[]') from zip_agg z)
  ) into result;

  return result;
end;
$$;

-- Verify:
-- select public.ploks_dashboard_stats();
