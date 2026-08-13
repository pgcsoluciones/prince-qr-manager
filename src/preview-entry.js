import app from "./index.js";
import { guardTraceV1AdminApi } from "./trace-v1-admin-gate.js";
import { handleTraceV1ControlSetupApi } from "./trace-v1-control-setup-api.js";
import { handleTraceV1AdminOverviewApi } from "./trace-v1-admin-overview-api.js";
import { handleTraceV1AdminExcelApi } from "./trace-v1-admin-excel-api.js";
import { handleTraceV1AdminToolsApi } from "./trace-v1-admin-tools-api.js";
import { handleTraceV1OperationalInboxApi } from "./trace-v1-operational-inbox-api.js";
import { handleTraceV1VerticalsApi } from "./trace-v1-verticals-api.js";
import { handleTraceV1CollaborationApi } from "./trace-v1-collaboration-api.js";
import { handleTraceV1OperationalQualityApi } from "./trace-v1-operational-quality-api.js";
import { handleTraceV1OperationalApi } from "./trace-v1-operational-api.js";

export default {
  async fetch(request, env, ctx) {
    const adminGuardResponse = await guardTraceV1AdminApi(request, env);
    if (adminGuardResponse) return adminGuardResponse;

    const controlSetupResponse = await handleTraceV1ControlSetupApi(request, env);
    if (controlSetupResponse) return controlSetupResponse;

    const adminOverviewResponse = await handleTraceV1AdminOverviewApi(request, env);
    if (adminOverviewResponse) return adminOverviewResponse;

    const adminExcelResponse = await handleTraceV1AdminExcelApi(request, env);
    if (adminExcelResponse) return adminExcelResponse;

    const adminToolsResponse = await handleTraceV1AdminToolsApi(request, env);
    if (adminToolsResponse) return adminToolsResponse;

    const inboxResponse = await handleTraceV1OperationalInboxApi(request, env);
    if (inboxResponse) return inboxResponse;

    const verticalsResponse = await handleTraceV1VerticalsApi(request, env);
    if (verticalsResponse) return verticalsResponse;

    const collaborationResponse = await handleTraceV1CollaborationApi(request, env);
    if (collaborationResponse) return collaborationResponse;

    const qualityResponse = await handleTraceV1OperationalQualityApi(request, env);
    if (qualityResponse) return qualityResponse;

    const operationalResponse = await handleTraceV1OperationalApi(request, env);
    if (operationalResponse) return operationalResponse;

    return app.fetch(request, env, ctx);
  },

  async scheduled(event, env, ctx) {
    if (typeof app.scheduled === "function") return app.scheduled(event, env, ctx);
  },
};
