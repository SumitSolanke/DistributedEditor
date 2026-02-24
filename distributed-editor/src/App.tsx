import MainLayout from "./components/layout/MainLayout";
import RegisterPage from "./pages/RegisterPage";
import { useAuthStore } from "./store/authStore";
import { useEffect, useState } from "react";

export default function App() {
  const isRegistered = useAuthStore((s) => s.isRegistered);
  const [isInitialized, setIsInitialized] = useState(false);

  // On app startup, sync frontend auth state with backend
  useEffect(() => {
    let mounted = true;

    const syncWithBackend = async () => {
      console.log("App mounted - syncing with backend...");

      // Load any persisted frontend auth state so UI can render quickly
      try {
        const persisted = localStorage.getItem("dce-auth");
        if (persisted) {
          try {
            const parsed = JSON.parse(persisted);
            // Reinstate minimal auth state if present
            if (parsed && parsed.currentUser) {
              useAuthStore.setState({
                user: parsed.user ?? null,
                currentUser: parsed.currentUser ?? null,
                isRegistered: Boolean(parsed.isRegistered),
              });
            }
          } catch (e) {
            console.warn("Failed to parse persisted auth", e);
          }
        }
      } catch (e) {
        /* ignore */
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
              useAuthStore.setState({ user: null, currentUser: null, isRegistered: false });
            }
            setIsInitialized(true);
          }
        } catch (error) {
          console.error("Error syncing with backend:", error);
          if (mounted) {
            // allow UI to show based on local state if backend check fails
            setIsInitialized(true);
          }
        }
      } else {
        // No backend API available — proceed using local state
        if (mounted) setIsInitialized(true);
      }
    };

    syncWithBackend();

    return () => {
      mounted = false;
    };
  }, []);

  if (!isInitialized) return null;

  if (!isRegistered) return <RegisterPage />;

  return <MainLayout />;
}
