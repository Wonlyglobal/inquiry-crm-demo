import { runEdgeCycle } from "../../../mail-sync/src/index.mjs";

const workerToken = Deno.env.get("MAIL_SYNC_WORKER_TOKEN") || "";
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
});

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!workerToken || request.headers.get("x-mail-sync-token") !== workerToken) {
    return json({ error: "unauthorized" }, 401);
  }

  try {
    const result = await runEdgeCycle();
    return json({ ok: true, ...result });
  } catch (error) {
    // Never log request content, mailbox credentials, addresses, or message bodies.
    console.error(`mail sync worker failed: ${error instanceof Error ? error.name : "Error"}`);
    return json({ ok: false, error: "sync_failed" }, 500);
  }
});
