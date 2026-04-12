-- Add Indonesian translation column to SOPs
ALTER TABLE sops ADD COLUMN content_markdown_id TEXT;

-- Add Indonesian translation to version history
ALTER TABLE sop_versions ADD COLUMN content_markdown_id TEXT;
