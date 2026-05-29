ALTER TABLE plan_configs ADD COLUMN IF NOT EXISTS billing_cycles TEXT DEFAULT '["monthly","quarterly","semiannual","annual"]';
ALTER TABLE plan_configs ADD COLUMN IF NOT EXISTS annual_discount_pct INTEGER DEFAULT 20;
ALTER TABLE plan_configs ADD COLUMN IF NOT EXISTS quarterly_discount_pct INTEGER DEFAULT 10;
ALTER TABLE plan_configs ADD COLUMN IF NOT EXISTS semiannual_discount_pct INTEGER DEFAULT 15;
ALTER TABLE plan_configs ADD COLUMN IF NOT EXISTS features_json TEXT DEFAULT '{}';
ALTER TABLE plan_configs ADD COLUMN IF NOT EXISTS trial_days INTEGER DEFAULT 14;
