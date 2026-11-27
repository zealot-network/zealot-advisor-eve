import { z } from "zod";
import { databaseUrl, getSql } from "./db.ts";
import { sendContactEmails } from "./mail.ts";
import { contactLimiter } from "./rate-limit.ts";
import { contactSlackText, postSlack } from "./slack.ts";

const contactSchema = z.object({
  name: z.string()
    .trim()
    .min(1, { message: "Name is required" })
    .max(100, { message: "Name must be less than 100 characters" })
    .regex(/^[a-zA-Z\s\-'.]+$/, { message: "Name contains invalid characters" }),
  email: z.string()
    .trim()
    .min(1, { message: "Email is required" })
    .email({ message: "Invalid email address" })
    .max(255, { message: "Email must be less than 255 characters" })
    .toLowerCase(),
  message: z.string()
    .trim()
    .min(1, { message: "Message is required" })
    .max(2000, { message: "Message must be less than 2000 characters" }),
  service: z.string().trim().max(100).optional(),
  budget: z.string().trim().max(100).optional(),
  source: z.string().trim().max(50).optional(),
  projectBrief: z.record(z.unknown()).optional(),
  conversationId: z.string().trim().max(200).optional(),
  website: z.string().optional(),
});

const leadSchema = z.object({
  email: z.string()
    .trim()
    .min(1, { message: "Email is required" })
    .email({ message: "Invalid email address" })
    .max(255)
    .toLowerCase(),
  source: z.string().trim().max(50).optional(),
  website: z.string().optional(),
});

export type ContactResult =
  | { status: 200; body: { success: true; message: string; submissionId?: string } }
  | { status: 400; body: { success: false; error: string; details?: { field: string; message: string }[] } }
  | { status: 429; body: { success: false; error: string } }
  | { status: 500; body: { success: false; error: string } }
  | { status: 503; body: { success: false; error: string } };

function notConfigured(error: string): ContactResult {
  return { status: 503, body: { success: false, error } };
}

export function contactDeliveryConfigured(): boolean {
  return Boolean(databaseUrl()) && Boolean(process.env.RESEND_API_KEY?.trim());
}

export function leadCaptureConfigured(): boolean {
  return Boolean(databaseUrl());
}

function jsonIssues(error: z.ZodError): { field: string; message: string }[] {
  return error.issues.map((issue) => ({
    field: issue.path.join("."),
    message: issue.message,
  }));
}

export async function submitContact(
  raw: unknown,
  ipAddress: string,
  options: { confirmVisitor?: boolean } = {},
): Promise<ContactResult> {
  const record = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  if (typeof record.website === "string" && record.website.trim() !== "") {
    return { status: 200, body: { success: true, message: "Thank you for your message." } };
  }

  const parsed = contactSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      status: 400,
      body: { success: false, error: "Invalid input data", details: jsonIssues(parsed.error) },
    };
  }

  if (!contactDeliveryConfigured()) {
    return notConfigured("Contact form is not configured.");
  }

  const allowed = await contactLimiter.allow(ipAddress);
  if (!allowed) {
    return {
      status: 429,
      body: { success: false, error: "Rate limit exceeded. Please wait before sending more messages." },
    };
  }

  const sql = getSql();
  if (!sql) {
    return notConfigured("Contact form is not configured.");
  }

  const { name, email, message, service, budget, source, projectBrief, conversationId } = parsed.data;
  try {
    const rows = await sql<{ id: string }[]>`
      insert into contact_submissions (name, email, message, service, budget, project_brief, source)
      values (
        ${name},
        ${email},
        ${message},
        ${service || null},
        ${budget || null},
        ${projectBrief ? sql.json(projectBrief as Record<string, unknown>) : null},
        ${source || "form"}
      )
      returning id
    `;
    const submissionId = rows[0]?.id;
    if (!submissionId) throw new Error("Insert returned no id");

    await postSlack(contactSlackText({
      name,
      email,
      service,
      budget,
      source,
      message,
      conversationId,
    }));

    await sendContactEmails({
      name,
      email,
      message,
      service,
      budget,
      source,
      submissionId,
      confirmVisitor: options.confirmVisitor,
    });

    return {
      status: 200,
      body: {
        success: true,
        message: "Thank you for your message. We'll be in touch soon!",
        submissionId,
      },
    };
  } catch (error) {
    console.error("Contact insert failed", error);
    return {
      status: 500,
      body: { success: false, error: "Failed to process your submission. Please try again later." },
    };
  }
}

export async function submitLead(raw: unknown, ipAddress: string): Promise<ContactResult> {
  const record = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  if (typeof record.website === "string" && record.website.trim() !== "") {
    return { status: 200, body: { success: true, message: "Thank you." } };
  }

  const parsed = leadSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      status: 400,
      body: { success: false, error: "Invalid input data", details: jsonIssues(parsed.error) },
    };
  }

  if (!leadCaptureConfigured()) {
    return notConfigured("Lead capture is not configured.");
  }

  const allowed = await contactLimiter.allow(ipAddress);
  if (!allowed) {
    return {
      status: 429,
      body: { success: false, error: "Rate limit exceeded. Please wait before sending more messages." },
    };
  }

  const sql = getSql();
  if (!sql) {
    return notConfigured("Lead capture is not configured.");
  }

  const source = parsed.data.source || "exit-intent";
  try {
    await sql`
      insert into lead_captures (email, source)
      values (${parsed.data.email}, ${source})
    `;
    await postSlack(`*New Zealot lead* (${source})\n*Email:* ${parsed.data.email}`);
    return { status: 200, body: { success: true, message: "Thank you." } };
  } catch (error) {
    console.error("Lead insert failed", error);
    return {
      status: 500,
      body: { success: false, error: "Failed to process your submission. Please try again later." },
    };
  }
}
