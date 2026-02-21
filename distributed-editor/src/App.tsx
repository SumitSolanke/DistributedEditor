import { useEffect } from "react";
import MainLayout from "./components/layout/MainLayout";
import RegisterPage from "./pages/RegisterPage";
import { useAuthStore } from "./store/authStore";
import { useNetworkStore } from "./store/networkStore";

export default function App() {
  const { isRegistered, isLoading, loadUserFromElectronStore } = useAuthStore();
  const initWebSocket = useNetworkStore((s) => s.initWebSocket);

  useEffect(() => {
    const initApp = async () => {
      await loadUserFromElectronStore();

      const user = useAuthStore.getState().currentUser;
      if (user) {
        await initWebSocket("ws://localhost:3002"); // ✅ FIXED
      }
    };

    initApp();
  }, [loadUserFromElectronStore, initWebSocket]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#1e1e1e] text-white flex items-center justify-center">
        <div className="text-center">
          <div className="text-lg font-semibold mb-2">Loading...</div>
          <div className="text-gray-400 text-sm">Initializing Distributed Editor</div>
        </div>
      </div>
    );
  }

  if (!isRegistered) return <RegisterPage />;
  return <MainLayout />;
}