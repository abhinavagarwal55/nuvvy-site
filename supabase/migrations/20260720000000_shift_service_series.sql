-- Reschedule with Cadence Shift (PRD §5.2 / §8.2) — atomic "shift the series".
--
-- Wraps the whole Option-B mutation in ONE plpgsql function so a mid-way failure
-- cannot leave a customer with a deactivated slot and no active replacement (the
-- function body runs in a single transaction). The route computes the plan with
-- planSeriesShift() and passes the resulting anchor + recurring cycle dates here;
-- this function only executes the writes atomically.
--
-- No new tables/columns — expressed entirely with existing fields
-- (service_slots.effective_from/effective_until/is_active,
--  service_visits.slot_id/original_scheduled_date).
--
-- Ordering guarantees the durability invariant: the shift is an ANCHOR change on
-- a new active slot (effective_from = anchor), never a bulk row edit — so the
-- nightly extend-services cron reads the new phase and never reverts it.

create or replace function public.shift_service_series(
  p_old_slot_id           uuid,
  p_moved_visit_id        uuid,
  p_new_date              date,
  p_anchor                date,
  p_new_start_time        time,   -- nullable; falls back to the slot's window
  p_new_end_time          time,   -- nullable
  p_recurring_dates       date[], -- future recurring cycle dates (excl. moved visit & anchor)
  p_subscription_id       uuid,
  p_secondary_gardener_id uuid    -- nullable co-visit gardener (junction only)
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slot            service_slots%rowtype;
  v_customer_id     uuid;
  v_gardener_id     uuid;
  v_day             int;
  v_start           time;
  v_end             time;
  v_new_slot_id     uuid;
  v_new_visit_id    uuid;
  v_earliest_new    uuid;
  v_removed_ids     uuid[];
  v_generated       int := 0;
  d                 date;
begin
  -- Lock the old slot for the duration of the transaction.
  select * into v_slot from service_slots where id = p_old_slot_id for update;
  if not found then
    raise exception 'slot % not found', p_old_slot_id;
  end if;

  v_customer_id := v_slot.customer_id;
  v_gardener_id := v_slot.gardener_id;
  v_day         := v_slot.day_of_week;
  v_start       := coalesce(p_new_start_time, v_slot.time_window_start);
  v_end         := coalesce(p_new_end_time, v_slot.time_window_end);

  -- 1. Deactivate the old slot (history preserved).
  update service_slots
     set is_active = false,
         effective_until = p_anchor
   where id = p_old_slot_id;

  -- 2. Create the new slot, re-anchored to the moved visit's week, SAME weekday.
  insert into service_slots
    (customer_id, gardener_id, day_of_week, time_window_start, time_window_end, is_active, effective_from)
  values
    (v_customer_id, v_gardener_id, v_day, v_start, v_end, true, p_anchor)
  returning id into v_new_slot_id;

  -- 3. Keep the customer's canonical primary gardener in sync with the active slot.
  update customers set primary_gardener_id = v_gardener_id where id = v_customer_id;

  -- 4. Rebind the moved visit onto the new slot. original_scheduled_date = anchor
  --    so it claims the anchor-week cycle and generation won't duplicate it.
  update service_visits
     set slot_id = v_new_slot_id,
         scheduled_date = p_new_date,
         original_scheduled_date = p_anchor,
         time_window_start = v_start,
         time_window_end = v_end
   where id = p_moved_visit_id;

  -- 5. Generate the recurring future visits on the new slot (mirrors
  --    generateServices: idempotent by original_scheduled_date, junction populated).
  if p_recurring_dates is not null then
    foreach d in array p_recurring_dates loop
      if not exists (
        select 1 from service_visits
         where slot_id = v_new_slot_id and original_scheduled_date = d
      ) then
        insert into service_visits
          (customer_id, subscription_id, assigned_gardener_id, slot_id,
           scheduled_date, original_scheduled_date, time_window_start, time_window_end, status)
        values
          (v_customer_id, p_subscription_id, v_gardener_id, v_new_slot_id,
           d, d, v_start, v_end, 'scheduled')
        returning id into v_new_visit_id;

        insert into service_visit_gardeners (service_id, gardener_id)
        values (v_new_visit_id, v_gardener_id)
        on conflict (service_id, gardener_id) do nothing;

        if p_secondary_gardener_id is not null and p_secondary_gardener_id <> v_gardener_id then
          insert into service_visit_gardeners (service_id, gardener_id)
          values (v_new_visit_id, p_secondary_gardener_id)
          on conflict (service_id, gardener_id) do nothing;
        end if;

        v_generated := v_generated + 1;
      end if;
    end loop;
  end if;

  -- 6. Earliest visit on the new slot — target for reassigned special tasks.
  select id into v_earliest_new
    from service_visits
   where slot_id = v_new_slot_id and status = 'scheduled'
   order by scheduled_date asc
   limit 1;

  -- 7. Old-phase future visits to remove (the moved visit is already off the old
  --    slot after step 4, so it is naturally excluded).
  select array_agg(id) into v_removed_ids
    from service_visits
   where slot_id = p_old_slot_id
     and status = 'scheduled'
     and scheduled_date > p_new_date;

  if v_removed_ids is not null and array_length(v_removed_ids, 1) > 0 then
    -- Reassign pending special tasks to the earliest new visit so they aren't lost.
    if v_earliest_new is not null then
      update service_special_tasks
         set for_service_id = v_earliest_new
       where for_service_id = any(v_removed_ids);
    end if;
    -- created_after_service_id is provenance only — null it out.
    update service_special_tasks
       set created_after_service_id = null
     where created_after_service_id = any(v_removed_ids);
    -- Junction rows cascade on visit delete, but drop explicitly for parity with PUT /slots.
    delete from service_visit_gardeners where service_id = any(v_removed_ids);
    -- reminder_message_override lives on the visit row → removed with the delete.
    delete from service_visits where id = any(v_removed_ids);
  end if;

  return jsonb_build_object(
    'new_slot_id',      v_new_slot_id,
    'anchor',           p_anchor,
    'visits_generated', v_generated,
    'visits_removed',   coalesce(array_length(v_removed_ids, 1), 0),
    'removed_ids',      to_jsonb(coalesce(v_removed_ids, array[]::uuid[]))
  );
end;
$$;

comment on function public.shift_service_series is
  'Atomic "shift the series" reschedule (PRD §5.2): deactivate old slot, create '
  'new slot anchored to the moved visit''s week (same weekday), rebind the moved '
  'visit, generate recurring visits, migrate special tasks off & delete old-phase '
  'visits. All-or-nothing.';
