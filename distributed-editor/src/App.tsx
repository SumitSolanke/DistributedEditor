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
      console.log("window.api available?", !!window.api);

      if (window.api) {
        try {
          console.log("Checking if backend has user...");
          const backendHasUser = await window.api.isUserRegistered();
          console.log("Backend has user:", backendHasUser);

          if (mounted) {
            if (!backendHasUser) {
              // Backend has no user, clear frontend auth
              console.log("Backend has no user - clearing frontend auth");
              localStorage.removeItem("dce-auth");
              useAuthStore.setState({
                user: null,
                isRegistered: false,
              });
            }
            setIsInitialized(true);
          }
        } catch (error) {
          console.error("Error syncing with backend:", error);
          if (mounted) {
            // Clear auth on error
            localStorage.removeItem("dce-auth");
            setIsInitialized(true);
          }
        }
      } else {
        console.log("No window.api available");
        if (mounted) setIsInitialized(true);
      }
    };

    syncWithBackend();

    return () => {
      mounted = false;
    };
  }, []);

  if (!isInitialized) {
    console.log("App still initializing...");
    return null;
  }

  console.log("App initialized - isRegistered:", isRegistered);

  if (!isRegistered) {
    console.log("Rendering RegisterPage");
    return <RegisterPage />;
  }

  console.log("Rendering MainLayout");
  return <MainLayout />;
}
