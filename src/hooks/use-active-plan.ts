import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMySubscription } from "@/lib/payments.functions";
import { useAuth } from "./use-auth";

export function useActivePlan() {
  const { user } = useAuth();
  const fetchSub = useServerFn(getMySubscription);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["my-subscription"],
    queryFn: async () => {
      try {
        return await fetchSub();
      } catch {
        return null;
      }
    },
    enabled: !!user,
    staleTime: 60_000,
  });

  if (!user)
    return {
      hasActive: false,
      planId: null as string | null,
      subscription: null as null,
      isLoading: false,
    };
  const sub = data ?? null;
  const hasActive =
    !!sub &&
    sub.status === "active" &&
    (!sub.expires_at || new Date(sub.expires_at).getTime() > Date.now());
  return {
    hasActive,
    planId: sub?.plan_id ?? null,
    subscription: sub,
    isLoading: isLoading || (isFetching && !data),
  };
}