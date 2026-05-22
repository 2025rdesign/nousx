// Alias kept so existing Cakto panel configurations pointing at
// /api/cakto-webhook keep working alongside /api/public/cakto-webhook.
import { createFileRoute } from "@tanstack/react-router";
import { handleCaktoWebhook } from "@/lib/cakto-webhook.server";

export const Route = createFileRoute("/api/cakto-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => handleCaktoWebhook(request),
    },
  },
});
