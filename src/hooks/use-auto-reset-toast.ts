'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Toast tự tắt sau 3s (D3 — gom 2 cặp useState+useEffect trùng nhau).
 * Trả [visible, show] — gọi show() từ event handler (không gọi trong effect).
 */
export function useAutoResetToast(durationMs = 3000): [boolean, () => void] {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const timeoutId = window.setTimeout(() => {
      setVisible(false);
    }, durationMs);
    return () => window.clearTimeout(timeoutId);
  }, [visible, durationMs]);

  const show = useCallback(() => setVisible(true), []);
  return [visible, show];
}
