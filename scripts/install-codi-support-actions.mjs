import fs from "node:fs";

const corePath = "src/codi-agent-core.js";
const indexPath = "src/index.js";
const chatPath = "frontend/src/components/AIChat.jsx";

function replaceOnce(source, search, replacement, label) {
  if (!source.includes(search)) throw new Error(`No se encontró el ancla: ${label}`);
  return source.replace(search, replacement);
}

let core = fs.readFileSync(corePath, "utf8");
if (!core.includes("CODI_SUPPORT_INSTRUCTIONS")) {
  core = replaceOnce(
    core,
    'export const CODI_EMPTY_AGENT_STATE = Object.freeze({',
    'import { CODI_SUPPORT_EMPTY_DRAFT, CODI_SUPPORT_INSTRUCTIONS } from "./codi-support-contract.js";\n\nexport const CODI_EMPTY_AGENT_STATE = Object.freeze({',
    "import soporte"
  );
  core = replaceOnce(
    core,
    '  last_user_result: "unknown",\n',
    '  last_user_result: "unknown",\n  last_offered_action: null,\n  last_action_result: null,\n  support_ticket_draft: CODI_SUPPORT_EMPTY_DRAFT,\n',
    "estado soporte"
  );
  core = replaceOnce(
    core,
    '        completed_steps: {',
    '        last_offered_action: { type: ["string", "null"] },\n\n        last_action_result: { type: ["object", "null"] },\n\n        support_ticket_draft: {\n          type: "object",\n          additionalProperties: true,\n        },\n\n        completed_steps: {',
    "schema estado soporte"
  );
  core = replaceOnce(
    core,
    '        "last_user_result",\n',
    '        "last_user_result",\n        "last_offered_action",\n        "last_action_result",\n        "support_ticket_draft",\n',
    "required soporte"
  );
  core = replaceOnce(
    core,
    '    state: {',
    '    ui_action: {\n      type: "object",\n      additionalProperties: false,\n      properties: {\n        type: {\n          type: "string",\n          enum: ["none", "start_support_ticket", "update_support_ticket_draft", "submit_support_ticket"],\n        },\n        payload: { type: ["object", "null"] },\n      },\n      required: ["type", "payload"],\n    },\n\n    state: {',
    "schema ui_action"
  );
  core = replaceOnce(
    core,
    '    "reply",\n    "state",',
    '    "reply",\n    "ui_action",\n    "state",',
    "required ui_action"
  );
  core = replaceOnce(
    core,
    '## SALIDA OBLIGATORIA',
    '${CODI_SUPPORT_INSTRUCTIONS}\n\n## SALIDA OBLIGATORIA',
    "instrucciones soporte"
  );
  core = replaceOnce(
    core,
    '  "reply": "Respuesta natural para el usuario",\n  "state": {',
    '  "reply": "Respuesta natural para el usuario",\n  "ui_action": { "type": "none", "payload": null },\n  "state": {',
    "ejemplo ui_action"
  );
  core = replaceOnce(
    core,
    '    "last_user_result": "unknown",\n',
    '    "last_user_result": "unknown",\n    "last_offered_action": null,\n    "last_action_result": null,\n    "support_ticket_draft": {},\n',
    "ejemplo estado soporte"
  );
  fs.writeFileSync(corePath, core);
}

