import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  advancePendingVideoJobsForUser,
  cleanupStalePendingJobsForUser,
} from "@/lib/video-jobs.server";

const listSchema = z.object({
  statuses: z.array(z.enum(["pending", "processing", "completed", "failed"])).optional(),
});

export const getMyVideoJobs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => listSchema.parse(input ?? {}))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const apiKey = process.env.XAI_API_KEY;
    if (apiKey && data.statuses?.some((status) => status === "pending" || status === "processing")) {
      return advancePendingVideoJobsForUser(userId, apiKey);
    }
    let query = supabase
      .from("video_jobs")
      .select(
        "id, conversation_id, source_image_url, xai_request_id, status, final_video_url, error_message, credits_charged, created_at, updated_at",
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20);

    if (data.statuses?.length) {
      query = query.in("status", data.statuses);
    }

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// Marks the calling user's pending/processing video jobs older than 10 minutes
// as failed and refunds the credits. Safe to call once on app startup.
export const cleanupStalePendingVideoJobs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const count = await cleanupStalePendingJobsForUser(userId, 10);
    return { cleaned: count };
  });