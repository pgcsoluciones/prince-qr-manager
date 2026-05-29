ALTER TABLE trace_points ADD COLUMN brand_color TEXT DEFAULT '#2563eb';
ALTER TABLE trace_points ADD COLUMN brand_logo TEXT;
ALTER TABLE trace_points ADD COLUMN trace_project_id TEXT;
ALTER TABLE trace_points ADD COLUMN scan_count INTEGER DEFAULT 0;
ALTER TABLE trace_points ADD COLUMN last_scan_at TEXT;
