import MainLayout from "./components/layout/MainLayout"
import RegisterPage from "./pages/RegisterPage"
import { useAuthStore } from "./store/authStore"

export default function App() {
  const isRegistered = useAuthStore((s) => s.isRegistered)

  if (!isRegistered) return <RegisterPage />
  return <MainLayout />
}