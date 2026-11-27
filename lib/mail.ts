function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function contactFromEmail(): string {
  const configured = process.env.CONTACT_FROM_EMAIL?.trim();
  return configured && configured.length > 0 ? configured : "onboarding@resend.dev";
}

function fromHeader(displayName: string): string {
  return `${displayName} <${contactFromEmail()}>`;
}

export function notifyEmails(): string[] {
  const raw = process.env.CONTACT_NOTIFY_EMAILS || "hello@zealot.company";
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

async function sendEmail(payload: {
  from: string;
  to: string[];
  subject: string;
  html: string;
  replyTo?: string;
}): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.error("RESEND_API_KEY is not set");
    return;
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: payload.from,
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
      reply_to: payload.replyTo,
    }),
  });
  if (!response.ok) {
    console.error("Resend email failed", response.status);
  }
}

export async function sendContactEmails(input: {
  name: string;
  email: string;
  message: string;
  service?: string;
  budget?: string;
  source?: string;
  submissionId: string;
  confirmVisitor?: boolean;
}): Promise<void> {
  const name = escapeHtml(input.name);
  const email = escapeHtml(input.email);
  const message = escapeHtml(input.message);
  const service = escapeHtml(input.service || "Not specified");
  const budget = escapeHtml(input.budget || "Not specified");
  const source = escapeHtml(input.source || "form");

  if (input.confirmVisitor !== false) {
    await sendEmail({
    from: fromHeader("Zealot"),
    to: [input.email],
    replyTo: notifyEmails()[0],
    subject: "We received your message!",
    html: `
        <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="font-size: 28px; font-weight: 300; color: #333; margin-bottom: 24px;">
            Thank you for reaching out, ${name}!
          </h1>
          <p style="font-size: 16px; line-height: 1.6; color: #666; margin-bottom: 20px;">
            We have received your message and will get back to you as soon as possible.
          </p>
          <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 24px 0;">
            <p style="font-size: 14px; color: #666; margin: 0 0 8px 0;"><strong>Your message:</strong></p>
            <p style="font-size: 14px; color: #666; margin: 0; white-space: pre-wrap;">${message}</p>
          </div>
          <p style="font-size: 16px; line-height: 1.6; color: #666;">
            Best regards,<br>
            <strong>The Zealot Team</strong>
          </p>
          <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 32px 0;" />
          <p style="font-size: 12px; color: #999; text-align: center;">
            Tennessee • Israel • Beyond
          </p>
        </div>
      `,
    });
  }

  for (const adminEmail of notifyEmails()) {
    await sendEmail({
      from: fromHeader("Zealot Contact Form"),
      to: [adminEmail],
      replyTo: input.email,
      subject: `New Contact Form Submission from ${input.name}`,
      html: `
                <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                  <h1 style="font-size: 24px; font-weight: 600; color: #333; margin-bottom: 24px;">
                    New Contact Form Submission
                  </h1>
                  <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 16px;">
                    <p style="font-size: 14px; color: #666; margin: 0 0 8px 0;"><strong>Name:</strong></p>
                    <p style="font-size: 16px; color: #333; margin: 0 0 16px 0;">${name}</p>
                    <p style="font-size: 14px; color: #666; margin: 0 0 8px 0;"><strong>Email:</strong></p>
                    <p style="font-size: 16px; color: #333; margin: 0 0 16px 0;">
                      <a href="mailto:${email}" style="color: #0066cc; text-decoration: none;">${email}</a>
                    </p>
                    <p style="font-size: 14px; color: #666; margin: 0 0 8px 0;"><strong>Service:</strong></p>
                    <p style="font-size: 16px; color: #333; margin: 0 0 16px 0;">${service}</p>
                    <p style="font-size: 14px; color: #666; margin: 0 0 8px 0;"><strong>Engagement size:</strong></p>
                    <p style="font-size: 16px; color: #333; margin: 0 0 16px 0;">${budget}</p>
                    <p style="font-size: 14px; color: #666; margin: 0 0 8px 0;"><strong>Source:</strong></p>
                    <p style="font-size: 16px; color: #333; margin: 0 0 16px 0;">${source}</p>
                    <p style="font-size: 14px; color: #666; margin: 0 0 8px 0;"><strong>Message:</strong></p>
                    <p style="font-size: 16px; color: #333; margin: 0; white-space: pre-wrap;">${message}</p>
                  </div>
                  <p style="font-size: 14px; color: #999;">
                    Submission ID: ${escapeHtml(input.submissionId)}<br>
                    Received: ${escapeHtml(new Date().toLocaleString("en-US", { timeZone: "America/Chicago" }))} CT
                  </p>
                  <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 32px 0;" />
                  <p style="font-size: 12px; color: #999; text-align: center;">
                    Stored in the Zealot Postgres database. Reply to this email to reach the visitor.
                  </p>
                </div>
              `,
    });
  }
}
