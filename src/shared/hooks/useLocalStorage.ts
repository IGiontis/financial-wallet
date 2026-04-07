// src/hooks/useLocalStorage.ts
import { useState } from "react";

/**
 * Works exactly like useState, but persists the value to localStorage.
 * The key is the localStorage key string.
 */
export function useLocalStorage<T>(key: string, initialValue: T) {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = localStorage.getItem(key);
      // Parse stored JSON, or return initialValue if nothing stored yet
      return item !== null ? (JSON.parse(item) as T) : initialValue;
    } catch {
      return initialValue;
    }
  });

  const setValue = (value: T | ((prev: T) => T)) => {
    try {
      // Allow functional updates just like useState
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      setStoredValue(valueToStore);
      localStorage.setItem(key, JSON.stringify(valueToStore));
    } catch {
      console.warn(`useLocalStorage: could not save key "${key}"`);
    }
  };

  return [storedValue, setValue] as const;
}