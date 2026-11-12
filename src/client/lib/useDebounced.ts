import { useEffect, useState } from 'react';

// The value, once it has stopped changing for `ms`. Keeps typing from firing a
// search (and an upstream API call) per keystroke.
export function useDebounced<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return settled;
}
