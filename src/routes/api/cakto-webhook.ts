// Alias for /api/cakto-webhook → forwards to the public webhook handler.
// Kept so existing Cakto panel configurations pointing at /api/cakto-webhook
// keep working alongside the canonical /api/public/cakto-webhook URL.
import { createFileRoute } from "@tanstack/react-router";
import { Route as PublicWebhook } from "./public/cakto-webhook";

const publicHandlers = PublicWebhook.options.server!.handlers as {
  POST: (ctx: { request: Request }) => Promise<Response>;
};

export const Route = createFileRoute("/api/cakto-webhook")({
  server: {
    handlers: {
      POST: publicHandlers.POST,
    },
  },
});
