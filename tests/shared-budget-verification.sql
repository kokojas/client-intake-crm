-- Isolated meter; no OpenAI calls, fixtures roll back.
do $test$
declare
  fixture_id text:='budget-test-'||gen_random_uuid();
  token text:=encode(sha256(convert_to(gen_random_uuid()::text,'UTF8')),'hex');
  first_id uuid; second_id uuid; report jsonb;
begin
  begin
    insert into crm_private.ai_budgets(id,token_hash,limit_micros)
      values(fixture_id,encode(sha256(convert_to(token,'UTF8')),'hex'),60000);
    execute 'set local role anon';
    begin perform public.crm_ai_budget_summary(null); raise exception 'Null meter token was allowed';
    exception when insufficient_privilege then null; end;
    begin perform public.crm_ai_budget_summary(repeat('x',43)); raise exception 'Wrong meter token was allowed';
    exception when insufficient_privilege then null; end;
    begin perform 1 from crm_private.ai_budgets; raise exception 'Private meter table was readable';
    exception when insufficient_privilege then null; end;
    begin perform public.crm_reserve_ai_budget(token,'unknown-model',1000,60000); raise exception 'Unpriced model was allowed';
    exception when invalid_parameter_value then null; end;
    begin perform public.crm_reserve_ai_budget(token,'gpt-5-mini',null,60000); raise exception 'Null size was allowed';
    exception when invalid_parameter_value then null; end;
    first_id:=public.crm_reserve_ai_budget(token,'gpt-5-mini',1000,60000);
    second_id:=public.crm_reserve_ai_budget(token,'gpt-5-mini',1000,60000);
    begin perform public.crm_reserve_ai_budget(token,'gpt-5-mini',1000,11140000); raise exception 'Allowance was raised or exceeded';
    exception when raise_exception then
      if sqlerrm<>'AI spending allowance reached' then raise; end if;
    end;
    perform public.crm_record_ai_usage(token,first_id,'gpt-5-mini',1000,500);
    perform public.crm_record_ai_usage(token,first_id,'gpt-5-mini',1000,500);
    report:=public.crm_ai_budget_summary(token);
    if (report->>'calls')::int<>2 or (report->>'reservedMaximumUsd')::numeric<>0.06 or (report->>'estimatedKnownUsd')::numeric<>0.00125 then raise exception 'Reservation or usage accounting failed'; end if;
    begin perform public.crm_record_ai_usage(token,gen_random_uuid(),'gpt-5-mini',1,1); raise exception 'Unowned usage receipt was allowed';
    exception when insufficient_privilege then null; end;
    perform public.crm_record_ai_usage(token,second_id,'gpt-5-mini',1000,3001);
    if not (public.crm_ai_budget_summary(token)->>'stopped')::boolean then raise exception 'Unexpected output usage did not stop the meter'; end if;
    execute 'reset role';
    raise exception 'BUDGET_TEST_ROLLBACK';
  exception when raise_exception then
    if sqlerrm<>'BUDGET_TEST_ROLLBACK' then raise; end if;
  end;
end;
$test$;
select 'PASS: capability checks, private table denial, bounded models/input, non-increasing allowance, durable reservations, idempotent usage, and unexpected-usage stop. Fixtures rolled back.' as verification;
