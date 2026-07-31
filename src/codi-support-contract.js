export const CODI_SUPPORT_ACTIONS = Object.freeze([
  "none",
  "start_support_ticket",
  "update_support_ticket_draft",
  "submit_support_ticket",
]);

export const CODI_SUPPORT_EMPTY_DRAFT = Object.freeze({
  category: null,
  subject: null,
  situation: null,
  impact: null,
  expected_resolution: null,
  severity: "normal",
  requester_name: null,
  requester_email: null,
  requester_phone: null,
  company_name: null,
  attachments: [],
  confirmed: false,
});

export function sanitizeSupportDraft(value) {
  const source = value && typeof value === "object" ? value : {};
  const text = (key, max) => {
    const raw = source[key];
    return typeof raw === "string" && raw.trim() ? raw.trim().slice(0, max) : null;
  };
  const severity = ["low", "normal", "high", "critical"].includes(source.severity)
    ? source.severity
    : "normal";

  return {
    category: text("category", 60),
    subject: text("subject", 180),
    situation: text("situation", 5000),
    impact: text("impact", 2000),
    expected_resolution: text("expected_resolution", 2000),
    severity,
    requester_name: text("requester_name", 160),
    requester_email: text("requester_email", 254),
    requester_phone: text("requester_phone", 80),
    company_name: text("company_name", 180),
    attachments: Array.isArray(source.attachments)
      ? source.attachments.filter((item) => typeof item === "string").slice(0, 10)
      : [],
    confirmed: source.confirmed === true,
  };
}

export function sanitizeCodiUiAction(value) {
  if (!value || typeof value !== "object") return { type: "none", payload: null };
  const type = CODI_SUPPORT_ACTIONS.includes(value.type) ? value.type : "none";
  if (type === "none") return { type, payload: null };
  return { type, payload: sanitizeSupportDraft(value.payload) };
}

export const CODI_SUPPORT_INSTRUCTIONS = String.raw`
## SOPORTE HUMANO Y TICKETS

Cuando el usuario pida ayuda humana, soporte, reportar un problema o abrir un caso:

- No prometas una transferencia en vivo ni inventes canales.
- Guía la creación de un ticket dentro de la conversación.
- Recopila únicamente los datos faltantes: categoría, asunto, situación, impacto,
  resultado esperado y datos de contacto cuando no estén disponibles.
- Conserva un borrador estructurado en support_ticket_draft.
- Permite correcciones antes de enviar.
- Antes de crear el ticket, presenta un resumen y solicita una confirmación final explícita.
- Solamente después de esa confirmación emite ui_action.type = "submit_support_ticket".
- Nunca afirmes que el ticket fue creado hasta recibir un resultado real del backend.
- Si last_action_result indica error, conserva el borrador y explica que no se creó.
- Si last_action_result indica éxito, informa el ticket_number, status y service_priority reales.
- No mezcles severidad del incidente con prioridad de servicio del plan.
- Para iniciar o continuar el borrador usa ui_action "start_support_ticket" o
  "update_support_ticket_draft". Para cualquier otro turno usa "none".
`;
