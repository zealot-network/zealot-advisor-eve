import { getSql } from "./db.ts";

const WINDOW_MS = 60 * 60 * 1000;
const LIMIT = 15;
const memory = new Map<string, { windowStart: number; count: number }>();

export async function allowContact(ipAddress: string): Promise<boolean> {
  const now = Date.now();
  const local = memory.get(ipAddress);
  if (!local || now - local.windowStart >= WINDOW_MS) {
    memory.set(ipAddress, { windowStart: now, count: 1 });
  } else if (local.count >= LIMIT) {
    return false;
  } else {
    local.count += 1;
  }

  const sql = getSql();
  if (!sql) return true;

  try {
    const rows = await sql<{ message_count: number }[]>`
      select message_count
      from contact_rate_limits
      where ip_address = ${ipAddress}
        and window_start >= now() - interval '1 hour'
      order by window_start desc
      limit 1
    `;
    const existing = rows[0];
    if (!existing) {
      await sql`
        insert into contact_rate_limits (ip_address, message_count, window_start)
        values (${ipAddress}, 1, now())
      `;
      return true;
    }
    if (existing.message_count >= LIMIT) return false;
    await sql`
      update contact_rate_limits
      set message_count = message_count + 1
      where ip_address = ${ipAddress}
        and window_start >= now() - interval '1 hour'
    `;
    return true;
  } catch (error) {
    console.error("Contact rate limit check failed", error);
    return true;
  }
}

export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "unknown";
}

export function requestClientAddress(request: Request, requestIp: string | null | undefined): string {
  const platform = requestIp?.trim();
  if (platform) return platform;
  return clientIp(request);
}

export const contactLimiter = {
  allow(ipAddress: string): Promise<boolean> {
    return allowContact(ipAddress);
  },
};
