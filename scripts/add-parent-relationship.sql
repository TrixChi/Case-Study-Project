alter table public.parent
add column if not exists studentID integer unique,
add column if not exists relationship_status text not null default 'pending',
add column if not exists validatedBy integer,
add column if not exists validatedAt timestamptz;

alter table public.parent
drop constraint if exists parent_relationship_status_check;

alter table public.parent
add constraint parent_relationship_status_check
check (relationship_status in ('pending', 'approved', 'rejected'));

alter table public.parent
add constraint parent_student_id_fkey
foreign key (studentID) references public.student(studentID) on delete cascade;

alter table public.parent
add constraint parent_validated_by_fkey
foreign key (validatedBy) references public.admin_staff(staffID) on delete set null;