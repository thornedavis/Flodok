-- Allow multiple SOPs per employee and make employee_id optional
ALTER TABLE sops DROP CONSTRAINT IF EXISTS sops_employee_id_key;
ALTER TABLE sops ALTER COLUMN employee_id DROP NOT NULL;
