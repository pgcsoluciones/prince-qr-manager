import fs from "node:fs";

const installerPath = "scripts/install-codi-support-actions.mjs";
const source = fs.readFileSync(installerPath, "utf8");

const exactBlock = `  index = replaceOnce(
    index,
    '          agent_state:\\n            parsedCodi.state,',
    '          agent_state:\\n            parsedCodi.state,\\n          ui_action:\\n            parsedCodi.ui_action,',
    "respuesta HTTP ui_action"
  );`;

const realHttpBlock = `  index = replaceOnce(
    index,
    '            agent_state:\\n              agentOutput.state,',
    '            agent_state:\\n              agentOutput.state,\\n\\n            ui_action:\\n              agentOutput.ui_action,',
    "respuesta HTTP ui_action"
  );`;

if (!source.includes(exactBlock)) {
  throw new Error("El instalador base no contiene el bloque esperado para aplicar la corrección");
}

const patchedSource = source.replace(exactBlock, realHttpBlock);
const encoded = Buffer.from(patchedSource, "utf8").toString("base64");
await import(`data:text/javascript;base64,${encoded}`);
