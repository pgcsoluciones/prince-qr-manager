-- Fase 1a: Agrega rubro de negocio a usuarios
ALTER TABLE users ADD COLUMN rubro TEXT NOT NULL DEFAULT 'general';

-- Rubros disponibles: general, restaurante, retail, eventos, logistica, salud, educacion, otro
