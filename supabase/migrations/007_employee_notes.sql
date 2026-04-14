-- Add internal notes field to employees (manager-only, not shown to employee)
ALTER TABLE employees ADD COLUMN IF NOT EXISTS notes text;
