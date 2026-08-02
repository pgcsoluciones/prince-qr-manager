/**
 * Punto único de resolución de base de datos para INTAP Trace.
 *
 * Estado actual:
 * - Preview utiliza el binding compartido env.DB.
 * - El aislamiento lógico se mantiene mediante tenant_id.
 *
 * Evolución prevista:
 * - shared: base D1 compartida con tenant_id.
 * - dedicated: base dedicada por tenant mediante una
 *   estrategia explícita de routing/proxy o bindings gestionados.
 *
 * Nunca debe aplicarse un fallback silencioso desde dedicated
 * hacia shared, porque podría provocar mezcla de datos.
 */

export class TraceDatabaseConfigurationError
  extends Error {
  constructor(message, details = {}) {
    super(message);

    this.name =
      "TraceDatabaseConfigurationError";

    this.code =
      "trace_database_configuration_error";

    this.details = details;
  }
}

export function resolveTraceDatabaseContext(
  env,
  tenantId = null
) {
  if (!env?.DB) {
    throw new TraceDatabaseConfigurationError(
      "El binding D1 DB no está disponible.",
      {
        expectedBinding: "DB",
        tenantId,
      }
    );
  }

  const requestedMode =
    String(
      env.TRACE_STORAGE_MODE || "shared"
    )
      .trim()
      .toLowerCase();

  if (requestedMode === "shared") {
    return {
      db: env.DB,
      mode: "shared",
      binding: "DB",
      tenantId,
      isolatedBy: "tenant_id",
    };
  }

  if (requestedMode === "dedicated") {
    throw new TraceDatabaseConfigurationError(
      "El modo dedicated necesita un proveedor de base dedicado configurado.",
      {
        requestedMode,
        tenantId,
        fallbackApplied: false,
      }
    );
  }

  throw new TraceDatabaseConfigurationError(
    "El modo de almacenamiento Trace no es válido.",
    {
      requestedMode,
      allowedModes: [
        "shared",
        "dedicated",
      ],
      tenantId,
    }
  );
}

export function getTraceDatabase(
  env,
  tenantId = null
) {
  return resolveTraceDatabaseContext(
    env,
    tenantId
  ).db;
}
