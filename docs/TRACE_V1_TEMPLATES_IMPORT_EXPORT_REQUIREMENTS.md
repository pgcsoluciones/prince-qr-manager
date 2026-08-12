# INTAP TRACE V1 · Plantillas, importación masiva y reportes

Este documento registra requisitos estructurales de V1. No constituyen un motor paralelo ni alteran el orden del roadmap operacional.

## 1. Plantillas base por rubro

INTAP TRACE deberá ofrecer plantillas de procesos base por rubro. Cada plantilla podrá precargar procesos, etapas, campos, roles responsables, reglas de evidencia, aprobaciones y configuraciones sugeridas.

Principios:
- Una plantilla es un punto de partida, no un proceso rígido.
- Al instanciarla para un tenant se crea una copia editable dentro del dominio normal `Process -> Version -> Stages`.
- El tenant podrá agregar, eliminar, reordenar y editar etapas y campos antes de publicar una versión.
- Las versiones publicadas permanecen inmutables; los cambios posteriores generan una nueva versión.
- Logística, construcción y futuros rubros usan el mismo motor de procesos y ejecuciones.
- Las plantillas deberán ser tenant-safe y no compartir datos operativos entre organizaciones.

Rubros iniciales previstos incluyen construcción, logística y otros definidos por producto sin hardcodear la lógica del motor a un sector específico.

## 2. Importación masiva por archivos Excel

La V1 deberá soportar importación por lotes, como mínimo, de:
- recursos / activos trazables;
- procesos y sus configuraciones;
- usuarios;
- participantes y asignaciones.

Requisitos:
- archivo plantilla descargable por tipo de importación;
- validación previa antes de escribir en D1;
- vista de errores por fila y columna;
- ejecución atómica por registro y reporte de éxitos/fallos;
- no crear relaciones cruzadas entre tenants;
- capacidad de reintentar solo filas fallidas;
- identificadores externos para reconciliación e idempotencia;
- resumen final del lote importado;
- archivos grandes procesados por lotes controlados, evitando bloquear el Worker.

## 3. Exportación y reportes

TRACE deberá exportar reportes en varios formatos. Como base de V1 se contemplan:
- XLSX para análisis tabular;
- CSV para interoperabilidad;
- PDF para reporte formal/compartible;
- JSON para integraciones y respaldo estructurado.

Los reportes podrán construirse por tenant, proceso, ejecución, activo, rango de fechas, estado, incidencias, evidencias y participantes según permisos.

La exportación pública nunca debe reutilizar entidades internas completas. Debe partir de DTO/proyecciones explícitamente seguras, igual que `trace_public_projections`.

## 4. Compatibilidad con roadmap 9-12

- Threads y notificaciones se vinculan a `execution_id` y por tanto sobreviven a cualquier plantilla de rubro.
- La proyección pública consume únicamente información segura del motor normal.
- Logística agrega contexto especializado a una ejecución, sin crear un segundo motor.
- Las futuras importaciones deben poder instanciar datos que alimenten estos módulos sin modificar su contrato operativo.
