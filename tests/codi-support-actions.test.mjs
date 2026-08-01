import assert from "node:assert/strict";
import fs from "node:fs";

async function importEsmSource(path) {
  const source = fs.readFileSync(path, "utf8");
  const encoded = Buffer.from(source, "utf8").toString("base64");
  return import(`data:text/javascript;base64,${encoded}`);
}

const contract = await importEsmSource("src/codi-support-contract.js");
const {
  CODI_SUPPORT_ACTIONS,
  CODI_SUPPORT_EMPTY_DRAFT,
  CODI_SUPPORT_INSTRUCTIONS,
  enforceSupportTicketConfirmation,
  isSupportCancellation,
  isSupportConfirmation,
  mergeSupportDraft,
  sanitizeCodiUiAction,
  sanitizeSupportDraft,
} = contract;

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

test("acciones permitidas cerradas", () => {
  assert.deepEqual([...CODI_SUPPORT_ACTIONS], [
    "none",
    "start_support_ticket",
    "update_support_ticket_draft",
    "submit_support_ticket",
  ]);
  assert.equal(Object.isFrozen(CODI_SUPPORT_ACTIONS), true);
});

test("borrador vacío seguro", () => {
  assert.equal(CODI_SUPPORT_EMPTY_DRAFT.confirmed, false);
  assert.equal(CODI_SUPPORT_EMPTY_DRAFT.severity, "normal");
  assert.deepEqual(CODI_SUPPORT_EMPTY_DRAFT.attachments, []);
  assert.equal(Object.isFrozen(CODI_SUPPORT_EMPTY_DRAFT), true);
});

test("saneamiento y límites del borrador", () => {
  const draft = sanitizeSupportDraft({
    category: "  technical  ",
    subject: `  ${"a".repeat(220)}  `,
    situation: "  El QR no abre  ",
    severity: "critical",
    attachments: ["uno.png", 7, "dos.jpg", ...Array(20).fill("extra.txt")],
    confirmed: true,
    injected: "no debe sobrevivir",
  });

  assert.equal(draft.category, "technical");
  assert.equal(draft.subject.length, 180);
  assert.equal(draft.situation, "El QR no abre");
  assert.equal(draft.severity, "critical");
  assert.equal(draft.attachments.length, 10);
  assert.equal(draft.confirmed, true);
  assert.equal(Object.hasOwn(draft, "injected"), false);
});

test("valores inválidos vuelven a defaults", () => {
  const draft = sanitizeSupportDraft({ severity: "emergency", attachments: "archivo" });
  assert.equal(draft.severity, "normal");
  assert.deepEqual(draft.attachments, []);
  assert.equal(draft.confirmed, false);
});

test("acciones desconocidas no se ejecutan", () => {
  assert.deepEqual(sanitizeCodiUiAction(null), { type: "none", payload: null });
  assert.deepEqual(
    sanitizeCodiUiAction({ type: "delete_tenant", payload: { confirmed: true } }),
    { type: "none", payload: null }
  );
});

test("submit conserva solo payload saneado", () => {
  const action = sanitizeCodiUiAction({
    type: "submit_support_ticket",
    payload: {
      category: "technical",
      subject: "Problema con QR",
      situation: "No carga",
      severity: "high",
      confirmed: true,
      role: "superadmin",
    },
  });

  assert.equal(action.type, "submit_support_ticket");
  assert.equal(action.payload.confirmed, true);
  assert.equal(action.payload.severity, "high");
  assert.equal(Object.hasOwn(action.payload, "role"), false);
});

test("instrucciones exigen confirmación y resultado real", () => {
  assert.match(CODI_SUPPORT_INSTRUCTIONS, /confirmación final/i);
  assert.match(CODI_SUPPORT_INSTRUCTIONS, /(?:Nunca|Todavía no) afirmes que el ticket fue creado/i);
  assert.match(CODI_SUPPORT_INSTRUCTIONS, /(?:resultado real\s+del backend|last_action_result del backend)/i);
  assert.match(CODI_SUPPORT_INSTRUCTIONS, /No mezcles severidad del incidente con prioridad de servicio/i);
});

