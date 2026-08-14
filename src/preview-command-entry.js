import previewApp from "./preview-entry.js";
import { handleTraceV1CommandCenterApi } from "./trace-v1-command-center-api.js";
import { handleTraceV1WorkspaceApi } from "./trace-v1-workspace-api.js";
import { handleTraceV1ProjectTeamApi } from "./trace-v1-project-team-api.js";
import { handleTraceV1TeamOverviewApi } from "./trace-v1-team-overview-api.js";
import { handleTraceV1EvaluationsApi } from "./trace-v1-evaluations-api.js";
import { handleTraceV1OnboardingApi } from "./trace-v1-onboarding-api.js";
import { handleTraceV1ProjectDashboardApi } from "./trace-v1-project-dashboard-api.js";
import { handleTraceV1ProjectSummaryApi } from "./trace-v1-project-summary-api.js";
import { handleTraceV1ProjectTimelineApi } from "./trace-v1-project-timeline-api.js";
import { handleTraceV1ProjectTimelineActionsApi } from "./trace-v1-project-timeline-actions-api.js";
import { handleTraceV1ProjectIncidentsApi } from "./trace-v1-project-incidents-api.js";
import { handleTraceV1ProjectIncidentsActionsApi } from "./trace-v1-project-incidents-actions-api.js";
import { handleTraceV1IncidentCorrectionDecisionApi } from "./trace-v1-incident-correction-decision-api.js";
import { handleTraceV1ProjectEvidenceApi } from "./trace-v1-project-evidence-api.js";
import { handleTraceV1OperationalEvidenceRequirementApi } from "./trace-v1-operational-evidence-requirement-api.js";
import { handleTraceV1OnboardingExecutionApi } from "./trace-v1-onboarding-execution-api.js";
import { handleTraceV1StagesOverviewApi } from "./trace-v1-stages-overview-api.js";

export default {
  async fetch(request, env, ctx) {
    const operationalEvidenceResponse = await handleTraceV1OperationalEvidenceRequirementApi(request, env);
    if (operationalEvidenceResponse) return operationalEvidenceResponse;
    const projectEvidenceResponse = await handleTraceV1ProjectEvidenceApi(request, env);
    if (projectEvidenceResponse) return projectEvidenceResponse;
    const incidentCorrectionDecisionResponse = await handleTraceV1IncidentCorrectionDecisionApi(request, env);
    if (incidentCorrectionDecisionResponse) return incidentCorrectionDecisionResponse;
    const stagesOverviewResponse = await handleTraceV1StagesOverviewApi(request, env);
    if (stagesOverviewResponse) return stagesOverviewResponse;
    const operationalizeResponse = await handleTraceV1OnboardingExecutionApi(request, env);
    if (operationalizeResponse) return operationalizeResponse;
    const projectIncidentsActionsResponse = await handleTraceV1ProjectIncidentsActionsApi(request, env);
    if (projectIncidentsActionsResponse) return projectIncidentsActionsResponse;
    const projectIncidentsResponse = await handleTraceV1ProjectIncidentsApi(request, env);
    if (projectIncidentsResponse) return projectIncidentsResponse;
    const projectTimelineActionsResponse = await handleTraceV1ProjectTimelineActionsApi(request, env);
    if (projectTimelineActionsResponse) return projectTimelineActionsResponse;
    const projectTimelineResponse = await handleTraceV1ProjectTimelineApi(request, env);
    if (projectTimelineResponse) return projectTimelineResponse;
    const projectSummaryResponse = await handleTraceV1ProjectSummaryApi(request, env);
    if (projectSummaryResponse) return projectSummaryResponse;
    const projectDashboardResponse = await handleTraceV1ProjectDashboardApi(request, env);
    if (projectDashboardResponse) return projectDashboardResponse;
    const onboardingResponse = await handleTraceV1OnboardingApi(request, env);
    if (onboardingResponse) return onboardingResponse;
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
