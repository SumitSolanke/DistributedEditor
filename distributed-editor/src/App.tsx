import MainLayout from "./components/layout/MainLayout";
import RegisterPage from "./pages/RegisterPage";
import { useAuthStore } from "./store/authStore";
import { useEffect, useState } from "react";

let hasCheckedBackendRegistration = false;

export default function App() {
  const isRegistered = useAuthStore((s) => s.isRegistered);
  const [isInitialized, setIsInitialized] = useState(false);

  // On app startup, sync frontend auth state with backend
  useEffect(() => {
    let mounted = true;

    const syncWithBackend = async () => {
      if (hasCheckedBackendRegistration) {
        if (mounted) setIsInitialized(true);
        return;
      }

      console.log("App mounted - syncing with backend...");

      // Load any persisted frontend auth state so UI can render quickly
      try {
        const persisted = localStorage.getItem("dce-auth");
        if (persisted) {
          try {
            const parsed = JSON.parse(persisted);
            // Zustand persist payload shape: { state, version }
            if (parsed && parsed.state) {
              useAuthStore.setState({
                user: parsed.state.user ?? null,
                isRegistered: Boolean(parsed.state.isRegistered),
              });
            }
          } catch (e) {
            console.warn("Failed to parse persisted auth", e);
          }
        }
      } catch {
        // ignore localStorage access errors
      }

      // Then verify backend-known registration state when possible
      if (window.api && typeof window.api.isUserRegistered === "function") {
        try {
          const backendHasUser = await window.api.isUserRegistered();
          console.log("Backend has user:", backendHasUser);

          if (mounted) {
            if (!backendHasUser) {
              // Backend has no user, clear frontend auth
              console.log("Backend has no user - clearing frontend auth");
              localStorage.removeItem("dce-auth");
              useAuthStore.setState({ user: null, isRegistered: false });
            }
            hasCheckedBackendRegistration = true;
            setIsInitialized(true);
          }
        } catch (error) {
          console.error("Error syncing with backend:", error);
          if (mounted) {
            // Allow UI to use local state if backend check fails.
            hasCheckedBackendRegistration = true;
            setIsInitialized(true);
          }
        }
      } else {
        // No backend API available, proceed using local state.
        if (mounted) {
          hasCheckedBackendRegistration = true;
          setIsInitialized(true);
        }
      }
    };

    void syncWithBackend();

    return () => {
      mounted = false;
    };
  }, []);

  if (!isInitialized) return null;

  if (!isRegistered) return <RegisterPage />;

  return <MainLayout />;
}
