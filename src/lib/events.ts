/** A tiny change feed: screens re-read the local database when a collection they show changes. */
type Listener = () => void;
const channels = new Map<string, Set<Listener>>();

export function subscribe(channel: string, listener: Listener) {
  const set = channels.get(channel) ?? new Set();
  set.add(listener);
  channels.set(channel, set);
  return () => {
    set.delete(listener);
  };
}

export function emit(channel: string) {
  channels.get(channel)?.forEach((l) => l());
}
