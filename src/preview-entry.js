import app from "./index.js";
import { handleTraceV1OperationalInboxApi } from "./trace-v1-operational-inbox-api.js";
import { handleTraceV1VerticalsApi } from "./trace-v1-verticals-api.js";
import { handleTraceV1CollaborationApi } from "./trace-v1-collaboration-api.js";
import { handleTraceV1OperationalQualityApi } from "./trace-v1-operational-quality-api.js";
import { handleTraceV1OperationalApi } from "./trace-v1-operational-api.js";

export default {
  async fetch(request, env, ctx) {
    const inboxResponse =
      await handleTraceV1OperationalInboxApi(request, env);

    if (inboxResponse) {
      return inboxResponse;
    }

    const verticalsResponse =
      await handleTraceV1VerticalsApi(request, env);

    if (verticalsResponse) {
      return verticalsResponse;
    }

    const collaborationResponse =
      await handleTraceV1CollaborationApi(request, env);

    if (collaborationResponse) {
      return collaborationResponse;
    }

    const qualityResponse =
      await handleTraceV1OperationalQualityApi(request, env);

    if (qualityResponse) {
      return qualityResponse;
    }

    const operationalResponse =
      await handleTraceV1OperationalApi(request, env);

    if (operationalResponse) {
      return operationalResponse;
    }

    return app.fetch(request, env, ctx);
  },

  async scheduled(event, env, ctx) {
    if (typeof app.scheduled === "function") {
      return app.scheduled(event, env, ctx);
    }
  },
};
