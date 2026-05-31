-- Fase 1: Agrega proveedor y modelo IA por plan
ALTER TABLE plan_configs ADD COLUMN ai_provider TEXT NOT NULL DEFAULT 'anthropic';
ALTER TABLE plan_configs ADD COLUMN ai_model TEXT NOT NULL DEFAULT 'claude-haiku-4-5-20251001';

-- Asignar valores por defecto según plan
UPDATE plan_configs SET ai_provider = 'cloudflare', ai_model = '@cf/meta/llama-3.1-8b-instruct' WHERE plan = 'free';
UPDATE plan_configs SET ai_provider = 'anthropic',  ai_model = 'claude-haiku-4-5-20251001'       WHERE plan = 'starter';
UPDATE plan_configs SET ai_provider = 'anthropic',  ai_model = 'claude-sonnet-4-6'               WHERE plan = 'pro';
UPDATE plan_configs SET ai_provider = 'anthropic',  ai_model = 'claude-sonnet-4-6'               WHERE plan = 'enterprise';
