import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  clearAccountSession,
  restoreAccountSession,
  subscribeAccountSession,
  type AccountSession,
} from '../../services/account-auth';
import { clearLegacyAnonymousLocalData, clearTransientAccountMediaCache } from '../../services/legacy-account-data-cleanup';
import { useAppStore } from '../../store/use-app-store';

type AccountSessionContextValue = {
  ready: boolean;
  session: AccountSession | null;
  error?: string;
};

const AccountSessionContext = createContext<AccountSessionContextValue>({
  ready: false,
  session: null,
});

async function resetStoreForAccount() {
  useAppStore.setState(useAppStore.getInitialState(), true);
}

async function hydrateAccountData() {
  const store = useAppStore.getState();
  await store.hydratePhotoPermission();
  await store.hydrateDrafts();
  await store.hydrateMemories();
}

export function AccountSessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<AccountSession | null>(null);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;
    let currentUserId: string | undefined;
    let unsubscribe: (() => void) | undefined;

    void (async () => {
      try {
        await clearLegacyAnonymousLocalData();
        const restored = await restoreAccountSession();
        currentUserId = restored?.user.id;
        if (restored) await hydrateAccountData();
        if (!active) return;
        setSession(restored ?? null);
        setReady(true);
        unsubscribe = subscribeAccountSession(next => {
          const nextUserId = next?.user.id;
          if (nextUserId === currentUserId) return;
          currentUserId = nextUserId;
          setReady(false);
          void (async () => {
            await clearTransientAccountMediaCache();
            await resetStoreForAccount();
            if (next) await hydrateAccountData();
            if (!active) return;
            setSession(next ?? null);
            setReady(true);
          })().catch(() => {
            if (!active) return;
            void clearAccountSession();
            setError('账号数据暂时无法加载，请检查网络后重试。');
            setSession(null);
            setReady(true);
          });
        });
      } catch {
        if (!active) return;
        setError('账号数据准备失败，请重新启动应用后重试。');
        setReady(true);
      }
    })();

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, []);

  const value = useMemo(() => ({ ready, session, error }), [ready, session, error]);
  return <AccountSessionContext.Provider value={value}>{children}</AccountSessionContext.Provider>;
}

export function useAccountSession() {
  return useContext(AccountSessionContext);
}
