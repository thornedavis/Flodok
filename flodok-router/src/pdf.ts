// HTML → PDF endpoint backed by Cloudflare Browser Rendering.
//
// The worker is a *pure rendering service* — the browser app
// pre-renders the document to a complete HTML string (DocumentRenderer
// + styles + merge-field resolution) and POSTs it here. The worker
// spins up a Browser Rendering Chromium instance, sets the HTML as
// the page content, and captures a PDF. No document/business-logic
// knowledge lives here.
//
// Auth: requires a Supabase JWT on the Authorization header. We
// verify it by calling Supabase's auth/v1/user endpoint with the
// token — that returns 200 only for valid, non-expired user tokens
// regardless of signing algorithm (HS256 legacy or ECC newer
// signing keys). One extra HTTP hop, but Browser Rendering takes
// seconds so the cost is in the noise. This is what prevents the
// Browser Rendering quota from being burned by abuse.

import puppeteer from "@cloudflare/puppeteer";
import type { Env } from "./types";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

type PdfRequest = {
  html: string;
  filename?: string;
  // Optional page setup overrides. Defaults are A4 portrait with sane
  // margins and background printing on so accent colors / boxed
  // section backgrounds make it into the PDF.
  format?: "A4" | "Letter";
  orientation?: "portrait" | "landscape";
};

export async function handlePdf(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return jsonError("Method not allowed", 405);
  }

  // ── Auth ──
  const auth = request.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) {
    return jsonError("Unauthorized", 401);
  }
  const token = auth.slice("Bearer ".length).trim();
  const jwtOk = await verifySupabaseJwt(token, env);
  if (!jwtOk) {
    return jsonError("Unauthorized", 401);
  }

  // ── Body ──
  let body: PdfRequest;
  try {
    body = (await request.json()) as PdfRequest;
  } catch {
    return jsonError("Invalid JSON body", 400);
  }
  if (!body.html || typeof body.html !== "string") {
    return jsonError("Missing required field: html", 400);
  }

  const filename = sanitizeFilename(body.filename || "document") + ".pdf";

  // ── Render ──
  const browser = await puppeteer.launch(env.BROWSER);
  try {
    const page = await browser.newPage();
    // `networkidle0` waits for in-document network calls to settle —
    // matters when the HTML inlines fonts via @font-face URLs.
    await page.setContent(body.html, { waitUntil: "networkidle0" });
    const pdf = await page.pdf({
      format: body.format ?? "A4",
      landscape: body.orientation === "landscape",
      printBackground: true,
      margin: { top: "16mm", right: "16mm", bottom: "20mm", left: "16mm" },
    });

    return new Response(pdf as BodyInit, {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    console.error("pdf render failed:", err);
    return jsonError(err instanceof Error ? err.message : "Render failed", 500);
  } finally {
    await browser.close();
  }
}

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function sanitizeFilename(input: string): string {
  const cleaned = input
    .replace(/[^a-zA-Z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .toLowerCase()
    .slice(0, 80);
  return cleaned || "document";
}

// ─── JWT validation via Supabase auth/v1/user ───────────────────────
//
// Forwards the token to Supabase's user lookup endpoint. Supabase
// validates the signature internally using whichever signing key
// matches (legacy HS256 or current ECC), so we don't have to care
// about which migration state the project is in. A 200 means the
// token is structurally valid, signed by a known key, and not
// expired. We don't actually need the user details — just the OK.

async function verifySupabaseJwt(token: string, env: Env): Promise<boolean> {
  const anonKey = (env as unknown as { SUPABASE_ANON_KEY?: string }).SUPABASE_ANON_KEY;
  if (!anonKey) {
    console.error("SUPABASE_ANON_KEY not configured on worker");
    return false;
  }
  if (!env.SUPABASE_URL) {
    console.error("SUPABASE_URL not configured on worker");
    return false;
  }
  try {
    const r = await fetch(`${env.SUPABASE_URL.replace(/\/+$/, "")}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: anonKey,
      },
    });
    return r.status === 200;
  } catch (err) {
    console.error("supabase auth verify failed:", err);
    return false;
  }
}
