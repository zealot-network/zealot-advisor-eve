export async function postSlack(text: string): Promise<void> {
  const webhook = process.env.SLACK_WEBHOOK_URL;
  if (!webhook) return;
  try {
    const response = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!response.ok) {
      console.error("Slack webhook failed", response.status);
    }
  } catch (error) {
    console.error("Slack notification error", error);
  }
}

export function contactSlackText(input: {
  name: string;
  email: string;
  service?: string;
  budget?: string;
  source?: string;
  message: string;
  conversationId?: string;
}): string {
  return [
    `*New Zealot lead* (${input.source || "form"})`,
    `*Name:* ${input.name}`,
    `*Email:* ${input.email}`,
    `*Service:* ${input.service || "not specified"}`,
    `*Engagement:* ${input.budget || "not specified"}`,
    input.conversationId ? `*Chat conversation:* ${input.conversationId}` : null,
    `*Message:*\n${input.message.slice(0, 2800)}`,
  ]
    .filter(Boolean)
    .join("\n");
}
