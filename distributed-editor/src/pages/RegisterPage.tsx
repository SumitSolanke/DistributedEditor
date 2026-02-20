import { useState } from "react"
import { useAuthStore } from "../store/authStore"

export default function RegisterPage() {
  const register = useAuthStore((s) => s.register)

  const [name, setName] = useState("")
  const [ip, setIp] = useState("")
  const [email, setEmail] = useState("")

  const submit = () => {
    if (!name.trim() || !ip.trim() || !email.trim()) {
      alert("Please fill Name, IP and Email")
      return
    }
    register({ name, ip, email })
  }

  return (
    <div className="min-h-screen bg-[#1e1e1e] text-white flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-[#252526] border border-gray-700 rounded-lg p-5">
        <div className="text-lg font-semibold mb-1">Register</div>
        <div className="text-xs text-gray-400 mb-4">
          Save your identity locally (no backend yet)
        </div>

        <div className="space-y-3">
          <div>
            <div className="text-xs text-gray-400 mb-1">Name</div>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-[#1e1e1e] border border-gray-700 rounded px-3 py-2 text-sm outline-none"
              placeholder="e.g. Ram"
            />
          </div>

          <div>
            <div className="text-xs text-gray-400 mb-1">IP Address</div>
            <input
              value={ip}
              onChange={(e) => setIp(e.target.value)}
              className="w-full bg-[#1e1e1e] border border-gray-700 rounded px-3 py-2 text-sm outline-none"
              placeholder="e.g. 192.168.1.10"
            />
          </div>

          <div>
            <div className="text-xs text-gray-400 mb-1">Email</div>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-[#1e1e1e] border border-gray-700 rounded px-3 py-2 text-sm outline-none"
              placeholder="e.g. ram@gmail.com"
            />
          </div>

          <button
            onClick={submit}
            className="w-full bg-[#007acc] hover:opacity-90 rounded px-3 py-2 text-sm"
          >
            Create Profile
          </button>
        </div>
      </div>
    </div>
  )
}