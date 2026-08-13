import previewApp from "./preview-entry.js";
import { handleTraceV1CommandCenterApi } from "./trace-v1-command-center-api.js";
import { handleTraceV1WorkspaceApi } from "./trace-v1-workspace-api.js";

export default {
  async fetch(request, env, ctx) {
    const workspaceResponse = await handleTraceV1WorkspaceApi(request, env);
    if (workspaceResponse) return workspaceResponse;
    const commandCenterResponse = await handleTraceV1CommandCenterApi(request, env);
    if (commandCenterResponse) return commandCenterResponse;
    return previewApp.fetch(request, env, ctx);
  },
  async scheduled(event, env, ctx) {
    if (typeof previewApp.scheduled === "function") return previewApp.scheduled(event, env, ctx);
  },
};
