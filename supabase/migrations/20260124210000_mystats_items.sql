-- MyStats Cloud Sync (single-table model)

create table if not exists public.mystats_items (
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('journal', 'skills', 'solutions', 'insights')),
  id uuid not null,
  payload jsonb not null,
  last_modified bigint not null,
  deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, kind, id)
);

create index if not exists mystats_items_user_kind_last_modified_idx
  on public.mystats_items (user_id, kind, last_modified);

alter table public.mystats_items enable row level security;

create policy "mystats_items_select_own"
  on public.mystats_items
  for select
  using (auth.uid() = user_id);

create policy "mystats_items_insert_own"
  on public.mystats_items
  for insert
  with check (auth.uid() = user_id);

create policy "mystats_items_update_own"
  on public.mystats_items
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "mystats_items_delete_own"
  on public.mystats_items
  for delete
  using (auth.uid() = user_id);

-- updated_at trigger
create or replace function public.mystats_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists mystats_items_set_updated_at on public.mystats_items;
create trigger mystats_items_set_updated_at
before update on public.mystats_items
for each row execute procedure public.mystats_set_updated_at();

