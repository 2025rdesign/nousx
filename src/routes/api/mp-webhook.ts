import { createFileRoute } from "@tanstack/react-router";
import { processMpPayment } from "@/lib/mp-webhook.server";

export const Route = createFileRoute("/api/mp-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let rawBody = "";
        try {
          rawBody = await request.text();
        } catch {}
        let body: Record<string, unknown> = {};
        try {
          body = rawBody ? (JSON.parse(rawBody) as Record<string, unknown>) : {};
        } catch {}

        const url = new URL(request.url);
        const qpType = url.searchParams.get("type") || url.searchParams.get("topic");
        const qpId = url.searchParams.get("data.id") || url.searchParams.get("id");

        const headersLog: Record<string, string> = {};
        request.headers.forEach((v, k) => {
          headersLog[k] = v;
        });

        console.log("[MP-WEBHOOK] recebido body:", rawBody || "(vazio)");
        console.log("[MP-WEBHOOK] query:", Object.fromEntries(url.searchParams.entries()));
        console.log("[MP-WEBHOOK] headers:", JSON.stringify(headersLog));

        const type = String(body.type ?? body.action ?? qpType ?? "").toLowerCase();
        const dataObj = (body.data as Record<string, unknown> | undefined) ?? {};
        const paymentId = String(dataObj.id ?? body.id ?? qpId ?? "");

        console.log("[MP-WEBHOOK] type:", type, "paymentId:", paymentId);

        if (!paymentId) {
          console.log("[MP-WEBHOOK] paymentId nao encontrado, ignorando");
          return new Response("ok", { status: 200 });
        }

        // Process inline — fire-and-forget is unsafe on Workers (isolate dies
        // after response). MP timeout is generous; await before returning 200.
        try {
          await processMpPayment(paymentId);
        } catch (e) {
          console.error("[MP-WEBHOOK] processPayment error", e);
        }

        // Always return 200 to prevent MP retries
        return new Response("ok", { status: 200 });
      },
      GET: async ({ request }) => {
        // MP IPN/legacy sometimes uses GET with query params
        const url = new URL(request.url);
        const qpType = url.searchParams.get("type") || url.searchParams.get("topic");
        const paymentId = url.searchParams.get("data.id") || url.searchParams.get("id") || "";
        console.log("[MP-WEBHOOK GET]", {
          type: qpType,
          paymentId,
          query: Object.fromEntries(url.searchParams.entries()),
        });
        if (paymentId && (qpType === "payment" || !qpType)) {
          try {
            await processMpPayment(paymentId);
          } catch (e) {
            console.error("[MP-WEBHOOK GET] processPayment error", e);
          }
        }
        return new Response("ok", { status: 200 });
      },
    },
  },
});