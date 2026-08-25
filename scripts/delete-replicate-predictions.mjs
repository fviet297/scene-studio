#!/usr/bin/env node
/**
 * Bulk-delete Replicate predictions via the dashboard's own delete endpoint.
 *
 * Replicate's public REST `DELETE /v1/predictions/{id}` returns 404 and does
 * nothing. The dashboard "Delete" button instead calls an internal endpoint:
 *
 *   POST https://replicate.com/api/frontend/predictions/{id}/delete
 *
 * which requires BOTH the API bearer token AND a logged-in browser session
 * (sessionid + csrftoken cookies). This script drives that endpoint so it can
 * delete predictions of any age — including ones younger than 1 hour, which is
 * exactly what the public API cannot do.
 *
 * Secrets: the session cookie is equivalent to being logged into the account.
 * It is read from environment variables only — never hardcode it or commit it.
 * The cookie expires when you log out of replicate.com.
 *
 * Setup (values come from the browser "Copy as cURL" of one Delete request):
 *   export REPLICATE_API_TOKEN=r8_...          # the bearer token
 *   export REPLICATE_SESSIONID=...             # sessionid cookie
 *   export REPLICATE_CSRFTOKEN=...             # csrftoken cookie
 *
 * Usage:
 *   node scripts/delete-replicate-predictions.mjs            # delete everything
 *   node scripts/delete-replicate-predictions.mjs --dry-run  # list only
 */

const PUBLIC_API = "https://api.replicate.com/v1";
const FRONTEND = "https://replicate.com/api/frontend";
const TERMINAL_STATUSES = new Set(["succeeded", "failed", "canceled"]);
const REQUEST_DELAY_MS = 150;
const MAX_RETRIES = 5;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36";

const dryRun = process.argv.includes("--dry-run");

// --limit=N: only process the N most recent predictions (the list is already
// ordered newest-first). Omit for no limit.
const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.split("=")[1]) : Infinity;
if (Number.isNaN(limit) || limit <= 0) {
  throw new Error("--limit must be a positive integer");
}

function loadCreds() {
  const token = process.env.REPLICATE_API_TOKEN?.trim();
  const sessionid = process.env.REPLICATE_SESSIONID?.trim();
  const csrftoken = process.env.REPLICATE_CSRFTOKEN?.trim();

  const missing = [];
  if (!token) missing.push("REPLICATE_API_TOKEN");
  if (!dryRun && !sessionid) missing.push("REPLICATE_SESSIONID");
  if (!dryRun && !csrftoken) missing.push("REPLICATE_CSRFTOKEN");
  if (missing.length) {
    throw new Error(`Missing env vars: ${missing.join(", ")}`);
  }
  return { token, sessionid, csrftoken };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function apiFetch(url, options) {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(url, options);
    if (res.status === 429) {
      const retryAfter = Number(res.headers.get("retry-after")) || 2;
      await sleep(retryAfter * 1000);
      continue;
    }
    return res;
  }
  throw new Error(`Rate limited after ${MAX_RETRIES} retries: ${url}`);
}

async function* iteratePredictions(token) {
  let url = `${PUBLIC_API}/predictions`;
  while (url) {
    const res = await apiFetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      throw new Error(`List failed: ${res.status} ${await res.text()}`);
    }
    const body = await res.json();
    for (const prediction of body.results) yield prediction;
    url = body.next;
    await sleep(REQUEST_DELAY_MS);
  }
}

async function cancel(id, token) {
  const res = await apiFetch(`${PUBLIC_API}/predictions/${id}/cancel`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.ok;
}

async function frontendDelete(id, creds) {
  const res = await apiFetch(`${FRONTEND}/predictions/${id}/delete`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${creds.token}`,
      "content-type": "application/json",
      origin: "https://replicate.com",
      referer: `https://replicate.com/p/${id}`,
      "x-csrftoken": creds.csrftoken,
      cookie: `csrftoken=${creds.csrftoken}; sessionid=${creds.sessionid}`,
      "user-agent": UA,
    },
  });
  return res.status === 204;
}

async function main() {
  const creds = loadCreds();
  const stats = { deleted: 0, canceled: 0, failed: 0 };

  const limitLabel = limit === Infinity ? "all" : `${limit} most recent`;
  console.log(
    (dryRun ? "DRY RUN — nothing will be deleted" : "Deleting predictions...") +
      ` (${limitLabel})\n`
  );

  let processed = 0;
  for await (const p of iteratePredictions(creds.token)) {
    if (processed >= limit) break;
    processed++;

    if (!TERMINAL_STATUSES.has(p.status)) {
      if (!dryRun) await cancel(p.id, creds.token);
      stats.canceled++;
      console.log(`[canceled — rerun later to delete] ${p.id} ${p.status}`);
      await sleep(REQUEST_DELAY_MS);
      continue;
    }

    if (dryRun) {
      console.log(`[would delete] ${p.id} ${p.status} ${p.created_at}`);
      stats.deleted++;
      continue;
    }

    const ok = await frontendDelete(p.id, creds);
    if (ok) {
      stats.deleted++;
      console.log(`[deleted] ${p.id}`);
    } else {
      stats.failed++;
      console.log(`[delete failed] ${p.id}`);
    }
    await sleep(REQUEST_DELAY_MS);
  }

  console.log("\nSummary:", JSON.stringify(stats, null, 2));
  if (stats.canceled > 0) {
    console.log("Canceled predictions are now terminal — rerun to delete them.");
  }
  if (stats.failed > 0) {
    console.log("Some deletes failed — session cookie may have expired. Re-copy it and rerun.");
  }
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
