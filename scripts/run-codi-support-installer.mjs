import fs from "node:fs";

const installerPath = "scripts/install-codi-support-actions.mjs";
const source = fs.readFileSync(installerPath, "utf8");

const exactBlock = `  index = replaceOnce(
    index,
    '          agent_state:\\n            parsedCodi.state,',
    '          agent_state:\\n            parsedCodi.state,\\n          ui_action:\\n            parsedCodi.ui_action,',
    "respuesta HTTP ui_action"
  );`;

const flexibleBlock = `  const httpUiActionPattern = /(agent_state:\\s*\\n?\\s*parsedCodi\\.state,)/;
  if (!httpUiActionPattern.test(index)) {
    throw new Error("No se encontró el ancla flexible: respuesta HTTP ui_action");
  }
  index = index.replace(
    httpUiActionPattern,
    '$1\\n          ui_action:\\n            parsedCodi.ui_action,'
  );`;

if (!source.includes(exactBlock)) {
  throw new Error("El instalador base no contiene el bloque esperado para aplicar la corrección temporal");
}

const patchedSource = source.replace(exactBlock, flexibleBlock);
const encoded = Buffer.from(patchedSource, "utf8").toString("base64");
await import(`data:text/javascript;base64,${encoded}`);
