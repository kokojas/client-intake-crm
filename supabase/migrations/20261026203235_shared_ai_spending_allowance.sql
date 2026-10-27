-- One project allowance shared by every app instance and the local verifier.
-- A server-only capability can reserve/inspect budget, never read client CRM data.
create table crm_private.ai_budgets (
  id text primary key,
  token_hash text unique not null check(length(token_hash)=64),
  limit_micros bigint not null check(limit_micros between 1 and 11140000),
  reserved_micros bigint not null default 0 check(reserved_micros>=0),
  estimated_known_micros bigint not null default 0 check(estimated_known_micros>=0),
  calls integer not null default 0 check(calls>=0),
  stopped boolean not null default false
);
create table crm_private.ai_budget_reservations (
  id uuid primary key default gen_random_uuid(),
  budget_id text not null references crm_private.ai_budgets(id),
  model text not null check(model='gpt-5-mini'),
  estimated_micros bigint check(estimated_micros>=0),
  created_at timestamptz not null default now()
);
alter table crm_private.ai_budgets enable row level security;
alter table crm_private.ai_budget_reservations enable row level security;
revoke all on crm_private.ai_budgets,crm_private.ai_budget_reservations from public,anon,authenticated;

create function crm_private.ai_budget_id(p_token text) returns text language plpgsql set search_path='' as $$
declare v_id text;
begin
  if p_token is null or length(p_token) not between 40 and 128 then raise exception 'AI meter access denied' using errcode='42501'; end if;
  select id into v_id from crm_private.ai_budgets where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex');
  if not found then raise exception 'AI meter access denied' using errcode='42501'; end if;
  return v_id;
end;
$$;
revoke all on function crm_private.ai_budget_id(text) from public,anon,authenticated;

create function public.crm_reserve_ai_budget(p_token text,p_model text,p_request_bytes integer,p_limit_micros bigint) returns uuid language plpgsql security definer set search_path='' as $$
declare v_id text; v_budget crm_private.ai_budgets; v_reservation uuid;
begin
  v_id:=crm_private.ai_budget_id(p_token);
  if p_model is distinct from 'gpt-5-mini' or p_request_bytes is null or p_request_bytes not between 0 and 64000 or p_limit_micros is null or p_limit_micros not between 1 and 11140000 then raise exception 'Unverified AI cost configuration' using errcode='22023'; end if;
  select * into v_budget from crm_private.ai_budgets where id=v_id for update;
  if v_budget.stopped or v_budget.reserved_micros+30000>least(v_budget.limit_micros,p_limit_micros) then raise exception 'AI spending allowance reached'; end if;
  insert into crm_private.ai_budget_reservations(budget_id,model) values(v_id,p_model) returning id into v_reservation;
  update crm_private.ai_budgets set limit_micros=least(limit_micros,p_limit_micros),reserved_micros=reserved_micros+30000,calls=calls+1 where id=v_id;
  return v_reservation;
end;
$$;

create function public.crm_record_ai_usage(p_token text,p_reservation_id uuid,p_model text,p_input_tokens integer,p_output_tokens integer) returns void language plpgsql security definer set search_path='' as $$
declare v_id text; v_entry crm_private.ai_budget_reservations; v_cost bigint;
begin
  v_id:=crm_private.ai_budget_id(p_token);
  perform 1 from crm_private.ai_budgets where id=v_id for update;
  select * into v_entry from crm_private.ai_budget_reservations where id=p_reservation_id and budget_id=v_id for update;
  if not found then raise exception 'AI meter access denied' using errcode='42501'; end if;
  if v_entry.estimated_micros is not null then return; end if;
  if p_model is distinct from v_entry.model or p_input_tokens is null or p_output_tokens is null or p_input_tokens<0 or p_output_tokens<0 then
    update crm_private.ai_budgets set stopped=true where id=v_id; return;
  end if;
  v_cost:=ceil(p_input_tokens::numeric*0.25+p_output_tokens::numeric*2)::bigint;
  update crm_private.ai_budget_reservations set estimated_micros=v_cost where id=p_reservation_id;
  update crm_private.ai_budgets set estimated_known_micros=estimated_known_micros+v_cost,
    stopped=stopped or p_input_tokens>72192 or p_output_tokens>3000 or v_cost>30000 where id=v_id;
  -- Reservations are never refunded, including on failure, timeout or validation errors.
end;
$$;

create function public.crm_ai_budget_summary(p_token text) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_id text; v_budget crm_private.ai_budgets;
begin
  v_id:=crm_private.ai_budget_id(p_token);
  select * into v_budget from crm_private.ai_budgets where id=v_id;
  return jsonb_build_object('limitUsd',v_budget.limit_micros/1000000.0,'reservedMaximumUsd',v_budget.reserved_micros/1000000.0,
    'estimatedKnownUsd',v_budget.estimated_known_micros/1000000.0,'remainingAllowanceUsd',greatest(0,v_budget.limit_micros-v_budget.reserved_micros)/1000000.0,'calls',v_budget.calls,'stopped',v_budget.stopped);
end;
$$;

revoke all on function public.crm_reserve_ai_budget(text,text,integer,bigint),public.crm_record_ai_usage(text,uuid,text,integer,integer),public.crm_ai_budget_summary(text) from public,anon,authenticated;
grant execute on function public.crm_reserve_ai_budget(text,text,integer,bigint),public.crm_record_ai_usage(text,uuid,text,integer,integer),public.crm_ai_budget_summary(text) to anon,authenticated;
