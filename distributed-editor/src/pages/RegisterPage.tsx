import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/authStore";

export default function RegisterPage() {
  const navigate = useNavigate();
  const register = useAuthStore((s) => s.register);
  const isLoading = useAuthStore((s) => s.isLoading);

  const [name, setName] = useState("");
  const [ip, setIp] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");

  const validateEmail = (email: string): boolean => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  };

  const validateIp = (ip: string): boolean => {
    const re = /^(\d{1,3}\.){3}\d{1,3}$/;
    return re.test(ip);
  };

  const submit = async () => {
    setError("");

    if (!name.trim()) {
      setError("Name is required");
      return;
    }

    if (!ip.trim()) {
      setError("IP address is required");
      return;
    }

    if (!validateIp(ip.trim())) {
      setError("Please enter a valid IP address");
      return;
    }

    if (!email.trim()) {
      setError("Email is required");
      return;
    }

    if (!validateEmail(email.trim())) {
      setError("Please enter a valid email");
      return;
    }

    try {
      await register({ name: name.trim(), ip: ip.trim(), email: email.trim() });
      // Navigate to dashboard on successful registration
      navigate("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      submit();
    }
  };

  return (
    <div className="min-h-screen bg-[#1e1e1e] text-white flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-[#252526] border border-gray-700 rounded-lg p-8">
        <div className="mb-2">
          <h1 className="text-2xl font-bold">Distributed Editor</h1>
        </div>
        <div className="text-lg font-semibold mb-1">Register</div>
        <div className="text-xs text-gray-400 mb-6">
          Create your profile to join the network
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500 rounded text-red-300 text-sm">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyPress={handleKeyPress}
              disabled={isLoading}
              className="w-full bg-[#1e1e1e] border border-gray-700 rounded px-3 py-2 text-sm outline-none focus:border-blue-500 transition disabled:opacity-50"
              placeholder="e.g. Ram"
            />
          </div>

          <div>
            <label className="text-xs text-gray-400 mb-1 block">
              IP Address
            </label>
            <input
              value={ip}
              onChange={(e) => setIp(e.target.value)}
              onKeyPress={handleKeyPress}
              disabled={isLoading}
              className="w-full bg-[#1e1e1e] border border-gray-700 rounded px-3 py-2 text-sm outline-none focus:border-blue-500 transition disabled:opacity-50"
              placeholder="e.g. 192.168.1.10"
            />
          </div>

          <div>
            <label className="text-xs text-gray-400 mb-1 block">Email</label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyPress={handleKeyPress}
              disabled={isLoading}
              className="w-full bg-[#1e1e1e] border border-gray-700 rounded px-3 py-2 text-sm outline-none focus:border-blue-500 transition disabled:opacity-50"
              placeholder="e.g. ram@gmail.com"
            />
          </div>

          <button
            onClick={submit}
            disabled={isLoading}
            className="w-full bg-[#007acc] hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed rounded px-3 py-2 text-sm font-medium transition"
          >
            {isLoading ? "Creating Profile..." : "Create Profile"}
          </button>
        </div>
      </div>
    </div>
  );
}
