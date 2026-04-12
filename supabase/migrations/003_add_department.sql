-- Add department field to employees
alter table employees add column department text;

-- Create index for filtering
create index idx_employees_department on employees (org_id, department);
