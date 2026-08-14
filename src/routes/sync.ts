import { Hono } from "hono";
import { ImportPipeline } from "../services/pipeline";
import type { Env } from "../types";
import { requireAuth } from "../utils/session";

const sync = new Hono<{ Bindings: Env }>();

const DEFAULT_RETENTION_DAYS = 14;

sync.get("/logs", requireAuth, async (c) => {
  const pipeline = new ImportPipeline(c.env);
  const limit = Number(c.req.query("limit") ?? "50");
  pipeline.dbService.scheduleSyncLogPrune(DEFAULT_RETENTION_DAYS);
  const rows = await pipeline.dbService.listSyncLogs(limit);
  return c.json({ ok: true, data: rows });
});

/** Manual cleanup — deletes sync_logs older than retentionDays (default 14). */
sync.post("/prune", requireAuth, async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    retentionDays?: number;
  };
  const retentionDays = Number(body.retentionDays ?? DEFAULT_RETENTION_DAYS);
  const pipeline = new ImportPipeline(c.env);
  const removed = await pipeline.dbService.pruneSyncLogs(retentionDays);
  await pipeline.dbService.setSetting("sync_logs_last_prune_at", new Date().toISOString());
  return c.json({
    ok: true,
    data: {
      removed,
      retentionDays: Math.min(Math.max(retentionDays, 1), 365),
    },
  });
});

export default sync;
