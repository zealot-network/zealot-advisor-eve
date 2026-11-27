import { COMPANY_INFO, SERVICES } from "./company.ts";
import { submitContact } from "./contact.ts";
import { inspectJsonPost } from "./post-gate.ts";
import { requestClientAddress } from "./rate-limit.ts";

function listedOrigins(): string[] {
  return (process.env.MCP_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0 && item !== "*");
}

export function mcpCorsHeaders(request: Request): Headers {
  const headers = new Headers();
  const allowed = listedOrigins();
  if (allowed.length === 0) return headers;
  const origin = request.headers.get("origin");
  if (!origin || !allowed.includes(origin)) return headers;
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Headers", "authorization, content-type");
  headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  headers.set("Vary", "Origin");
  return headers;
}

const tools = [
  {
    name: "get_company_info",
    description: "Return an overview of Zealot: services, geographic focus (Tennessee and Israel), founder, and how to get in touch.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "list_services",
    description: "List the services Zealot offers, with a short summary of each.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "submit_contact",
    description: "Submit a contact or project brief to the Zealot team. Zealot is notified by Slack and email. The submitted address does not receive a confirmation email.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        email: { type: "string" },
        message: { type: "string" },
        service: { type: "string" },
        budget: { type: "string" },
        source: { type: "string" },
        projectBrief: { type: "object" },
        website: { type: "string", description: "Leave empty. This field is a honeypot." },
      },
      required: ["name", "email", "message"],
      additionalProperties: false,
    },
  },
];

function rpc(request: Request, id: unknown, result: unknown): Response {
  return Response.json(
    { jsonrpc: "2.0", id: id ?? null, result },
    { headers: mcpCorsHeaders(request) },
  );
}

function rpcError(request: Request, id: unknown, code: number, message: string): Response {
  return Response.json(
    { jsonrpc: "2.0", id: id ?? null, error: { code, message } },
    { headers: mcpCorsHeaders(request) },
  );
}

export function handleMcpOptions(request: Request): Response {
  return new Response(null, { status: 204, headers: mcpCorsHeaders(request) });
}

function rejectMcpPost(status: 415 | 403, message: string): Response {
  return Response.json(
    { jsonrpc: "2.0", id: null, error: { code: status === 415 ? -32700 : -32600, message } },
    { status },
  );
}

export async function handleMcpPost(request: Request, requestIp: string | null = null): Promise<Response> {
  const reason = inspectJsonPost(request, listedOrigins());
  if (reason === "content-type") {
    return rejectMcpPost(415, "Content-Type must be application/json.");
  }
  if (reason === "origin") {
    return rejectMcpPost(403, "Origin is not allowed.");
  }
  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    return rpcError(request, null, -32700, "Parse error");
  }
  const body = (parsed && typeof parsed === "object" ? parsed : {}) as {
    id?: unknown;
    method?: string;
    params?: { name?: string; arguments?: Record<string, unknown> };
  };

  const method = body.method;
  if (method === "initialize") {
    return rpc(request, body.id, {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "zealot", version: "1.0.0" },
    });
  }
  if (method === "notifications/initialized" || method === "initialized") {
    return new Response(null, { status: 202, headers: mcpCorsHeaders(request) });
  }
  if (method === "tools/list") {
    return rpc(request, body.id, { tools });
  }
  if (method === "tools/call") {
    const name = body.params?.name;
    const args = body.params?.arguments ?? {};
    if (name === "get_company_info") {
      return rpc(request, body.id, {
        content: [{ type: "text", text: JSON.stringify(COMPANY_INFO, null, 2) }],
        structuredContent: COMPANY_INFO,
      });
    }
    if (name === "list_services") {
      return rpc(request, body.id, {
        content: [{ type: "text", text: JSON.stringify(SERVICES, null, 2) }],
        structuredContent: { services: SERVICES },
      });
    }
    if (name === "submit_contact") {
      const result = await submitContact(
        { ...args, source: args.source || "mcp" },
        requestClientAddress(request, requestIp),
        { confirmVisitor: false },
      );
      return rpc(request, body.id, {
        content: [{ type: "text", text: JSON.stringify(result.body) }],
        isError: result.status !== 200,
        structuredContent: result.body,
      });
    }
    return rpcError(request, body.id, -32602, "Unknown tool");
  }
  return rpcError(request, body.id, -32601, "Method not found");
}
