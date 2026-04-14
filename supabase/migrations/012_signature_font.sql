-- Add signature font field to store the selected signature style
alter table sop_signatures add column if not exists signature_font text;
