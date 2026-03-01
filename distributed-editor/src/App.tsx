import MainLayout from "./components/layout/MainLayout";
import RegisterPage from "./pages/RegisterPage";
import { useAuthStore } from "./store/authStore";
import { useEffect, useState } from "react";

const BACKEND_USER_CHECK_KEY = "dce-backend-user-check-done";

function hasCheckedBackendThisSession() {
  return sessionStorage.getItem(BACKEND_USER_CHECK_KEY) === "1";
}

function markBackendCheckedThisSession() {
  sessionStorage.setItem(BACKEND_USER_CHECK_KEY, "1");
}

export default function App() {
  const isRegistered = useAuthStore((s) => s.isRegistered);
  const register = useAuthStore((s) => s.register);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    let mounted = true;

    const initAuth = async () => {
      if (isRegistered || hasCheckedBackendThisSession()) {
        if (mounted) setIsInitialized(true);
        return;
      }

      const getRegisteredUser = window.api?.getRegisteredUser;
      if (typeof getRegisteredUser !== "function") {
        markBackendCheckedThisSession();
        if (mounted) setIsInitialized(true);
        return;
      }

      try {
        const result = await getRegisteredUser();
        if (!mounted) return;

        if (result?.success && result.user) {
          register({
            name: result.user.name || "",
            ip: result.user.ip || "",
            email: result.user.email || "",
          });
        } else {
          useAuthStore.setState({ user: null, isRegistered: false });
        }
      } catch (error) {
        console.error("Startup backend user sync failed:", error);
      } finally {
        if (!mounted) return;
        markBackendCheckedThisSession();
        setIsInitialized(true);
      }
    };

    void initAuth();

    return () => {
      mounted = false;
    };
  }, [isRegistered, register]);

  if (!isInitialized) return null;

  if (!isRegistered) return <RegisterPage />;

  return <MainLayout />;
}
