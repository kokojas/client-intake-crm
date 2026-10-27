-- Public tables are readable only by their owner. Mutations use checked transactions.
create schema if not exists crm_private;
revoke all on schema crm_private from public, anon, authenticated;

create table public.crm_workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users(id) on delete cascade,
  owner_name text not null default 'Workspace owner',
  name text not null default 'My workspace',
  intake_token uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default now()
);
create table public.crm_clients (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.crm_workspaces(id) on delete cascade,
  name text not null check (length(name) between 2 and 120),
  email text not null check (length(email) between 3 and 254),
  company text not null default '' check (length(company) <= 160),
  unique(workspace_id, email), unique(workspace_id, id)
);
create table public.crm_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.crm_workspaces(id) on delete cascade,
  client_id uuid not null,
  event_key text not null check (length(event_key) between 8 and 120),
  content_hash text not null,
  title text not null default 'New automation request',
  message text not null check (length(message) between 20 and 10000),
  source text not null check (source in ('form','manual')),
  stage text not null default 'new' check (stage in ('new','clarifying','proposal','in_progress','done','lost')),
  analysis_state text not null default 'pending' check (analysis_state in ('pending','processing','ready','failed')),
  analysis jsonb, analysis_error text, usage jsonb,
  attempts int not null default 0,
  lock_token uuid, lock_until timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key(workspace_id,client_id) references public.crm_clients(workspace_id,id),
  unique(workspace_id,event_key), unique(workspace_id,id)
);
create table public.crm_tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.crm_workspaces(id) on delete cascade,
  request_id uuid not null,
  title text not null check (length(title) between 2 and 600),
  completed boolean not null default false,
  origin text not null check (origin in ('ai','manual')),
  due_date date, created_at timestamptz not null default now(),
  foreign key(workspace_id,request_id) references public.crm_requests(workspace_id,id) on delete cascade,
  unique(workspace_id,request_id,title)
);
create table public.crm_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.crm_workspaces(id) on delete cascade,
  request_id uuid not null,
  title text not null, detail text not null default '', created_at timestamptz not null default now(),
  foreign key(workspace_id,request_id) references public.crm_requests(workspace_id,id) on delete cascade
);
create index crm_requests_workspace_created on public.crm_requests(workspace_id,created_at desc);
create index crm_requests_client on public.crm_requests(workspace_id,client_id);
create index crm_tasks_request on public.crm_tasks(workspace_id,request_id);
create index crm_events_workspace_created on public.crm_events(workspace_id,created_at desc);
create index crm_events_request on public.crm_events(workspace_id,request_id);

alter table public.crm_workspaces enable row level security;
alter table public.crm_clients enable row level security;
alter table public.crm_requests enable row level security;
alter table public.crm_tasks enable row level security;
alter table public.crm_events enable row level security;
revoke all on public.crm_workspaces,public.crm_clients,public.crm_requests,public.crm_tasks,public.crm_events from public,anon,authenticated;
grant select,insert on public.crm_workspaces to authenticated;
grant select on public.crm_clients,public.crm_requests,public.crm_tasks,public.crm_events to authenticated;
create policy owner_reads_workspace on public.crm_workspaces for select to authenticated using (owner_id=(select auth.uid()));
create policy owner_creates_workspace on public.crm_workspaces for insert to authenticated with check (owner_id=(select auth.uid()));
create policy owner_reads_clients on public.crm_clients for select to authenticated using (exists(select 1 from public.crm_workspaces w where w.id=workspace_id and w.owner_id=(select auth.uid())));
create policy owner_reads_requests on public.crm_requests for select to authenticated using (exists(select 1 from public.crm_workspaces w where w.id=workspace_id and w.owner_id=(select auth.uid())));
create policy owner_reads_tasks on public.crm_tasks for select to authenticated using (exists(select 1 from public.crm_workspaces w where w.id=workspace_id and w.owner_id=(select auth.uid())));
create policy owner_reads_events on public.crm_events for select to authenticated using (exists(select 1 from public.crm_workspaces w where w.id=workspace_id and w.owner_id=(select auth.uid())));

-- A workspace row lock serializes writes, rate limits and idempotency checks.
create function crm_private.assert_owner(p_workspace_id uuid) returns void language plpgsql set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Workspace access denied' using errcode='42501'; end if;
  perform 1 from public.crm_workspaces where id=p_workspace_id and owner_id=auth.uid() for update;
  if not found then raise exception 'Workspace access denied' using errcode='42501'; end if;
end;
$$;

