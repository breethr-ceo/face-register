-- Run once in Supabase SQL Editor, or apply with supabase db push.
create table public.face_operators (
  user_id uuid primary key references auth.users(id) on delete cascade
);
create table public.face_people (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 100),
  descriptor double precision[] not null check (array_length(descriptor, 1) = 128),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  consent_at timestamptz not null default now()
);
alter table public.face_operators enable row level security;
alter table public.face_people enable row level security;
revoke all on public.face_operators, public.face_people from anon, authenticated;

-- No table access from browsers. Only these narrowly scoped RPCs are granted.
create function public.face_lookup(p_descriptor double precision[], p_name text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  candidate record;
  second_distance double precision;
  person_id uuid;
  match_threshold constant double precision := 0.50;
  ambiguity_margin constant double precision := 0.05;
begin
  if auth.uid() is null or not exists (select 1 from public.face_operators where user_id = auth.uid()) then
    raise exception 'Operator access required' using errcode = '42501';
  end if;
  if p_descriptor is null or array_ndims(p_descriptor) <> 1 or array_lower(p_descriptor,1) <> 1 or cardinality(p_descriptor) <> 128 or exists (
    select 1 from unnest(p_descriptor) v where v is null or v::text in ('NaN','Infinity','-Infinity') or abs(v) > 10
  ) then raise exception 'Invalid face reference'; end if;
  if p_name is not null and length(trim(p_name)) not between 1 and 100 then raise exception 'Name must be 1–100 characters'; end if;
  -- Serialize check-and-insert across operators to prevent concurrent duplicate rows.
  perform pg_advisory_xact_lock(71620916);
  select p.id, p.name, sqrt((select sum(power(p.descriptor[i] - p_descriptor[i], 2)) from generate_series(1,128) i)) as distance
    into candidate from public.face_people p order by distance limit 1;
  if candidate.id is not null and candidate.distance <= match_threshold then
    select sqrt((select sum(power(p.descriptor[i] - p_descriptor[i], 2)) from generate_series(1,128) i)) as distance
      into second_distance from public.face_people p where p.id <> candidate.id order by distance limit 1;
    if second_distance is not null and second_distance - candidate.distance < ambiguity_margin then
      return jsonb_build_object('status','ambiguous');
    end if;
    return jsonb_build_object('status',case when p_name is null then 'identified' else 'already_registered' end,'id',candidate.id,'name',candidate.name);
  end if;
  if p_name is null then return jsonb_build_object('status','not_found'); end if;
  -- A near match must not silently become a second registration.
  if candidate.id is not null and candidate.distance <= match_threshold + ambiguity_margin then
    return jsonb_build_object('status','ambiguous');
  end if;
  insert into public.face_people(name,descriptor,created_by) values(trim(p_name),p_descriptor,auth.uid()) returning id into person_id;
  return jsonb_build_object('status','registered','id',person_id,'name',trim(p_name));
end $$;
revoke all on function public.face_lookup(double precision[],text) from public, anon;
grant execute on function public.face_lookup(double precision[],text) to authenticated;

create function public.face_operator_access() returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.face_operators where user_id = auth.uid());
$$;
revoke all on function public.face_operator_access() from public, anon;
grant execute on function public.face_operator_access() to authenticated;
