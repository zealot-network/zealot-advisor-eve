import postgres, { type Sql } from "postgres";

let client: Sql | undefined;

// postgres.js maps ssl "require", "allow", and "prefer" to rejectUnauthorized: false.
// "verify-full" leaves certificate verification on. Neon certificates are publicly trusted.
export const DATABASE_SSL = "verify-full" as const;

export function assertDatabaseSsl(mode: string = DATABASE_SSL): "verify-full" {
  if (mode !== "verify-full") {
    throw new Error("Database connections must use ssl verify-full.");
  }
  return "verify-full";
}

export function databaseUrl(): string | undefined {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url || url.trim().length === 0) return undefined;
  return url;
}

export function getSql(): Sql | undefined {
  const url = databaseUrl();
  if (!url) return undefined;
  if (!client) {
    const ssl = assertDatabaseSsl();
    client = postgres(url, {
      ssl,
      max: 1,
      idle_timeout: 20,
    });
  }
  return client;
}
