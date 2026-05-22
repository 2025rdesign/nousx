// Server-only CajuPay HTTP helpers + HMAC verification utilities.
// Do NOT import this from client code.

const CAJUPAY_BASE = "https://api.cajupay.com.br";

export type CreatePixInput = {
  amountCents: number;
  description: string;
  customerRef: string; // our pix_payments.id
  idempotencyKey: string;
  productRef?: string;
  consumer: {
    name: string;
    email: string;
    document?: string;
  };
};

export type CreatePixResult = {
  qrCode: string;
  externalId: string | null;
  raw: unknown;
};

export async function createCajupayPix(input: CreatePixInput): Promise<CreatePixResult> {
  const apiKey = process.env.CAJUPAY_API_KEY;
  const apiSecret = process.env.CAJUPAY_API_SECRET;
  if (!apiKey || !apiSecret) {
    throw new Error("CajuPay não está configurada (faltam CAJUPAY_API_KEY/SECRET).");
  }

  const res = await fetch(`${CAJUPAY_BASE}/api/payments/pix`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
      "X-API-Secret": apiSecret,
      "Idempotency-Key": input.idempotencyKey,
    },
    body: JSON.stringify({
      amount_cents: input.amountCents,
      currency: "BRL",
      description: input.description,
      customer_ref: input.customerRef,
      product_ref: input.productRef,
      consumer: {
        name: input.consumer.name || "Cliente",
        email: input.consumer.email || "cliente@exemplo.com",
        document: input.consumer.document || "00000000000",
      },
    }),
  });

  const text = await res.text();
  let data: Record<string, unknown> = {};
  try {
    data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    /* ignore */
  }

  if (!res.ok) {
    console.error("[CAJUPAY] create pix failed", res.status, text);
    throw new Error(`CajuPay retornou ${res.status}: ${text.slice(0, 200)}`);
  }

  const qrCode =
    (data.pix_copy_paste as string | undefined) ||
    (data.pix_qr_code as string | undefined) ||
    ((data.data as Record<string, unknown> | undefined)?.pix_copy_paste as string | undefined) ||
    ((data.data as Record<string, unknown> | undefined)?.pix_qr_code as string | undefined) ||
    "";

  const externalId =
    (data.payment_id as string | undefined) ||
    (data.psp_reference as string | undefined) ||
    (data.id as string | undefined) ||
    ((data.data as Record<string, unknown> | undefined)?.payment_id as string | undefined) ||
    ((data.data as Record<string, unknown> | undefined)?.id as string | undefined) ||
    null;

  if (!qrCode) {
    throw new Error("CajuPay retornou QR Code vazio.");
  }

  return { qrCode, externalId, raw: data };
}

// ---------- Fetch status (used as polling fallback when webhook is late) ----------

export type CajupayStatus = "pending" | "paid" | "failed" | "expired" | "refunded" | "unknown";

const PAID_VALUES = new Set([
  "paid", "approved", "completed", "confirmed", "succeeded", "success", "settled",
]);
const FAILED_VALUES = new Set(["failed", "canceled", "cancelled", "denied", "rejected"]);
const EXPIRED_VALUES = new Set(["expired"]);
const REFUNDED_VALUES = new Set(["refunded", "chargeback", "disputed"]);

function normalizeStatus(raw: string | undefined | null): CajupayStatus {
  const v = String(raw || "").toLowerCase().trim();
  if (!v) return "unknown";
  if (PAID_VALUES.has(v)) return "paid";
  if (FAILED_VALUES.has(v)) return "failed";
  if (EXPIRED_VALUES.has(v)) return "expired";
  if (REFUNDED_VALUES.has(v)) return "refunded";
  return "pending";
}

export async function fetchCajupayPixStatus(
  externalId: string,
): Promise<{ status: CajupayStatus; raw: unknown } | null> {
  const apiKey = process.env.CAJUPAY_API_KEY;
  const apiSecret = process.env.CAJUPAY_API_SECRET;
  if (!apiKey || !apiSecret || !externalId) return null;

  // Try a few common endpoint shapes; first one that responds 2xx wins.
  const candidates = [
    `${CAJUPAY_BASE}/api/payments/pix/${encodeURIComponent(externalId)}`,
    `${CAJUPAY_BASE}/api/payments/${encodeURIComponent(externalId)}`,
    `${CAJUPAY_BASE}/api/charges/${encodeURIComponent(externalId)}`,
  ];

  for (const url of candidates) {
    try {
      const res = await fetch(url, {
        method: "GET",
        headers: {
          "X-API-Key": apiKey,
          "X-API-Secret": apiSecret,
          Accept: "application/json",
        },
      });
      if (!res.ok) continue;
      const text = await res.text();
      let data: Record<string, unknown> = {};
      try {
        data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
      } catch {
        continue;
      }
      const inner = (data.data as Record<string, unknown> | undefined) || data;
      const rawStatus =
        (inner.status as string | undefined) ||
        (inner.payment_status as string | undefined) ||
        (inner.state as string | undefined);
      return { status: normalizeStatus(rawStatus), raw: data };
    } catch (e) {
      console.error("[CAJUPAY] status fetch error", url, e);
    }
  }
  return null;
}

// ---------- HMAC webhook verification (X-CajuPay-Signature: t=...,v1=...) ----------

function timingSafeEqHex(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

async function hmacHex(secret: string, msg: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function verifyCajupaySignature(
  rawBody: string,
  header: string | null,
  secret: string,
  toleranceSeconds = 300,
): Promise<boolean> {
  if (!header) return false;
  const parts: Record<string, string> = {};
  header.split(",").forEach((p) => {
    const [k, v] = p.trim().split("=");
    if (k && v) parts[k] = v;
  });
  const ts = parts["t"];
  const sig = parts["v1"];
  if (!ts || !sig) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > toleranceSeconds) return false;
  const expected = await hmacHex(secret, `${ts}.${rawBody}`);
  return timingSafeEqHex(expected, sig);
}