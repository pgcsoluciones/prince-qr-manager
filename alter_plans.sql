ALTER TABLE plan_configs ADD COLUMN billing_cycles TEXT DEFAULT '["monthly","quarterly","semiannual","annual"]';
ALTER TABLE plan_configs ADD COLUMN annual_discount_pct INTEGER DEFAULT 20;
ALTER TABLE plan_configs ADD COLUMN quarterly_discount_pct INTEGER DEFAULT 10;
ALTER TABLE plan_configs ADD COLUMN semiannual_discount_pct INTEGER DEFAULT 15;
ALTER TABLE plan_configs ADD COLUMN features_json TEXT DEFAULT '{}';
ALTER TABLE plan_configs ADD COLUMN trial_days INTEGER DEFAULT 14;
