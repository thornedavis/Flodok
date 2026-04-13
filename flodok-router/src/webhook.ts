import type { FirefliesWebhookPayload } from "./types";

export async function verifyWebhookSignature(
  request: Request,
  secret: string,
): Promise<boolean> {
  const signature = request.headers.get("x-hub-signature");
  if (!signature) return false;

  const body = await request.clone().text();
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  const expectedHex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return signature === expectedHex;
}

export function parseWebhookPayload(body: unknown): FirefliesWebhookPayload {
  const payload = body as Record<string, unknown>;

  if (!payload.meetingId || typeof payload.meetingId !== "string") {
    throw new Error("Invalid webhook payload: missing meetingId");
  }

  return {
    meetingId: payload.meetingId,
    eventType: (payload.eventType as string) ?? "unknown",
    clientReferenceId: payload.clientReferenceId as string | undefined,
  };
}
