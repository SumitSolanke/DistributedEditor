import { useEffect, useMemo, useRef } from "react";
import { useEditorStore } from "../../store/editorStore";

function shortCommit(value: string) {
  return value ? value.slice(0, 10) : "";
}

export default function CommunicationViewer() {
  const viewer = useEditorStore((state) => state.communicationViewer);

  const lines = useMemo(() => {
    if (!viewer) return [];
    return (viewer.content || "").split(/\r?\n/);
  }, [viewer]);

  const firstHighlightedLineRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!firstHighlightedLineRef.current) return;
    firstHighlightedLineRef.current.scrollIntoView({
      block: "center",
      behavior: "smooth",
    });
  }, [viewer?.threadId, viewer?.startLine, viewer?.endLine]);

  if (!viewer) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400">
        Select a communication thread to open its file snapshot.
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-[#1e1e1e]">
      <div className="px-3 py-2 border-b border-gray-700 text-xs text-gray-300 flex items-center gap-3">
        <span className="font-semibold text-gray-100">{viewer.filePath}</span>
        <span className="text-gray-500">commit {shortCommit(viewer.commitHash)}</span>
        <span className="text-gray-500">
          lines {viewer.startLine}-{viewer.endLine}
        </span>
      </div>

      <div className="flex-1 overflow-auto font-mono text-[12px] leading-6">
        {lines.map((line, index) => {
          const lineNo = index + 1;
          const highlighted =
            lineNo >= viewer.startLine && lineNo <= viewer.endLine;
          return (
            <div
              key={`${lineNo}-${line}`}
              ref={
                highlighted && lineNo === viewer.startLine
                  ? firstHighlightedLineRef
                  : null
              }
              className={`flex ${highlighted ? "bg-[#2f4157]" : ""}`}
            >
              <div className="w-14 shrink-0 text-right px-2 text-gray-500 select-none border-r border-[#2a2a2a]">
                {lineNo}
              </div>
              <pre className="m-0 px-3 whitespace-pre-wrap break-words text-gray-100 flex-1">
                {line || " "}
              </pre>
            </div>
          );
        })}
      </div>
    </div>
  );
}