-- Only definer wrappers below can invoke this helper; it is not a public API.
create function crm_private.receive_request(p_workspace_id uuid,p_event_key text,p_name text,p_email text,p_company text,p_message text,p_source text) returns jsonb language plpgsql set search_path='' as $$
declare v_hash text; v_existing public.crm_requests; v_client_id uuid; v_id uuid;
begin
  if length(p_event_key) not between 8 and 120 or p_event_key !~ '^[a-zA-Z0-9_-]+$' or length(btrim(p_name)) not between 2 and 120 or length(p_email) not between 3 and 254 or length(coalesce(p_company,''))>160 or length(btrim(p_message)) not between 20 and 10000 then
    raise exception 'Invalid request fields' using errcode='22023';
  end if;
  v_hash:=encode(sha256(convert_to(jsonb_build_object('name',btrim(p_name),'email',lower(btrim(p_email)),'company',coalesce(p_company,''),'message',btrim(p_message))::text,'UTF8')),'hex');
  select * into v_existing from public.crm_requests where workspace_id=p_workspace_id and event_key=p_event_key;
  if found then
    if v_existing.content_hash<>v_hash then raise exception 'Submission ID already used for different content' using errcode='22023'; end if;
    return jsonb_build_object('id',v_existing.id,'duplicate',true);
  end if;
  if p_source='form' and (select count(*) from public.crm_requests where workspace_id=p_workspace_id and source='form' and created_at>now()-interval '1 hour')>=20 then raise exception 'Hourly intake limit reached'; end if;
  insert into public.crm_clients(workspace_id,name,email,company) values(p_workspace_id,btrim(p_name),lower(btrim(p_email)),coalesce(p_company,'')) on conflict(workspace_id,email) do nothing;
  select id into v_client_id from public.crm_clients where workspace_id=p_workspace_id and email=lower(btrim(p_email));
  insert into public.crm_requests(workspace_id,client_id,event_key,content_hash,message,source) values(p_workspace_id,v_client_id,p_event_key,v_hash,btrim(p_message),p_source) returning id into v_id;
  insert into public.crm_tasks(workspace_id,request_id,title,origin) values(p_workspace_id,v_id,'Review the new request','manual');
  insert into public.crm_events(workspace_id,request_id,title,detail) values(p_workspace_id,v_id,'Request received',case when p_source='form' then 'Received through the intake form.' else 'Added in the workspace.' end);
  return jsonb_build_object('id',v_id,'duplicate',false);
end;
$$;

create function public.crm_receive_owner_request(p_workspace_id uuid,p_event_key text,p_name text,p_email text,p_company text,p_message text,p_source text) returns jsonb language plpgsql security definer set search_path='' as $$
begin
  perform crm_private.assert_owner(p_workspace_id);
  if p_source not in ('manual','form') then raise exception 'Invalid source'; end if;
  return crm_private.receive_request(p_workspace_id,p_event_key,p_name,p_email,p_company,p_message,p_source);
end;
$$;

-- Public capability-based submission. The UUID token permits inserts only, never reads or AI spend.
create function public.submit_crm_intake(p_token uuid,p_event_key text,p_name text,p_email text,p_company text,p_message text) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_workspace_id uuid; v_result jsonb;
begin
  select id into v_workspace_id from public.crm_workspaces where intake_token=p_token for update;
  if not found then raise exception 'Intake form not found'; end if;
  v_result:=crm_private.receive_request(v_workspace_id,p_event_key,p_name,p_email,p_company,p_message,'form');
  return jsonb_build_object('duplicate',v_result->'duplicate');
end;
$$;

create function public.crm_transition_request(p_workspace_id uuid,p_request_id uuid,p_stage text) returns void language plpgsql security definer set search_path='' as $$
declare v_previous text;
begin
  perform crm_private.assert_owner(p_workspace_id);
  if p_stage not in ('new','clarifying','proposal','in_progress','done','lost') then raise exception 'Invalid stage'; end if;
  select stage into v_previous from public.crm_requests where workspace_id=p_workspace_id and id=p_request_id;
  if not found then raise exception 'Request not found'; end if;
  if v_previous=p_stage then return; end if;
  update public.crm_requests set stage=p_stage,updated_at=now() where workspace_id=p_workspace_id and id=p_request_id;
  insert into public.crm_events(workspace_id,request_id,title,detail) values(p_workspace_id,p_request_id,'Stage changed',v_previous||' → '||p_stage);
end;
$$;

