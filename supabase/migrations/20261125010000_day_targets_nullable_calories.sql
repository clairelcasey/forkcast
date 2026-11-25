-- No calorie target exists until a baseline is estimated (issue 16), but the
-- day type and protein target still apply. Null means "no calorie target yet".
alter table public.day_targets alter column calories drop not null;
