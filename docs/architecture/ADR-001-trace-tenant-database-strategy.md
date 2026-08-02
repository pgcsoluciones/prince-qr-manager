# ADR-001 — Estrategia de bases de datos por tenant

## Estado

Aceptada como dirección arquitectónica inicial.

## Contexto

INTAP Trace necesita servir tenants pequeños, profesionales
y empresariales sin mezclar información ni obligar a una
migración completa prematura.

Cloudflare D1 permite utilizar múltiples bases de datos, pero
el acceso directo desde un Worker ocurre mediante bindings
configurados. La selección de una base dedicada no debe
simularse sustituyendo un identificador dinámicamente dentro
de `env.DB`.

## Decisión

INTAP Trace utilizará una estrategia híbrida:

### Modo shared

Una base D1 compartida con aislamiento obligatorio mediante
`tenant_id`.

Uso inicial:

- Preview.
- QA.
- tenants pequeños.
- desarrollo de la V1.

### Modo dedicated

Una base D1 dedicada para tenants que lo requieran.

Su implementación futura deberá utilizar una estrategia
explícita de aprovisionamiento y acceso, por ejemplo:

- Worker de datos dedicado;
- Service Binding;
- configuración administrada de bindings;
- proxy controlado;
- mecanismo equivalente aprobado.

No se permitirá fallback silencioso desde `dedicated` hacia
`shared`.

## Reglas

1. Los módulos Trace no deben depender directamente de
   `env.DB`.
2. Todo acceso debe atravesar la capa
   `trace/shared/database.js`.
3. La base compartida conserva `tenant_id` en todas las
   entidades operativas.
4. Los archivos pesados permanecen en R2.
5. La base central futura almacenará el directorio de tenants,
   planes, entitlements y estrategia de almacenamiento.
6. Una ejecución debe permanecer en la misma base durante
   todo su ciclo de vida.
7. La migración de un tenant deberá ser auditable y reversible.
8. Producción no se modifica durante este refactor.

## Consecuencia inmediata

La aplicación continúa utilizando `env.DB`, pero ahora a
través de una abstracción controlada. Esto permite continuar
el motor operativo sin fijarlo permanentemente a una única
estrategia de almacenamiento.
