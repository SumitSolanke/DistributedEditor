import { useEffect } from "react";
import MainLayout from "./components/layout/MainLayout";
import RegisterPage from "./pages/RegisterPage";
import { useAuthStore } from "./store/authStore";
import { useNetworkStore } from "./store/networkStore";

export default function App() {
  const { isRegistered, isLoading, loadUserFromElectronStore } = useAuthStore();
  const initWebSocket = useNetworkStore((s) => s.initWebSocket);

  // Load user from Electron store on app start
  useEffect(() => {
    const initApp = async () => {
      await loadUserFromElectronStore();

      // Initialize WebSocket if user is registered
      const user = useAuthStore.getState().currentUser;
      if (user) {
        try {
          await initWebSocket("ws://localhost:8080");
        } catch (error) {
          console.error("Failed to connect to WebSocket server:", error);
        }
      }
    };

    initApp();
  }, [loadUserFromElectronStore, initWebSocket]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#1e1e1e] text-white flex items-center justify-center">
        <div className="text-center">
          <div className="text-lg font-semibold mb-2">Loading...</div>
          <div className="text-gray-400 text-sm">
            Initializing Distributed Editor
          </div>
        </div>
      </div>
    );
  }

  if (!isRegistered) return <RegisterPage />;
  return <MainLayout />;
}
