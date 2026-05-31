-- Add max_tokens_per_response and knowledge_base to tenant_ai_config
ALTER TABLE tenant_ai_config ADD COLUMN max_tokens_per_response INTEGER DEFAULT 1000;
ALTER TABLE tenant_ai_config ADD COLUMN knowledge_base TEXT;
