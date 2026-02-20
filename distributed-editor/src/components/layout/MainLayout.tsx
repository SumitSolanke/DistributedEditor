import { useEffect, useRef, useState } from "react"
import TopNavbar from "./TopNavbar"
import LeftSidebar from "./LeftSidebar"
import RightSidebar from "./RightSidebar"
import EditorArea from "../editor/EditorArea"
import ActivityBar from "./ActivityBar"
import NetworkOverlay from "../network/NetworkOverlay"

const MIN_LEFT_WIDTH = 180
const MAX_LEFT_WIDTH = 500

const MIN_RIGHT_WIDTH = 260
const MAX_RIGHT_WIDTH = 520

const MainLayout = () => {
  const [leftOpen, setLeftOpen] = useState(true)
  const [rightOpen, setRightOpen] = useState(true)

  const [leftWidth, setLeftWidth] = useState(260)
  const [rightWidth, setRightWidth] = useState(340)

  const resizing = useRef<null | "left" | "right">(null)

  const startResizingLeft = () => (resizing.current = "left")
  const startResizingRight = () => (resizing.current = "right")
  const stopResizing = () => (resizing.current = null)

  const handleMouseMove = (e: MouseEvent) => {
    if (!resizing.current) return

    if (resizing.current === "left") {
      const newWidth = e.clientX - 48 // subtract activity bar width
      if (newWidth >= MIN_LEFT_WIDTH && newWidth <= MAX_LEFT_WIDTH) setLeftWidth(newWidth)
    }

    if (resizing.current === "right") {
      const viewportWidth = window.innerWidth
      const newWidth = viewportWidth - e.clientX
      if (newWidth >= MIN_RIGHT_WIDTH && newWidth <= MAX_RIGHT_WIDTH) setRightWidth(newWidth)
    }
  }

  useEffect(() => {
    window.addEventListener("mousemove", handleMouseMove)
    window.addEventListener("mouseup", stopResizing)
    return () => {
      window.removeEventListener("mousemove", handleMouseMove)
      window.removeEventListener("mouseup", stopResizing)
    }
  }, [])

  return (
    <div className="h-screen flex flex-col bg-[#1e1e1e]">
      <TopNavbar toggleLeft={() => setLeftOpen(!leftOpen)} toggleRight={() => setRightOpen(!rightOpen)} />

      <div className="flex flex-1 overflow-hidden relative">
        {/* LEFT ACTIVITY BAR */}
        <ActivityBar />

        {/* LEFT SIDEBAR */}
        {leftOpen && (
          <div style={{ width: leftWidth }} className="relative bg-zinc-800 text-white flex flex-col">
            <LeftSidebar isOpen={true} />
            <div
              onMouseDown={startResizingLeft}
              className="absolute top-0 right-0 w-1 h-full cursor-col-resize bg-transparent hover:bg-gray-500"
            />
          </div>
        )}

        {/* EDITOR CENTER */}
        <div className="flex-1 overflow-hidden relative">
          <EditorArea />

          {/* ✅ OVERLAY that overlaps left sidebar + part of editor */}
          <NetworkOverlay />
        </div>

        {/* RIGHT SIDEBAR */}
        {rightOpen && (
          <div style={{ width: rightWidth }} className="relative bg-[#1f1f1f] text-white flex flex-col overflow-hidden">
            <div
              onMouseDown={startResizingRight}
              className="absolute top-0 left-0 w-1 h-full cursor-col-resize bg-transparent hover:bg-gray-500"
            />
            <RightSidebar isOpen={true} />
          </div>
        )}
      </div>
    </div>
  )
}

export default MainLayout