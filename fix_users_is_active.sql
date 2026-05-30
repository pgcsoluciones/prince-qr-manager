-- Fix users with NULL is_active (created before DEFAULT was set)
UPDATE users SET is_active = 1 WHERE is_active IS NULL;