create function public.crm_claim_analysis(p_workspace_id uuid,p_request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_request public.crm_requests; v_token uuid:=gen_random_uuid();
begin
  perform crm_private.assert_owner(p_workspace_id);
  select * into v_request from public.crm_requests where workspace_id=p_workspace_id and id=p_request_id for update;
  if not found then raise exception 'Request not found'; end if;
  if v_request.analysis_state='ready' then return jsonb_build_object('cached',true,'lockToken',''); end if;
  if v_request.lock_until>now() then raise exception 'Request is already being processed'; end if;
  if v_request.attempts>=5 then raise exception 'This request has reached its analysis attempt limit'; end if;
  if (select count(*) from public.crm_events where workspace_id=p_workspace_id and title='AI preparation started' and created_at>now()-interval '24 hours')>=30 then raise exception 'Daily AI preparation limit reached'; end if;
  update public.crm_requests set analysis_state='processing',analysis_error=null,lock_token=v_token,lock_until=now()+interval '90 seconds',attempts=attempts+1,updated_at=now() where workspace_id=p_workspace_id and id=p_request_id;
  insert into public.crm_events(workspace_id,request_id,title,detail) values(p_workspace_id,p_request_id,'AI preparation started','The source message is preserved while the brief is prepared.');
  return jsonb_build_object('cached',false,'lockToken',v_token);
end;
$$;

create function public.crm_finish_analysis(p_workspace_id uuid,p_request_id uuid,p_lock_token uuid,p_analysis jsonb,p_usage jsonb) returns void language plpgsql security definer set search_path='' as $$
declare v_task text;
begin
  perform crm_private.assert_owner(p_workspace_id);
  if jsonb_typeof(p_analysis)<>'object' or length(p_analysis->>'title') not between 1 and 160 or jsonb_typeof(p_analysis->'nextTasks')<>'array' then raise exception 'Invalid AI brief'; end if;
  update public.crm_requests set title=p_analysis->>'title',analysis=p_analysis,usage=p_usage,analysis_state='ready',analysis_error=null,lock_token=null,lock_until=null,updated_at=now() where workspace_id=p_workspace_id and id=p_request_id and lock_token=p_lock_token;
  if not found then raise exception 'Analysis lock expired'; end if;
  for v_task in select value from jsonb_array_elements_text(p_analysis->'nextTasks') limit 6 loop
    insert into public.crm_tasks(workspace_id,request_id,title,origin) values(p_workspace_id,p_request_id,v_task,'ai') on conflict(workspace_id,request_id,title) do nothing;
  end loop;
  insert into public.crm_events(workspace_id,request_id,title,detail) values(p_workspace_id,p_request_id,'AI brief prepared',coalesce(p_usage->>'model','OpenAI')||'. Review the brief against the original message.');
end;
$$;

create function public.crm_fail_analysis(p_workspace_id uuid,p_request_id uuid,p_lock_token uuid,p_message text) returns void language plpgsql security definer set search_path='' as $$
begin
  perform crm_private.assert_owner(p_workspace_id);
  update public.crm_requests set analysis_state='failed',analysis_error=left(p_message,700),lock_token=null,lock_until=null,updated_at=now() where workspace_id=p_workspace_id and id=p_request_id and lock_token=p_lock_token;
  if found then insert into public.crm_events(workspace_id,request_id,title,detail) values(p_workspace_id,p_request_id,'AI preparation failed',left(p_message,700)); end if;
end;
$$;

create function public.crm_toggle_task(p_workspace_id uuid,p_task_id uuid,p_completed boolean) returns void language plpgsql security definer set search_path='' as $$
declare v_task public.crm_tasks;
begin
  perform crm_private.assert_owner(p_workspace_id);
  select * into v_task from public.crm_tasks where workspace_id=p_workspace_id and id=p_task_id;
  if not found then raise exception 'Task not found'; end if;
  if v_task.completed=p_completed then return; end if;
  update public.crm_tasks set completed=p_completed where workspace_id=p_workspace_id and id=p_task_id;
  insert into public.crm_events(workspace_id,request_id,title,detail) values(p_workspace_id,v_task.request_id,case when p_completed then 'Task completed' else 'Task reopened' end,v_task.title);
end;
$$;

create function public.crm_add_task(p_workspace_id uuid,p_request_id uuid,p_title text,p_due_date date) returns void language plpgsql security definer set search_path='' as $$
begin
  perform crm_private.assert_owner(p_workspace_id);
  if not exists(select 1 from public.crm_requests where workspace_id=p_workspace_id and id=p_request_id) then raise exception 'Request not found'; end if;
  if length(btrim(p_title)) not between 2 and 200 then raise exception 'Invalid task'; end if;
  insert into public.crm_tasks(workspace_id,request_id,title,origin,due_date) values(p_workspace_id,p_request_id,btrim(p_title),'manual',p_due_date) on conflict(workspace_id,request_id,title) do nothing;
  if found then insert into public.crm_events(workspace_id,request_id,title,detail) values(p_workspace_id,p_request_id,'Task added',btrim(p_title)); end if;
end;
$$;

revoke all on all functions in schema crm_private from public,anon,authenticated;
revoke all on function public.submit_crm_intake(uuid,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.submit_crm_intake(uuid,text,text,text,text,text) to anon,authenticated;
revoke all on function public.crm_receive_owner_request(uuid,text,text,text,text,text,text),public.crm_transition_request(uuid,uuid,text),public.crm_claim_analysis(uuid,uuid),public.crm_finish_analysis(uuid,uuid,uuid,jsonb,jsonb),public.crm_fail_analysis(uuid,uuid,uuid,text),public.crm_toggle_task(uuid,uuid,boolean),public.crm_add_task(uuid,uuid,text,date) from public,anon,authenticated;
grant execute on function public.crm_receive_owner_request(uuid,text,text,text,text,text,text),public.crm_transition_request(uuid,uuid,text),public.crm_claim_analysis(uuid,uuid),public.crm_finish_analysis(uuid,uuid,uuid,jsonb,jsonb),public.crm_fail_analysis(uuid,uuid,uuid,text),public.crm_toggle_task(uuid,uuid,boolean),public.crm_add_task(uuid,uuid,text,date) to authenticated;
