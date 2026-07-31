-- Limpia el system_prompt guardado para que use el prompt de Codi por defecto
-- Solo afecta tenants que tengan el prompt viejo genérico guardado
UPDATE tenant_ai_config
SET system_prompt = NULL
WHERE system_prompt LIKE '%asistente de operaciones y calidad llamado "Intap"%'
   OR system_prompt LIKE '%Eres un asistente%';
