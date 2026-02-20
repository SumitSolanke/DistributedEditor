import { useEffect } from "react"

export default function Toast({
  open,
  message,
  onClose,
}: {
  open: boolean
  message: string
  onClose: () => void
}) {
  useEffect(() => {
    if (!open) return
    const t = window.setTimeout(onClose, 2500)
    return () => window.clearTimeout(t)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed bottom-4 right-4 z-[999]">
      <div className="bg-[#252526] text-white border border-gray-700 rounded px-4 py-3 shadow-lg text-sm">
        {message}
      </div>
    </div>
  )
}