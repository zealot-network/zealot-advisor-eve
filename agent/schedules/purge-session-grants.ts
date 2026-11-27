import { defineSchedule } from "eve/schedules";
import { getSql } from "../../lib/db.ts";
import { purgeExpiredSessionRows } from "../../lib/sessions.ts";

export default defineSchedule({
  cron: "0 9 * * *",
  async run() {
    const sql = getSql();
    if (!sql) return;
    await purgeExpiredSessionRows(sql);
  },
});
