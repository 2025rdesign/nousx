import { createFileRoute } from "@tanstack/react-router";
import { handleCaktoWebhook } from "@/lib/cakto-webhook.server";

export const Route = createFileRoute("/api/public/cakto-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => handleCaktoWebhook(request),
    },
  },
});
