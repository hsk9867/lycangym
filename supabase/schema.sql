-- 라이칸짐 연수점 — Supabase 스키마 (SQL Editor 에 붙여넣고 Run)
-- site_content : 관리자가 바꾼 문구·가격표·리뷰·사진 목록 (key → jsonb)
-- visits       : 방문 기록 (브라우저가 anon 키로 insert 만, 읽기는 로그인한 관리자만)
-- storage 'site' 버킷 : 관리자가 올린 사진 (공개 읽기)

create table if not exists public.site_content (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.site_content enable row level security;
drop policy if exists "site_content public read" on public.site_content;
create policy "site_content public read"  on public.site_content for select using (true);
drop policy if exists "site_content admin insert" on public.site_content;
create policy "site_content admin insert" on public.site_content for insert to authenticated with check (true);
drop policy if exists "site_content admin update" on public.site_content;
create policy "site_content admin update" on public.site_content for update to authenticated using (true) with check (true);
drop policy if exists "site_content admin delete" on public.site_content;
create policy "site_content admin delete" on public.site_content for delete to authenticated using (true);

create table if not exists public.visits (
  id   bigint generated always as identity primary key,
  ts   timestamptz not null default now(),
  page text not null,
  ref  text,
  sid  text,
  w    int
);
create index if not exists visits_ts_idx on public.visits (ts desc);
alter table public.visits enable row level security;
drop policy if exists "visits anon insert" on public.visits;
create policy "visits anon insert" on public.visits for insert to anon, authenticated
  with check (char_length(page) <= 200 and (ref is null or char_length(ref) <= 200) and (sid is null or char_length(sid) <= 32));
drop policy if exists "visits admin read" on public.visits;
create policy "visits admin read" on public.visits for select to authenticated using (true);
drop policy if exists "visits admin delete" on public.visits;
create policy "visits admin delete" on public.visits for delete to authenticated using (true);

-- 사진 버킷
insert into storage.buckets (id, name, public) values ('site', 'site', true) on conflict (id) do nothing;
drop policy if exists "site bucket public read" on storage.objects;
create policy "site bucket public read"   on storage.objects for select using (bucket_id = 'site');
drop policy if exists "site bucket admin insert" on storage.objects;
create policy "site bucket admin insert"  on storage.objects for insert to authenticated with check (bucket_id = 'site');
drop policy if exists "site bucket admin update" on storage.objects;
create policy "site bucket admin update"  on storage.objects for update to authenticated using (bucket_id = 'site');
drop policy if exists "site bucket admin delete" on storage.objects;
create policy "site bucket admin delete"  on storage.objects for delete to authenticated using (bucket_id = 'site');

-- 관리자 계정은 Authentication → Users → Add user (이메일·비밀번호, Auto Confirm 체크) 로 만든다.
-- Authentication → Providers → Email 에서 "Allow new users to sign up" 은 꺼 둔다.
