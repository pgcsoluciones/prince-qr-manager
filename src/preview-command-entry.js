import previewApp from "./preview-entry.js";
import { handleTraceV1CommandCenterApi } from "./trace-v1-command-center-api.js";
import { handleTraceV1WorkspaceApi } from "./trace-v1-workspace-api.js";
import { handleTraceV1ProjectTeamApi } from "./trace-v1-project-team-api.js";
import { handleTraceV1TeamOverviewApi } from "./trace-v1-team-overview-api.js";
import { handleTraceV1EvaluationsApi } from "./trace-v1-evaluations-api.js";

export default {
  async fetch(request, env, ctx) {
    const evaluationsResponse = await handleTraceV1EvaluationsApi(request, env);
    if (evaluationsResponse) return evaluationsResponse;
    const teamOverviewResponse = await handleTraceV1TeamOverviewApi(request, env);
    if (teamOverviewResponse) return teamOverviewResponse;
    const projectTeamResponse = await handleTraceV1ProjectTeamApi(request, env);
    if (projectTeamResponse) return projectTeamResponse;
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
