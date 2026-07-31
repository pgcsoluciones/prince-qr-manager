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
  assert.match(CODI_SUPPORT_INSTRUCTIONS, /confirmación final explícita/i);
  assert.match(CODI_SUPPORT_INSTRUCTIONS, /Nunca afirmes que el ticket fue creado/i);
  assert.match(CODI_SUPPORT_INSTRUCTIONS, /resultado real del backend/i);
  assert.match(CODI_SUPPORT_INSTRUCTIONS, /No mezcles severidad del incidente con prioridad de servicio/i);
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

console.log(`\nCodi Support Actions: ${passed}/8 bloques pasaron`);
