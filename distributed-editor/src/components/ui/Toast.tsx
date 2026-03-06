import { useEffect } from "react"

export default function Toast({
  open,
  message,
  onClose,
  tone = "default",
}: {
  open: boolean
  message: string
  onClose: () => void
  tone?: "default" | "error" | "success"
}) {
  useEffect(() => {
    if (!open) return
    const t = window.setTimeout(onClose, 2500)
    return () => window.clearTimeout(t)
  }, [open, onClose])

  if (!open) return null

  const toneClass =
    tone === "error"
      ? "bg-[#3b1117] text-[#ffd7de] border-red-500/70"
      : tone === "success"
        ? "bg-[#103221] text-[#d7ffe9] border-green-500/60"
        : "bg-[#252526] text-white border-gray-700"

  return (
    <div className="fixed bottom-4 right-4 z-[999]">
      <div className={`border rounded px-4 py-3 shadow-lg text-sm ${toneClass}`}>
        {message}
      </div>
    </div>
  )
}