let index = fs.readFileSync(indexPath, "utf8");
if (!index.includes("sanitizeCodiUiAction")) {
  index = replaceOnce(
    index,
    'import { handleSupportTicketApi } from "./support-ticket-api.js";',
    'import { handleSupportTicketApi } from "./support-ticket-api.js";\nimport { sanitizeCodiUiAction, sanitizeSupportDraft } from "./codi-support-contract.js";',
    "import contrato soporte"
  );

  index = replaceOnce(
    index,
    'agent_state: normalizedAgentState,',
    'agent_state: normalizedAgentState,\n            ui_action: sanitizeCodiUiAction(parsed.ui_action),',
    "respuesta ui_action"
  );

  index = replaceOnce(
    index,
    'const normalizedAgentState = {\n',
    'const normalizedAgentState = {\n',
    "estado normalizado"
  );

  index = replaceOnce(
    index,
    'last_user_result: parsed.state?.last_user_result || "unknown",',
    'last_user_result: parsed.state?.last_user_result || "unknown",\n            last_offered_action: typeof parsed.state?.last_offered_action === "string" ? parsed.state.last_offered_action : null,\n            last_action_result: parsed.state?.last_action_result && typeof parsed.state.last_action_result === "object" ? parsed.state.last_action_result : null,\n            support_ticket_draft: sanitizeSupportDraft(parsed.state?.support_ticket_draft),',
    "normalización soporte"
  );

  fs.writeFileSync(indexPath, index);
}

let chat = fs.readFileSync(chatPath, "utf8");
if (!chat.includes("executeCodiUiAction")) {
  chat = replaceOnce(
    chat,
    'function buildWelcome(user) {',
    `async function executeCodiUiAction(action, token, conversationId) {\n  if (!action || action.type === "none") return null;\n  if (!["start_support_ticket", "update_support_ticket_draft", "submit_support_ticket"].includes(action.type)) {\n    throw new Error("Acción de Codi no permitida");\n  }\n  if (action.type !== "submit_support_ticket") {\n    return { ok: true, draft_only: true, action: action.type };\n  }\n  const payload = action.payload && typeof action.payload === "object" ? action.payload : {};\n  const idempotencyKey = \`codi:\${conversationId}:support-ticket\`;\n  const res = await fetch(\`\${BASE}/api/support/tickets\`, {\n    method: "POST",\n    headers: { "Content-Type": "application/json", Authorization: \`Bearer \${token}\` },\n    body: JSON.stringify({ ...payload, source: "codi", idempotency_key: idempotencyKey }),\n  });\n  const data = await res.json().catch(() => ({}));\n  if (!res.ok || !data.ok) throw new Error(data.error || "No se pudo crear el ticket");\n  return data;\n}\n\nfunction buildWelcome(user) {`,
    "ejecutor ui_action"
  );

  chat = replaceOnce(
    chat,
    '        const reply =\n          data.reply ||',
    `        let reply =\n          data.reply ||`,
    "reply mutable"
  );

  chat = replaceOnce(
    chat,
    '          "Lo siento, no pude procesar tu solicitud.";\n\n        await waitForMinimumTyping();',
    `          "Lo siento, no pude procesar tu solicitud.";\n\n        if (data.ui_action && data.ui_action.type !== "none") {\n          try {\n            const actionResult = await executeCodiUiAction(\n              data.ui_action,\n              token,\n              conversationIdRef.current\n            );\n            if (data.ui_action.type === "submit_support_ticket" && actionResult?.ticket) {\n              agentStateRef.current = {\n                ...(agentStateRef.current || {}),\n                last_action_result: { ok: true, ...actionResult.ticket },\n                last_offered_action: "submit_support_ticket",\n              };\n              saveAgentState(user?.id, agentStateRef.current);\n              reply = \`\${reply}\\n\\n**Ticket creado:** \${actionResult.ticket.ticket_number} · Estado: \${actionResult.ticket.status} · Prioridad de servicio: \${actionResult.ticket.service_priority}.\`;\n            }\n          } catch (actionError) {\n            agentStateRef.current = {\n              ...(agentStateRef.current || {}),\n              last_action_result: { ok: false, error: actionError.message },\n              last_offered_action: data.ui_action.type,\n            };\n            saveAgentState(user?.id, agentStateRef.current);\n            reply = \`No pude crear el ticket todavía: \${actionError.message}. Conservé los datos para intentarlo nuevamente.\`;\n          }\n        }\n\n        await waitForMinimumTyping();`,
    "ejecución ui_action"
  );

  fs.writeFileSync(chatPath, chat);
}

console.log("Contrato de soporte de Codi integrado correctamente.");
