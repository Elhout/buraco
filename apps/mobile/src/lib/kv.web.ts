/** Web build: localStorage with the subset of the expo-sqlite kv-store API the app uses. */
const store = (): Storage | null => {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

export const kv = {
  getItemSync: (key: string): string | null => store()?.getItem(key) ?? null,
  setItemSync: (key: string, value: string): void => store()?.setItem(key, value),
  getItem: async (key: string): Promise<string | null> => store()?.getItem(key) ?? null,
  setItem: async (key: string, value: string): Promise<void> => store()?.setItem(key, value),
  removeItem: async (key: string): Promise<void> => store()?.removeItem(key),
}
