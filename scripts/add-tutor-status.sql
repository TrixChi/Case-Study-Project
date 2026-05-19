alter table public.tutor
add column if not exists status text not null default 'active';

alter table public.tutor
drop constraint if exists tutor_status_check;

alter table public.tutor
add constraint tutor_status_check
check (status in ('active', 'on leave', 'dismissed'));