test("instrucciones conservan memoria y evitan repeticiones", () => {
  assert.match(
    CODI_SUPPORT_INSTRUCTIONS,
    /support_ticket_draft es acumulativo/i
  );

  assert.match(
    CODI_SUPPORT_INSTRUCTIONS,
    /Conserva los datos ya recopilados/i
  );

  assert.match(
    CODI_SUPPORT_INSTRUCTIONS,
    /No preguntes datos que ya estén en el historial o en support_ticket_draft/i
  );

  assert.match(
    CODI_SUPPORT_INSTRUCTIONS,
    /Ya te expliqué/i
  );

  assert.match(
    CODI_SUPPORT_INSTRUCTIONS,
    /Nunca reinicies el caso/i
  );
});

test("confirmación final habilita el envío estructurado", () => {
  assert.match(
    CODI_SUPPORT_INSTRUCTIONS,
    /support_ticket_confirmation/
  );

  assert.match(
    CODI_SUPPORT_INSTRUCTIONS,
    /Solo después de una confirmación final explícita/i
  );

  assert.match(
    CODI_SUPPORT_INSTRUCTIONS,
    /ui_action\.type = "submit_support_ticket"/
  );

  assert.match(
    CODI_SUPPORT_INSTRUCTIONS,
    /support_ticket_draft\.confirmed = true/
  );
});

test("flujo define etapas deterministas", () => {
  assert.match(CODI_SUPPORT_INSTRUCTIONS, /support_collecting/);
  assert.match(CODI_SUPPORT_INSTRUCTIONS, /support_confirmation/);
  assert.match(CODI_SUPPORT_INSTRUCTIONS, /support_submitting/);
  assert.match(CODI_SUPPORT_INSTRUCTIONS, /support_completed/);
});


test("clasifica confirmaciones y cancelaciones breves", () => {
  assert.equal(isSupportConfirmation("sí"), true);
  assert.equal(isSupportConfirmation("Sí, envíalo."), true);
  assert.equal(isSupportConfirmation("créalo"), true);
  assert.equal(isSupportConfirmation("ya te expliqué"), false);

  assert.equal(isSupportCancellation("no"), true);
  assert.equal(isSupportCancellation("todavía no"), true);
  assert.equal(isSupportCancellation("sí"), false);
});

test("combina borrador anterior sin perder información", () => {
  const merged = mergeSupportDraft(
    {
      category: "billing",
      subject: "No puedo bajar de plan",
      situation: "No aparece la opción",
      impact: "No puedo ajustar mi suscripción",
      expected_resolution: null,
      severity: "normal",
    },
    {
      expected_resolution: "Poder seleccionar un plan menor",
    }
  );

  assert.equal(merged.category, "billing");
  assert.equal(merged.subject, "No puedo bajar de plan");
  assert.equal(merged.situation, "No aparece la opción");
  assert.equal(
    merged.expected_resolution,
    "Poder seleccionar un plan menor"
  );
});

test("merge no reemplaza valores con defaults de campos ausentes", () => {
  const merged = mergeSupportDraft(
    {
      category: "technical",
      subject: "Falla crítica",
      situation: "El módulo no responde",
      severity: "high",
      confirmed: false,
    },
    {
      expected_resolution: "Restablecer el acceso",
    }
  );

  assert.equal(merged.severity, "high");
  assert.equal(merged.category, "technical");
  assert.equal(merged.subject, "Falla crítica");
  assert.equal(
    merged.expected_resolution,
    "Restablecer el acceso"
  );
});

test("confirmación determinista fuerza submit", () => {
  const previousState = {
    awaiting: "support_ticket_confirmation",
    current_stage: "support_confirmation",
    support_ticket_draft: {
      category: "billing",
      subject: "No aparece la opción para bajar de plan",
      situation: "La plataforma no muestra planes inferiores",
      impact: "No puedo ajustar mi suscripción",
      expected_resolution: "Poder seleccionar un plan menor",
      severity: "normal",
      confirmed: false,
    },
  };

  const result =
    enforceSupportTicketConfirmation({
      message: "sí",
      previousState,
      agentOutput: {
        reply: "¿Cuál es el problema?",
        state: previousState,
        ui_action: {
          type: "none",
          payload: null,
        },
      },
    });

  assert.equal(
    result.ui_action.type,
    "submit_support_ticket"
  );

  assert.equal(
    result.ui_action.payload.confirmed,
    true
  );

  assert.equal(
    result.state.current_stage,
    "support_submitting"
  );

  assert.equal(
    result.state.awaiting,
    null
  );

  assert.doesNotMatch(
    result.reply,
    /cuál es el problema/i
  );
});

