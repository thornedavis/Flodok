-- Bank account details and personal NPWP (tax ID) for each employee.
-- Captured during the candidate onboarding flow before day one so payroll
-- can pay them and the company can submit tax filings without chasing.
--
-- All nullable so existing employees aren't required to backfill, and
-- candidates can skip during onboarding if they don't have it handy.
--
-- npwp is text rather than a fixed-width type because Indonesian NPWP
-- exists in 15-digit (legacy) and 16-digit (post-2024) forms; we store
-- whatever the employee gives us.

alter table public.employees
  add column npwp text,
  add column bank_name text,
  add column bank_account_number text,
  add column bank_account_holder text;
