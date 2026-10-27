-- Run on the isolated CRM project. All fixture rows roll back inside the exception block.
do $test$
declare
  owner_a uuid:=gen_random_uuid(); owner_b uuid:=gen_random_uuid();
  workspace_a uuid:=gen_random_uuid(); workspace_b uuid:=gen_random_uuid();
  token_a uuid:=gen_random_uuid(); request_a uuid; task_a uuid; result jsonb; claim jsonb; count_rows int;
begin
  begin
    insert into auth.users(id,email) values(owner_a,'crm-test-a-'||owner_a||'@example.com'),(owner_b,'crm-test-b-'||owner_b||'@example.com');
    insert into public.crm_workspaces(id,owner_id,intake_token) values(workspace_a,owner_a,token_a),(workspace_b,owner_b,gen_random_uuid());
    perform set_config('request.jwt.claim.sub',owner_a::text,true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_a,'role','authenticated')::text,true);
    execute 'set local role authenticated';
    select count(*) into count_rows from public.crm_workspaces;
    if count_rows<>1 then raise exception 'RLS did not isolate workspace owners'; end if;
    result:=public.crm_receive_owner_request(workspace_a,'cloud-test-event-001','Alex Example','alex@example.com','Test Studio','Please automate Google Sheets to Word proposals for our team.','manual');
    request_a:=(result->>'id')::uuid;
    result:=public.crm_receive_owner_request(workspace_a,'cloud-test-event-001','Alex Example','alex@example.com','Test Studio','Please automate Google Sheets to Word proposals for our team.','manual');
    if not (result->>'duplicate')::boolean or (result->>'id')::uuid<>request_a then raise exception 'Idempotency failed'; end if;
    begin
      perform public.crm_transition_request(workspace_b,request_a,'done');
      raise exception 'Cross-tenant mutation was allowed';
    exception when insufficient_privilege then null;
    end;
    perform public.crm_transition_request(workspace_a,request_a,'proposal');
    claim:=public.crm_claim_analysis(workspace_a,request_a);
    begin
      perform public.crm_claim_analysis(workspace_a,request_a);
      raise exception 'Concurrent claim was allowed';
    exception when raise_exception then
      if sqlerrm not like '%already being processed%' then raise; end if;
    end;
    perform public.crm_finish_analysis(workspace_a,request_a,(claim->>'lockToken')::uuid,
      '{"title":"Proposal generation","summary":"A test brief","service":"Document automation","budgetAmount":null,"budgetCurrency":null,"deadlineText":null,"deadlineDate":null,"requirements":["Word proposals"],"missingInformation":["Budget"],"nextTasks":["Confirm template"],"replyDraft":"Please share the template."}'::jsonb,
      '{"model":"test-fixture","inputTokens":0,"outputTokens":0}'::jsonb);
    result:=public.crm_claim_analysis(workspace_a,request_a);
    if not (result->>'cached')::boolean then raise exception 'Ready result was not cached'; end if;
    select id into task_a from public.crm_tasks where workspace_id=workspace_a and title='Confirm template';
    perform public.crm_toggle_task(workspace_a,task_a,true);
    perform public.crm_toggle_task(workspace_a,task_a,true);
    select count(*) into count_rows from public.crm_events where workspace_id=workspace_a and title='Task completed';
    if count_rows<>1 then raise exception 'Duplicate task history event'; end if;
    execute 'reset role';
    execute 'set local role anon';
    begin
      perform 1 from public.crm_requests limit 1;
      raise exception 'Anonymous CRM read was allowed';
    exception when insufficient_privilege then null;
    end;
    result:=public.submit_crm_intake(token_a,'public-cloud-event-001','Maya Example','maya@example.com','','We need help building a repeatable weekly reporting workflow.');
    if (result->>'duplicate')::boolean then raise exception 'First intake marked duplicate'; end if;
    result:=public.submit_crm_intake(token_a,'public-cloud-event-001','Maya Example','maya@example.com','','We need help building a repeatable weekly reporting workflow.');
    if not (result->>'duplicate')::boolean then raise exception 'Public duplicate was not recognized'; end if;
    if result ? 'id' then raise exception 'Public response disclosed request identifier'; end if;
    execute 'reset role';
    raise exception 'CRM_TEST_ROLLBACK';
  exception when raise_exception then
    if sqlerrm<>'CRM_TEST_ROLLBACK' then raise; end if;
  end;
end;
$test$;
select 'PASS: tenant isolation, public read denial, transactional intake, duplicates, AI lock/cache and task history. All fixtures rolled back.' as verification;
