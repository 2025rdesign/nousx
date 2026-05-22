import { useSyncExternalStore } from "react";

interface PlayerState {
  id: string | null;
  blobUrl: string | null;
}

let state: PlayerState = { id: null, blobUrl: null };
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
  open(id: string, blobUrl: string) {
    if (state.blobUrl && state.blobUrl !== blobUrl) {
      try {
        URL.revokeObjectURL(state.blobUrl);
      } catch {
        /* ignore */
      }
    }
    state = { id, blobUrl };
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
    state = { id: null, blobUrl: null };
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