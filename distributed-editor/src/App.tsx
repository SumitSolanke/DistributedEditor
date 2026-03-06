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
  const user = useAuthStore((s) => s.user);
  const register = useAuthStore((s) => s.register);
  const reset = useAuthStore((s) => s.reset);
  const [isInitialized, setIsInitialized] = useState(false);

  const hasLocalRegistration =
    isRegistered &&
    typeof user?.name === "string" &&
    user.name.trim().length > 0 &&
    typeof user?.email === "string" &&
    user.email.trim().length > 0;

  useEffect(() => {
    let mounted = true;

    const initAuth = async () => {
      if (hasCheckedBackendThisSession()) {
        if (mounted) setIsInitialized(true);
        return;
      }

      const getRegisteredUser = window.api?.getRegisteredUser;
      if (typeof getRegisteredUser !== "function") {
        if (!hasLocalRegistration) {
          reset();
        }
        markBackendCheckedThisSession();
        if (mounted) setIsInitialized(true);
        return;
      }

      try {
        const result = await getRegisteredUser();
        if (!mounted) return;

        const backendUser = result?.success ? result.user : null;
        if (
          backendUser &&
          typeof backendUser.name === "string" &&
          backendUser.name.trim() &&
          typeof backendUser.email === "string" &&
          backendUser.email.trim()
        ) {
          register({
            name: backendUser.name,
            ip: backendUser.ip || "",
            email: backendUser.email,
          });
        } else {
          reset();
        }
      } catch (error) {
        console.error("Startup backend user sync failed:", error);
        if (!hasLocalRegistration) {
          reset();
        }
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
  }, [hasLocalRegistration, register, reset]);

  if (!isInitialized) return null;

  if (!hasLocalRegistration) return <RegisterPage />;

  return <MainLayout />;
}
