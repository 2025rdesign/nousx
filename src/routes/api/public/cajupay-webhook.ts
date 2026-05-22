import { createFileRoute } from "@tanstack/react-router";
import { handleCajupayWebhook } from "@/lib/cajupay-webhook.server";

export const Route = createFileRoute("/api/public/cajupay-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => handleCajupayWebhook(request),
    },
  },
});