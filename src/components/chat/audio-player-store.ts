import { useSyncExternalStore } from "react";

interface PlayerState {
  id: string | null;
  blobUrl: string | null;
  loading: boolean;
}

let state: PlayerState = { id: null, blobUrl: null, loading: false };
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export const audioPlayerStore = {
  subscribe(cb: () => void) {
    listeners.add(cb);
    return () => {
      listeners.delete(cb);
    };
  },
  get() {
    return state;
  },
  showLoading(id: string) {
    if (state.blobUrl) {
      try {
        URL.revokeObjectURL(state.blobUrl);
      } catch {
        /* ignore */
      }
    }
    state = { id, blobUrl: null, loading: true };
    emit();
  },
  open(id: string, blobUrl: string) {
    if (state.blobUrl && state.blobUrl !== blobUrl) {
      try {
        URL.revokeObjectURL(state.blobUrl);
      } catch {
        /* ignore */
      }
    }
    state = { id, blobUrl, loading: false };
    emit();
  },
  close() {
    if (state.blobUrl) {
      try {
        URL.revokeObjectURL(state.blobUrl);
      } catch {
        /* ignore */
      }
    }
    state = { id: null, blobUrl: null, loading: false };
    emit();
  },
};

export function useAudioPlayer() {
  return useSyncExternalStore(
    audioPlayerStore.subscribe,
    audioPlayerStore.get,
    audioPlayerStore.get,
  );
}