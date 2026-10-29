import { useCallback, useEffect, useRef, useState } from 'react';
import { requestAIConsent, type AIConsentPurpose } from '../services/ai-consent';

export function useAIConsent() {
  const mounted = useRef(true);
  const pending = useRef<AbortController | undefined>(undefined);
  const [requestingConsent, setRequestingConsent] = useState(false);
  const cancelConsent = useCallback(() => {
    pending.current?.abort();
    pending.current = undefined;
    if (mounted.current) setRequestingConsent(false);
  }, []);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      cancelConsent();
    };
  }, [cancelConsent]);
  const authorize = useCallback(async (purpose: AIConsentPurpose) => {
    if (pending.current || !mounted.current) return false;
    const controller = new AbortController();
    pending.current = controller;
    setRequestingConsent(true);
    try {
      const allowed = await requestAIConsent(purpose, controller.signal);
      return allowed && mounted.current && !controller.signal.aborted;
    } finally {
      if (pending.current === controller) {
        pending.current = undefined;
        if (mounted.current) setRequestingConsent(false);
      }
    }
  }, []);
  return { authorize, requestingConsent, cancelConsent };
}
