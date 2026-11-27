import { defineChannel, GET, OPTIONS, POST } from "eve/channels";
import {
  handleContactRequest,
  handleHoopScorePost,
  handleHoopScoresGet,
  handleLeadRequest,
  handleMcpOptionsRequest,
  handleMcpPostRequest,
  handleSameOriginOptions,
} from "../../lib/site-api.ts";

export default defineChannel({
  routes: [
    OPTIONS("/api/contact", async (request) => handleSameOriginOptions(request)),
    POST("/api/contact", async (request, ctx) => handleContactRequest(request, ctx.requestIp)),
    OPTIONS("/api/lead", async (request) => handleSameOriginOptions(request)),
    POST("/api/lead", async (request, ctx) => handleLeadRequest(request, ctx.requestIp)),
    GET("/api/hoop-scores", async (request) => handleHoopScoresGet(request)),
    OPTIONS("/api/hoop-scores", async (request) => handleSameOriginOptions(request)),
    POST("/api/hoop-scores", async (request, ctx) => handleHoopScorePost(request, ctx.requestIp)),
    OPTIONS("/api/mcp", async (request) => handleMcpOptionsRequest(request)),
    POST("/api/mcp", async (request, ctx) => handleMcpPostRequest(request, ctx.requestIp)),
  ],
});
