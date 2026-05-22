// Direct REST client for Mercado Pago — avoids SDK Node-only deps on Workers.
const MP_BASE = "https://api.mercadopago.com";

function authHeaders(): Record<string, string> {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!token) throw new Error("MERCADOPAGO_ACCESS_TOKEN not configured");
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

export type CreatePreferenceInput = {
  title: string;
  unitPrice: number;
  externalReference: string;
  payerEmail?: string;
  payerName?: string;
  successUrl: string;
  failureUrl: string;
  pendingUrl: string;
  notificationUrl: string;
  idempotencyKey: string;
};

export type CreatePreferenceResult = {
  preferenceId: string;
  initPoint: string;
};

export async function createMpPreference(
  input: CreatePreferenceInput,
): Promise<CreatePreferenceResult> {
  const body = {
    items: [
      {
        title: input.title,
        quantity: 1,
        unit_price: Math.round(input.unitPrice * 100) / 100,
        currency_id: "BRL",
      },
    ],
    payer: input.payerEmail
      ? { email: input.payerEmail, name: input.payerName ?? undefined }
      : undefined,
    payment_methods: {
      excluded_payment_types: [],
      installments: 1,
    },
    back_urls: {
      success: input.successUrl,
      failure: input.failureUrl,
      pending: input.pendingUrl,
    },
    auto_return: "approved",
    notification_url: input.notificationUrl,
    external_reference: input.externalReference,
    statement_descriptor: "AURAIA",
  };

  const res = await fetch(`${MP_BASE}/checkout/preferences`, {
    method: "POST",
    headers: {
      ...authHeaders(),
      "X-Idempotency-Key": input.idempotencyKey,
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  if (!res.ok) {
    console.error("[MP] preference create failed", res.status, text);
    throw new Error(`Falha ao criar pagamento (${res.status})`);
  }
  const json = JSON.parse(text) as {
    id: string;
    init_point: string;
    sandbox_init_point?: string;
  };
  return { preferenceId: json.id, initPoint: json.init_point };
}

export type MpPaymentDetails = {
  id: number | string;
  status: string;
  status_detail?: string;
  external_reference?: string | null;
  transaction_amount?: number;
  payer?: { email?: string };
  payment_method_id?: string;
};

export async function fetchMpPayment(paymentId: string | number): Promise<MpPaymentDetails | null> {
  const res = await fetch(`${MP_BASE}/v1/payments/${paymentId}`, {
    headers: authHeaders(),
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    console.error("[MP] fetch payment failed", res.status, await res.text());
    return null;
  }
  return (await res.json()) as MpPaymentDetails;
}

export type CreatePixInput = {
  amount: number;
  description: string;
  payerEmail: string;
  payerFirstName: string;
  payerLastName?: string;
  cpf: string; // 11 digits, no formatting
  externalReference: string;
  notificationUrl: string;
  idempotencyKey: string;
  expiresInMinutes?: number;
};

export type CreatePixResult = {
  paymentId: string;
  status: string;
  qrCode: string;
  qrCodeBase64: string;
  ticketUrl?: string;
  expiresAt: string;
};

export async function createMpPixPayment(input: CreatePixInput): Promise<CreatePixResult> {
  const exp = new Date(Date.now() + (input.expiresInMinutes ?? 30) * 60 * 1000);
  // MP requires ISO 8601 with offset, e.g. 2024-01-01T12:00:00.000-03:00
  const isoWithOffset = exp.toISOString().replace("Z", "-00:00");

  const body = {
    transaction_amount: Math.round(input.amount * 100) / 100,
    description: input.description,
    payment_method_id: "pix",
    payer: {
      email: input.payerEmail,
      first_name: input.payerFirstName,
      last_name: input.payerLastName,
      identification: { type: "CPF", number: input.cpf },
    },
    notification_url: input.notificationUrl,
    external_reference: input.externalReference,
    statement_descriptor: "AURAIA",
    date_of_expiration: isoWithOffset,
  };

  const res = await fetch(`${MP_BASE}/v1/payments`, {
    method: "POST",
    headers: {
      ...authHeaders(),
      "X-Idempotency-Key": input.idempotencyKey,
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  if (!res.ok) {
    console.error("[MP] PIX create failed", res.status, text);
    let msg = `Falha ao gerar PIX (${res.status})`;
    try {
      const j = JSON.parse(text) as { message?: string };
      if (j.message) msg = j.message;
    } catch {}
    throw new Error(msg);
  }
  const json = JSON.parse(text) as {
    id: number | string;
    status: string;
    date_of_expiration?: string;
    point_of_interaction?: {
      transaction_data?: {
        qr_code?: string;
        qr_code_base64?: string;
        ticket_url?: string;
      };
    };
  };
  const td = json.point_of_interaction?.transaction_data ?? {};
  return {
    paymentId: String(json.id),
    status: json.status,
    qrCode: td.qr_code ?? "",
    qrCodeBase64: td.qr_code_base64 ?? "",
    ticketUrl: td.ticket_url,
    expiresAt: json.date_of_expiration ?? exp.toISOString(),
  };
}