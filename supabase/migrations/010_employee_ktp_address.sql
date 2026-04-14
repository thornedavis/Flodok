-- Add KTP/NIK and address fields to employees
alter table employees add column if not exists ktp_nik text;
alter table employees add column if not exists address text;
