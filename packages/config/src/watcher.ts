import * as fs from "node:fs";

export type ConfigChangeCallback = (filePath: string) => void;

/**
 * Watch a configuration file for changes and invoke `callback` when the file
 * is modified.  Uses Node's built-in `fs.watch` with a simple debounce to
 * avoid firing multiple times for a single save.
 *
 * @param filePath - Path to the config file to watch.
 * @param callback - Function called with `filePath` whenever the file changes.
 * @param debounceMs - Debounce interval in milliseconds (default 300).
 * @returns A cleanup function that stops watching.
 */
export function watchConfig(
  filePath: string,
  callback: ConfigChangeCallback,
  debounceMs = 300,
): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const watcher = fs.watch(filePath, (eventType: string) => {
    if (eventType !== "change") return;

    if (timer) {
      clearTimeout(timer);
    }

    timer = setTimeout(() => {
      timer = null;
      callback(filePath);
    }, debounceMs);
  });

  return () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    watcher.close();
  };
}
