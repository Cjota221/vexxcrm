'use client';

import { useState, useEffect } from 'react';

/**
 * Hook que retorna um valor com debounce.
 * Útil para evitar chamadas excessivas a APIs durante digitação.
 *
 * @param value - Valor a ser debounced
 * @param delay - Delay em ms (padrão: 300ms, conforme copilot-instructions)
 * @returns Valor debounced
 *
 * @example
 * const debouncedSearch = useDebounce(searchQuery, 300);
 * // debouncedSearch só atualiza 300ms após o último keystroke
 */
export function useDebounce<T>(value: T, delay = 300): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}
