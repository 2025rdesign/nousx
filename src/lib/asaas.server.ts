const BASE_URL = "https://api.asaas.com/v3";

function apiKey() {
  const k = process.env.ASAAS_API_KEY;
  if (!k) throw new Error("ASAAS_API_KEY not configured");
  return k;
}

async function asaas<T = any>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: init.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      access_token: apiKey(),
      "User-Agent": "NOUSX/1.0",
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* ignore */ }
  if (!res.ok) {
    const msg = json?.errors?.[0]?.description || json?.message || `Asaas ${res.status}`;
    throw new Error(msg);
  }
  return json as T;
}

export type AsaasCustomer = { id: string; name: string; email: string };
export type AsaasPayment = {
  id: string;
  status: string;
  value: number;
  billingType: string;
  invoiceUrl?: string;
};
export type AsaasSubscription = {
  id: string;
  status: string;
  nextDueDate: string;
  value: number;
};

export async function findOrCreateCustomer(args: {
  email: string;
  name?: string | null;
  cpfCnpj?: string | null;
  existingId?: string | null;
}): Promise<AsaasCustomer> {
  const cpf = args.cpfCnpj?.replace(/\D/g, "") || undefined;
  if (args.existingId) {
    try {
      const existing = await asaas<AsaasCustomer>(`/customers/${args.existingId}`);
      // If we have fresh name/cpf, sync them upstream
      if (args.name || cpf) {
        try {
          return await asaas<AsaasCustomer>(`/customers/${existing.id}`, {
            method: "POST",
            body: {
              name: args.name || existing.name,
              email: args.email,
              cpfCnpj: cpf,
            },
          });
        } catch {
          return existing;
        }
      }
      return existing;
    } catch {
      // fall through and create
    }
  }
  // Try search by email
  const list = await asaas<{ data: AsaasCustomer[] }>(
    `/customers?email=${encodeURIComponent(args.email)}`,
  );
  if (list?.data?.length) {
    const found = list.data[0];
    if (args.name || cpf) {
      try {
        return await asaas<AsaasCustomer>(`/customers/${found.id}`, {
          method: "POST",
          body: { name: args.name || found.name, email: args.email, cpfCnpj: cpf },
        });
      } catch {
        return found;
      }
    }
    return found;
  }
  return asaas<AsaasCustomer>("/customers", {
    method: "POST",
    body: {
      name: args.name || args.email.split("@")[0],
      email: args.email,
      cpfCnpj: cpf,
    },
  });
}

function dueDateToday() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

export async function createPixPayment(args: {
  customerId: string;
  value: number;
  description: string;
  externalReference: string;
}): Promise<AsaasPayment> {
  return asaas<AsaasPayment>("/payments", {
    method: "POST",
    body: {
      customer: args.customerId,
      billingType: "PIX",
      value: args.value,
      dueDate: dueDateToday(),
      description: args.description,
      externalReference: args.externalReference,
    },
  });
}

export async function getPixQrCode(paymentId: string): Promise<{
  encodedImage: string;
  payload: string;
  expirationDate: string;
}> {
  return asaas(`/payments/${paymentId}/pixQrCode`);
}

export async function createCardPayment(args: {
  customerId: string;
  value: number;
  description: string;
  externalReference: string;
  card: {
    holderName: string;
    number: string;
    expiryMonth: string;
    expiryYear: string;
    ccv: string;
  };
  holder: {
    name: string;
    email: string;
    cpfCnpj: string;
    postalCode: string;
    addressNumber: string;
    phone: string;
  };
  remoteIp: string;
}): Promise<AsaasPayment> {
  return asaas<AsaasPayment>("/payments", {
    method: "POST",
    body: {
      customer: args.customerId,
      billingType: "CREDIT_CARD",
      value: args.value,
      dueDate: dueDateToday(),
      description: args.description,
      externalReference: args.externalReference,
      creditCard: args.card,
      creditCardHolderInfo: args.holder,
      remoteIp: args.remoteIp,
    },
  });
}

export async function getPayment(id: string): Promise<AsaasPayment> {
  return asaas<AsaasPayment>(`/payments/${id}`);
}

export async function createSubscription(args: {
  customerId: string;
  value: number;
  billingType: "PIX" | "CREDIT_CARD";
  description: string;
  externalReference: string;
  card?: {
    holderName: string;
    number: string;
    expiryMonth: string;
    expiryYear: string;
    ccv: string;
  };
  holder?: {
    name: string;
    email: string;
    cpfCnpj: string;
    postalCode: string;
    addressNumber: string;
    phone: string;
  };
  remoteIp?: string;
}): Promise<AsaasSubscription> {
  const body: any = {
    customer: args.customerId,
    billingType: args.billingType,
    value: args.value,
    nextDueDate: dueDateToday(),
    cycle: "MONTHLY",
    description: args.description,
    externalReference: args.externalReference,
  };
  if (args.billingType === "CREDIT_CARD" && args.card && args.holder) {
    body.creditCard = args.card;
    body.creditCardHolderInfo = args.holder;
    body.remoteIp = args.remoteIp;
  }
  return asaas<AsaasSubscription>("/subscriptions", { method: "POST", body });
}

export async function cancelSubscription(id: string): Promise<void> {
  await asaas(`/subscriptions/${id}`, { method: "DELETE" });
}

export async function listSubscriptionPayments(
  subscriptionId: string,
): Promise<{ data: AsaasPayment[] }> {
  return asaas<{ data: AsaasPayment[] }>(
    `/subscriptions/${subscriptionId}/payments`,
  );
}

/**
 * Returns the first (oldest) payment generated for a subscription.
 * Asaas auto-creates the initial payment when the subscription is created.
 */
export async function getFirstSubscriptionPayment(
  subscriptionId: string,
): Promise<AsaasPayment | null> {
  const res = await listSubscriptionPayments(subscriptionId);
  if (!res?.data?.length) return null;
  // Pick the earliest by id (Asaas IDs are time-sortable as strings) — fallback to first
  return res.data[res.data.length - 1] ?? res.data[0];
}