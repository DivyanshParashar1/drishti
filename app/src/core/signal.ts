/** A tiny event: on() returns its own unsubscribe. */
export class Signal<A extends unknown[] = []> {
  private listeners = new Set<(...args: A) => void>();

  on(cb: (...args: A) => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  emit(...args: A): void {
    for (const cb of [...this.listeners]) cb(...args);
  }
}
