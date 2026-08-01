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


function normalizeSupportConfirmationText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[¿?¡!.,;:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isSupportConfirmation(value) {
  const normalized =
    normalizeSupportConfirmationText(value);

  return new Set([
    "si",
    "si por favor",
    "correcto",
    "confirmado",
    "envialo",
    "si envialo",
    "crealo",
    "si crealo",
    "abre el ticket",
    "si abre el ticket",
    "hazlo",
    "si hazlo",
    "adelante",
    "de acuerdo",
  ]).has(normalized);
}

export function isSupportCancellation(value) {
  const normalized =
    normalizeSupportConfirmationText(value);

  return new Set([
    "no",
    "no gracias",
    "cancelar",
    "cancelalo",
    "todavia no",
    "aun no",
    "dejalo pendiente",
  ]).has(normalized);
}

export function mergeSupportDraft(
  previousValue,
  nextValue
) {
  const previous =
    sanitizeSupportDraft(previousValue);

  const source =
    nextValue &&
    typeof nextValue === "object" &&
    !Array.isArray(nextValue)
      ? nextValue
      : {};

  const next =
    sanitizeSupportDraft(source);

  const merged = {
    ...previous,
  };

  for (const key of Object.keys(previous)) {
    if (
      !Object.prototype.hasOwnProperty.call(
        source,
        key
      )
    ) {
      continue;
    }

    if (key === "attachments") {
      merged.attachments =
        next.attachments;

      continue;
    }

    if (key === "confirmed") {
      merged.confirmed =
        next.confirmed;

      continue;
    }

    if (next[key] !== null) {
      merged[key] =
        next[key];
    }
  }

  return sanitizeSupportDraft(merged);
}


export function enforceSupportTicketConfirmation({
  message,
  previousState,
  agentOutput,
}) {
  const previous =
    previousState &&
    typeof previousState === "object"
      ? previousState
      : {};

  const output =
    agentOutput &&
    typeof agentOutput === "object"
      ? agentOutput
      : {};

  if (
    previous.awaiting !==
    "support_ticket_confirmation"
  ) {
    return output;
  }

  const outputState =
    output.state &&
    typeof output.state === "object"
      ? output.state
      : {};

  const draft =
    mergeSupportDraft(
      previous.support_ticket_draft,
      outputState.support_ticket_draft ||
      output.ui_action?.payload
    );

  if (isSupportConfirmation(message)) {
    const confirmedDraft =
      sanitizeSupportDraft({
        ...draft,
        confirmed: true,
      });

    return {
      ...output,

      reply:
        "Perfecto. Estoy registrando el ticket con la información confirmada.",

      state: {
        ...previous,
        ...outputState,

        active_goal:
          "create_support_ticket",

        module:
          "support",

        current_stage:
          "support_submitting",

        current_action:
          "submit_support_ticket",

        expected_result:
          "El backend crea el ticket y devuelve su número real",

        awaiting:
          null,

        action_status:
          "attempted",

        transition:
          "advance",

        last_user_result:
          "confirmed",

        last_offered_action:
          "submit_support_ticket",

        support_ticket_draft:
          confirmedDraft,

        status:
          "active",
      },

      ui_action: {
        type:
          "submit_support_ticket",

        payload:
          confirmedDraft,
      },
    };
  }

  if (isSupportCancellation(message)) {
    return {
      ...output,

      reply:
        "De acuerdo. No enviaré el ticket y conservaré la información por si deseas retomarlo.",

      state: {
        ...previous,
        ...outputState,

        active_goal:
          "create_support_ticket",

        module:
          "support",

        current_stage:
          "support_confirmation",

        current_action:
          null,

        expected_result:
          null,

        awaiting:
          null,

        action_status:
          "not_started",

        transition:
          "pause",

        last_user_result:
          "not_confirmed",

        support_ticket_draft:
          sanitizeSupportDraft({
            ...draft,
            confirmed: false,
          }),

        status:
          "paused",
      },

      ui_action: {
        type:
          "none",

        payload:
          null,
      },
    };
  }

  return output;
}

export const CODI_SUPPORT_INSTRUCTIONS = String.raw`
## SOPORTE HUMANO Y TICKETS

Gestiona el soporte según la intención real detectada, no por coincidencia
de palabras clave.

### CONVERSACIÓN INICIAL

Cuando el usuario mencione soporte, una persona, ayuda humana o un problema:

- Comprende primero qué desea lograr.
- Si solo solicita información, responde la consulta.
- Si la intención es ambigua, aclárala con una pregunta breve.
- Si solicita atención humana, explica naturalmente que puedes ayudarle
  a preparar una solicitud para el equipo de soporte.
- No afirmes que estás transfiriendo la conversación.
- No afirmes que el ticket se está creando antes de recopilar los datos
  y recibir confirmación final.
- No inventes teléfono, correo, chat en vivo ni otro canal.

No utilices una respuesta fija. Redacta según el contexto real.

### ACTIVACIÓN DEL TICKET

Activa el objetivo create_support_ticket cuando la conversación confirme
que el usuario desea registrar una solicitud para el equipo de soporte.

Al activarlo:

- active_goal = "create_support_ticket"
- module = "support"
- mode = "guided"
- current_stage = "support_collecting"
- awaiting = "support_ticket_details"
- status = "active"
- support_ticket_draft.confirmed = false

Usa ui_action "start_support_ticket" al iniciar el borrador.

### RECOLECCIÓN ESTRUCTURADA TEMPORAL

Durante la recopilación conserva una conversación natural, pero formula
una sola pregunta concreta por turno.

Recopila únicamente lo que falte:

- category
- subject
- situation
- impact
- expected_resolution
- severity
- datos de contacto únicamente cuando no estén disponibles en la sesión

No obligues al usuario a redactar categorías, asuntos o severidades técnicas.
Infiérelos prudentemente a partir de lo que explique.

Usa preguntas cerradas cuando haya opciones limitadas.

Ejemplos:

- "¿El problema te impide trabajar por completo o puedes continuar parcialmente?"
- "¿El error ocurre siempre o solo algunas veces?"
- "¿Deseas que soporte corrija el acceso o que te indique el procedimiento?"

Usa una pregunta abierta breve cuando necesites conocer el problema:

- "¿Qué ocurrió cuando intentaste hacerlo?"
- "¿Qué mensaje aparece en pantalla?"

No hagas interrogatorios extensos.
No preguntes datos que ya estén en el historial o en support_ticket_draft.

Usa ui_action "update_support_ticket_draft" mientras actualizas el borrador.

### MEMORIA DEL CASO

support_ticket_draft es acumulativo.

- Conserva los datos ya recopilados.
- Incorpora nueva información sin borrar la anterior.
- Solo reemplaza un dato cuando el usuario lo corrija.
- "Ya te expliqué", "eso mismo" o expresiones equivalentes remiten
  a la información anterior.
- Nunca reinicies el caso porque el usuario responda de forma breve.
- Si el usuario cambia de tema temporalmente, conserva el borrador
  sin obligarlo a continuar.

### RESUMEN Y CONFIRMACIÓN

Cuando exista información suficiente para comprender el caso:

- Presenta un resumen breve y natural.
- Incluye problema, situación, impacto y resultado esperado cuando estén disponibles.
- Permite que el usuario corrija el resumen.
- Formula una sola pregunta final para confirmar el envío.

Actualiza:

- current_stage = "support_confirmation"
- current_action = "confirm_support_ticket"
- awaiting = "support_ticket_confirmation"
- expected_result = "El usuario confirma, corrige o cancela el envío"
- transition = "stay"
- support_ticket_draft.confirmed = false

Todavía no afirmes que el ticket fue creado.

### ENVÍO

Solo después de una confirmación final explícita:

- current_stage = "support_submitting"
- current_action = "submit_support_ticket"
- awaiting = null
- action_status = "attempted"
- transition = "advance"
- support_ticket_draft.confirmed = true
- ui_action.type = "submit_support_ticket"
- ui_action.payload contiene el borrador completo

No inventes el número, estado ni prioridad.

### RESULTADO REAL

Solo confirma la creación después de recibir last_action_result del backend.

Si fue exitoso:

- Informa ticket_number, status y service_priority reales.
- Marca current_stage = "support_completed".
- Marca status = "completed".
- No vuelvas a enviar el mismo ticket.

Si falló:

- Explica que todavía no se creó.
- Conserva el borrador.
- Permite reintentar.
- No reinicies la recopilación.
- No inventes información.

No mezcles severidad del incidente con prioridad de servicio del plan.
`;
