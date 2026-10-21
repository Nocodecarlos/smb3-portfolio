// Tiny event bus between the game scenes and the dev-mode panel.

type Events = {
  /** Dev mode toggled. */
  dev: boolean;
  /** A beat was clicked in the game while in dev mode. */
  select: { slug: string; beatId: string };
};

type Handler<K extends keyof Events> = (payload: Events[K]) => void;
const handlers = new Map<keyof Events, Set<(payload: never) => void>>();

export const devBus = {
  on<K extends keyof Events>(event: K, fn: Handler<K>): () => void {
    let set = handlers.get(event);
    if (!set) handlers.set(event, (set = new Set()));
    set.add(fn as (payload: never) => void);
    return () => set.delete(fn as (payload: never) => void);
  },
  emit<K extends keyof Events>(event: K, payload: Events[K]) {
    handlers.get(event)?.forEach((fn) => (fn as Handler<K>)(payload));
  },
};
