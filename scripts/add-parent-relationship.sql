alter table public.parent
add column if not exists studentID integer unique,
add column if not exists approved text not null default 'pending',
add column if not exists "relationshipStatus" text not null default 'guardian',
add column if not exists validatedBy integer,
add column if not exists validatedAt timestamptz;

alter table public.parent
alter column approved drop default;

alter table public.parent
alter column approved type text using case
	when approved::text in ('true', 't', '1') then 'approved'
	when approved::text in ('false', 'f', '0') then case when validatedAt is null then 'pending' else 'rejected' end
	when approved::text in ('approved', 'rejected', 'pending') then approved::text
	else case when validatedAt is null then 'pending' else 'rejected' end
end;

alter table public.parent
alter column approved set default 'pending';

alter table public.parent
drop constraint if exists parent_relationship_status_check;

alter table public.parent
drop constraint if exists parent_relationshipstatus_check;

update public.parent
set "relationshipStatus" = case
	when lower(coalesce("relationshipStatus", '')) in ('guardian', 'mother', 'father') then lower("relationshipStatus")
	when lower(coalesce(relationship, '')) in ('guardian', 'mother', 'father') then lower(relationship)
	else 'guardian'
end
where "relationshipStatus" is null
	 or lower("relationshipStatus") not in ('guardian', 'mother', 'father');

alter table public.parent
add constraint parent_relationship_status_check
check ("relationshipStatus" in ('guardian', 'mother', 'father'));

alter table public.parent
add constraint parent_approved_check
check (approved in ('pending', 'approved', 'rejected'));

alter table public.parent
add constraint parent_student_id_fkey
foreign key (studentID) references public.student(studentID) on delete cascade;

alter table public.parent
add constraint parent_validated_by_fkey
foreign key (validatedBy) references public.admin_staff(staffID) on delete set null;