test("cancelación determinista conserva borrador", () => {
  const previousState = {
    awaiting: "support_ticket_confirmation",
    current_stage: "support_confirmation",
    support_ticket_draft: {
      category: "technical",
      subject: "Problema con Trace",
      situation: "No abre el módulo",
      severity: "normal",
      confirmed: false,
    },
  };

  const result =
    enforceSupportTicketConfirmation({
      message: "todavía no",
      previousState,
      agentOutput: {
        reply: "¿Deseas enviarlo?",
        state: previousState,
        ui_action: {
          type: "update_support_ticket_draft",
          payload:
            previousState.support_ticket_draft,
        },
      },
    });

  assert.equal(
    result.ui_action.type,
    "none"
  );

  assert.equal(
    result.state.status,
    "paused"
  );

  assert.equal(
    result.state.support_ticket_draft.subject,
    "Problema con Trace"
  );
});


test("conocimiento define Trace como trazabilidad operativa", () => {
  const knowledge =
    fs.readFileSync(
      "src/codi-platform-knowledge.js",
      "utf8"
    );

  assert.match(
    knowledge,
    /trazabilidad operativa/i
  );

  assert.match(
    knowledge,
    /limpieza y mantenimiento/i
  );

  assert.match(
    knowledge,
    /No lo describas como una herramienta genérica de analítica web/i
  );
});

test("backend bloquea exposición de JSON interno", () => {
  const index =
    fs.readFileSync(
      "src/index.js",
      "utf8"
    );

  assert.match(
    index,
    /typeof parsed === "string"/
  );

  assert.match(
    index,
    /no pude interpretar correctamente la respuesta/i
  );

  assert.match(
    index,
    /parsed\.reply/
  );
});


test("núcleo clasifica por intención y no por palabras aisladas", () => {
  const core =
    fs.readFileSync(
      "src/codi-agent-core.js",
      "utf8"
    );

  assert.match(
    core,
    /DETECCIÓN DE INTENCIÓN Y MODO DE RESPUESTA/i
  );

  assert.match(
    core,
    /No clasifiques la intención usando solamente palabras o frases aisladas/i
  );

  assert.match(
    core,
    /Modo conversacional/i
  );

  assert.match(
    core,
    /Recolección estructurada temporal/i
  );
});

test("soporte conserva conversación y recopila solo tras intención confirmada", () => {
  assert.match(
    CODI_SUPPORT_INSTRUCTIONS,
    /intención real detectada/i
  );

  assert.match(
    CODI_SUPPORT_INSTRUCTIONS,
    /intención es ambigua, aclárala/i
  );

  assert.match(
    CODI_SUPPORT_INSTRUCTIONS,
    /una sola pregunta concreta por turno/i
  );

  assert.match(
    CODI_SUPPORT_INSTRUCTIONS,
    /No utilices una respuesta fija/i
  );

  assert.match(
    CODI_SUPPORT_INSTRUCTIONS,
    /Solo después de una confirmación final explícita/i
  );
});

test("backend no impone continuidad conversacional rígida", () => {
  const contractSource =
    fs.readFileSync(
      "src/codi-support-contract.js",
      "utf8"
    );

  const indexSource =
    fs.readFileSync(
      "src/index.js",
      "utf8"
    );

  assert.doesNotMatch(
    contractSource,
    /enforceSupportTicketContinuity/
  );

  assert.doesNotMatch(
    indexSource,
    /supportContinuousOutput/
  );

  assert.match(
    indexSource,
    /enforceSupportTicketConfirmation/
  );
});

test("integración estática backend y frontend", () => {
  const core = fs.readFileSync("src/codi-agent-core.js", "utf8");
  const index = fs.readFileSync("src/index.js", "utf8");
  const chat = fs.readFileSync("frontend/src/components/AIChat.jsx", "utf8");

  assert.match(core, /CODI_SUPPORT_INSTRUCTIONS/);
  assert.match(core, /submit_support_ticket/);
  assert.match(index, /sanitizeCodiUiAction/);
  assert.match(index, /agentOutput\.ui_action/);
  assert.match(chat, /executeCodiUiAction/);
  assert.match(chat, /idempotencyKey = `codi:\$\{conversationId\}:support-ticket`/);
  assert.match(chat, /Ticket creado:/);
  assert.match(chat, /Conservé los datos para intentarlo nuevamente/);
});

console.log(`\nCodi Support Actions: ${passed}/21 bloques pasaron`);
