-- ============================================================================
-- Bereka Tenant Register — Supabase schema
-- Paste this whole file into Supabase Studio → SQL Editor → New query → Run.
-- Safe to re-run: everything uses IF NOT EXISTS / OR REPLACE / DROP...IF EXISTS.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------
create table if not exists tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 200),
  room text not null default '',
  floor text not null check (char_length(floor) between 1 and 50),
  phone text not null default '' check (char_length(phone) <= 20),
  contract_start text not null default '',
  contract_end text not null default '',
  pay_start_raw text not null default '',
  amt3 numeric check (amt3 is null or (amt3 >= 0 and amt3 <= 10000000)),
  amt6 numeric check (amt6 is null or (amt6 >= 0 and amt6 <= 10000000)),
  -- Payment-end date, stored as three plain ints (Ethiopian calendar) —
  -- never as a Gregorian timestamp, so no timezone/conversion bugs.
  pay_end_y int,
  pay_end_m int check (pay_end_m is null or pay_end_m between 1 and 12),
  pay_end_d int check (pay_end_d is null or pay_end_d between 1 and 30),
  created_at timestamptz not null default now()
);

-- One permanent row per recorded payment — never overwritten, never
-- collapsed into a single "paid"/"unpaid" flag. There is deliberately no
-- UPDATE policy on this table below, so even the owner can only insert or
-- delete a payment, never edit one after the fact.
create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  cycle int not null check (cycle in (3, 6)),
  amount numeric,
  from_y int not null, from_m int not null check (from_m between 1 and 12), from_d int not null check (from_d between 1 and 30),
  to_y int not null,   to_m int not null check (to_m between 1 and 12),     to_d int not null check (to_d between 1 and 30),
  recorded_at timestamptz not null default now()
);

create index if not exists payments_tenant_id_idx on payments(tenant_id);

-- ---------------------------------------------------------------------------
-- 2. Row Level Security
--    Read: open to everyone (viewers included, even signed-out).
--    Write: only a signed-in user. There is no sign-up form anywhere in the
--    app, so the only way an account exists is one you create yourself in
--    Supabase Studio (see README) — "signed in" and "the owner" are the
--    same thing by construction.
-- ---------------------------------------------------------------------------
alter table tenants enable row level security;
alter table payments enable row level security;

drop policy if exists "public can view tenants" on tenants;
create policy "public can view tenants" on tenants for select using (true);

drop policy if exists "owner can insert tenants" on tenants;
create policy "owner can insert tenants" on tenants for insert
  with check (auth.role() = 'authenticated');

drop policy if exists "owner can update tenants" on tenants;
create policy "owner can update tenants" on tenants for update
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "owner can delete tenants" on tenants;
create policy "owner can delete tenants" on tenants for delete
  using (auth.role() = 'authenticated');

drop policy if exists "public can view payments" on payments;
create policy "public can view payments" on payments for select using (true);

drop policy if exists "owner can insert payments" on payments;
create policy "owner can insert payments" on payments for insert
  with check (auth.role() = 'authenticated');

drop policy if exists "owner can delete payments" on payments;
create policy "owner can delete payments" on payments for delete
  using (auth.role() = 'authenticated');
-- No update policy on payments at all — an UPDATE is denied for every
-- role, owner included. That enforces "payment history is permanent" at
-- the database layer, not just in the app's UI.

-- ---------------------------------------------------------------------------
-- 3. Ethiopian calendar helpers (server-side, used only by the RPCs below)
--    Pagume (month 13) never counts as a rent month — any date that lands
--    there rolls forward to Meskerem 1 of the following year. Mirrors
--    src/ethiopianCalendar.js exactly, so both sides agree.
-- ---------------------------------------------------------------------------
create or replace function eth_normalize(p_y int, p_m int, p_d int)
returns table(y int, m int, d int)
language sql immutable
as $$
  select
    case when p_m = 13 then p_y + 1 else p_y end,
    case when p_m = 13 then 1 else p_m end,
    case when p_m = 13 then 1 else p_d end;
$$;

create or replace function eth_add_months(p_y int, p_m int, p_d int, p_n int)
returns table(y int, m int, d int)
language plpgsql immutable
as $$
declare
  mm int := p_m + p_n;
  yy int := p_y;
begin
  while mm > 12 loop
    mm := mm - 12;
    yy := yy + 1;
  end loop;
  return query select * from eth_normalize(yy, mm, p_d);
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Payment RPCs — the only place payment dates are computed.
--    security invoker (the default) means these run with the CALLER's own
--    permissions, so the RLS policies above still apply inside them: an
--    unauthenticated caller gets an RLS error the moment the function tries
--    to write, exactly as if they'd called the table directly.
-- ---------------------------------------------------------------------------
create or replace function record_payment(p_tenant_id uuid, p_cycle int)
returns tenants
language plpgsql
security invoker
as $$
declare
  t tenants;
  new_y int; new_m int; new_d int;
  amt numeric;
begin
  if p_cycle not in (3, 6) then
    raise exception 'cycle must be 3 or 6';
  end if;

  select * into t from tenants where id = p_tenant_id for update;
  if t.id is null then
    raise exception 'tenant not found';
  end if;
  if t.pay_end_y is null then
    raise exception 'payEnd not set for this tenant';
  end if;

  select eam.y, eam.m, eam.d into new_y, new_m, new_d
  from eth_add_months(t.pay_end_y, t.pay_end_m, t.pay_end_d, p_cycle) as eam;

  amt := case when p_cycle = 3 then t.amt3 else t.amt6 end;

  insert into payments (tenant_id, cycle, amount, from_y, from_m, from_d, to_y, to_m, to_d)
  values (p_tenant_id, p_cycle, amt, t.pay_end_y, t.pay_end_m, t.pay_end_d, new_y, new_m, new_d);

  update tenants set pay_end_y = new_y, pay_end_m = new_m, pay_end_d = new_d
  where id = p_tenant_id
  returning * into t;

  return t;
end;
$$;

create or replace function revert_last_payment(p_tenant_id uuid)
returns tenants
language plpgsql
security invoker
as $$
declare
  t tenants;
  last_payment payments;
begin
  select * into t from tenants where id = p_tenant_id for update;
  if t.id is null then
    raise exception 'tenant not found';
  end if;

  select * into last_payment from payments
    where tenant_id = p_tenant_id
    order by recorded_at desc, id desc
    limit 1;
  if last_payment.id is null then
    raise exception 'no payment history for this tenant';
  end if;

  update tenants
    set pay_end_y = last_payment.from_y, pay_end_m = last_payment.from_m, pay_end_d = last_payment.from_d
    where id = p_tenant_id
    returning * into t;

  delete from payments where id = last_payment.id;

  return t;
end;
$$;

revoke execute on function record_payment(uuid, int) from public;
grant execute on function record_payment(uuid, int) to authenticated;
revoke execute on function revert_last_payment(uuid) from public;
grant execute on function revert_last_payment(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Realtime — powers auto-sync. If this errors with "publication does
--    not exist", enable Realtime for both tables instead via
--    Database → Replication in Supabase Studio, then skip this block.
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table tenants;
alter publication supabase_realtime add table payments;
