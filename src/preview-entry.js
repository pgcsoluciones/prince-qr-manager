import app from "./index.js";
import { handleTraceV1OperationalQualityApi } from "./trace-v1-operational-quality-api.js";
import { handleTraceV1OperationalApi } from "./trace-v1-operational-api.js";

export default {
  async fetch(request, env, ctx) {
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
