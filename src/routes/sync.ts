import { Hono } from "hono";
import { ImportPipeline } from "../services/pipeline";
import type { Env } from "../types";
import { requireApiKey } from "../utils/auth";

const sync = new Hono<{ Bindings: Env }>();

sync.get("/logs", requireApiKey, async (c) => {
  const pipeline = new ImportPipeline(c.env);
  const limit = Number(c.req.query("limit") ?? "50");
  const rows = await pipeline.dbService.listSyncLogs(limit);
  return c.json({ ok: true, data: rows });
});

export default sync;
