import Editor from "@monaco-editor/react";
import { useEffect, useMemo, useRef } from "react";
import { useEditorStore } from "../../store/editorStore";

function getLanguageFromFilename(name: string) {
  const lower = name.toLowerCase();
  if (lower.endsWith(".ts") || lower.endsWith(".tsx")) return "typescript";
  if (lower.endsWith(".js") || lower.endsWith(".jsx")) return "javascript";
  if (lower.endsWith(".json")) return "json";
  if (lower.endsWith(".html")) return "html";
  if (lower.endsWith(".css")) return "css";
  if (lower.endsWith(".md")) return "markdown";
  return "plaintext";
}

type MonacoEditorLike = {
  revealLineInCenter: (lineNumber: number) => void;
  setPosition: (pos: { lineNumber: number; column: number }) => void;
  getModel: () => {
    getLineMaxColumn: (lineNumber: number) => number;
    getLineCount: () => number;
  } | null;
  deltaDecorations: (
    oldDecorations: string[],
    newDecorations: Array<{
      range: {
        startLineNumber: number;
        startColumn: number;
        endLineNumber: number;
        endColumn: number;
      };
      options: { isWholeLine?: boolean; className?: string };
    }>,
  ) => string[];
  onDidChangeCursorPosition: (cb: () => void) => void;
  onDidChangeCursorSelection: (
    cb: (event: {
      selection: {
        startLineNumber: number;
        startColumn: number;
        endLineNumber: number;
        endColumn: number;
      };
    }) => void,
  ) => void;
  getPosition: () => { lineNumber: number; column: number } | null;
};

const CodeEditor = () => {
  const {
    openFiles,
    activeFileId,
    updateFileContent,
    setCursor,
    pendingReveal,
    clearPendingReveal,
    selectionRange,
    setSelectionRange,
    setCommunicationPanelOpen,
    currentProject,
    communicationThreads,
  } = useEditorStore();

  const editorRef = useRef<MonacoEditorLike | null>(null);
  const revealDecorationIdsRef = useRef<string[]>([]);
  const threadDecorationIdsRef = useRef<string[]>([]);
  const saveTimerRef = useRef<number | null>(null);

  const activeFile = useMemo(() => {
    return openFiles.find((f) => f.id === activeFileId) || null;
  }, [openFiles, activeFileId]);

  const language = useMemo(() => {
    return activeFile ? getLanguageFromFilename(activeFile.name) : "plaintext";
  }, [activeFile]);

  useEffect(() => {
    const styleId = "line-ref-highlight-style";
    if (document.getElementById(styleId)) return;
    const style = document.createElement("style");
    style.id = styleId;
    style.innerHTML = `
      .line-ref-highlight {
        background: rgba(0, 122, 204, 0.22);
      }
      .comm-thread-highlight {
        background: rgba(75, 138, 244, 0.16);
      }
      .comm-thread-highlight-resolved {
        background: rgba(110, 116, 126, 0.16);
      }
    `;
    document.head.appendChild(style);
  }, []);

  useEffect(() => {
    if (!editorRef.current) return;
    const editor = editorRef.current;
    const model = editor.getModel();
    if (!model) return;

    const lineCount = Math.max(1, model.getLineCount());
    const decorations = communicationThreads
      .map((thread) => {
        const start = Math.max(1, Math.min(lineCount, thread.startLine));
        const end = Math.max(start, Math.min(lineCount, thread.endLine));
        return {
          range: {
            startLineNumber: start,
            startColumn: 1,
            endLineNumber: end,
            endColumn: model.getLineMaxColumn(end),
          },
          options: {
            isWholeLine: true,
            className: thread.resolved
              ? "comm-thread-highlight-resolved"
              : "comm-thread-highlight",
          },
        };
      })
      .filter(Boolean);

    threadDecorationIdsRef.current = editor.deltaDecorations(
      threadDecorationIdsRef.current,
      decorations,
    );
  }, [communicationThreads, activeFileId]);

  useEffect(() => {
    if (!pendingReveal) return;
    if (!activeFileId) return;
    if (pendingReveal.fileId !== activeFileId) return;

    const editor = editorRef.current;
    if (!editor) return;

    const model = editor.getModel();
    const maxCol = model ? model.getLineMaxColumn(pendingReveal.line) : 1;

    editor.revealLineInCenter(pendingReveal.line);
    editor.setPosition({
      lineNumber: pendingReveal.line,
      column: Math.min(1, maxCol),
    });

    revealDecorationIdsRef.current = editor.deltaDecorations(
      revealDecorationIdsRef.current,
      [
        {
          range: {
            startLineNumber: pendingReveal.line,
            startColumn: 1,
            endLineNumber: pendingReveal.line,
            endColumn: maxCol,
          },
          options: { isWholeLine: true, className: "line-ref-highlight" },
        },
      ],
    );

    window.setTimeout(() => {
      if (!editorRef.current) return;
      revealDecorationIdsRef.current = editorRef.current.deltaDecorations(
        revealDecorationIdsRef.current,
        [],
      );
    }, 2000);

    clearPendingReveal();
  }, [pendingReveal, activeFileId, clearPendingReveal]);

  useEffect(() => {
    setSelectionRange(null);
  }, [activeFileId, setSelectionRange]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
      }
      if (editorRef.current) {
        revealDecorationIdsRef.current = editorRef.current.deltaDecorations(
          revealDecorationIdsRef.current,
          [],
        );
        threadDecorationIdsRef.current = editorRef.current.deltaDecorations(
          threadDecorationIdsRef.current,
          [],
        );
      }
    };
  }, [setSelectionRange]);

  if (!activeFile) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400">
        Open a file from Explorer to start editing
      </div>
    );
  }

  return (
    <div className="h-full relative">
      {currentProject?.public && selectionRange ? (
        <button
          className="absolute top-2 right-3 z-10 px-3 py-1.5 text-xs rounded bg-[#007acc] hover:opacity-90"
          onClick={() => setCommunicationPanelOpen(true)}
          title={`Tag lines ${selectionRange.startLine}-${selectionRange.endLine}`}
        >
          Tag this ({selectionRange.startLine}-{selectionRange.endLine})
        </button>
      ) : null}

      <Editor
        height="100%"
        theme="vs-dark"
        language={language}
        value={activeFile.content || ""}
        onChange={(value) => {
          const nextContent = value || "";
          updateFileContent(activeFile.id, nextContent);

          const relativePath = activeFile.path || "";
          if (!relativePath || !window.api?.editFile) return;

          if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
          saveTimerRef.current = window.setTimeout(async () => {
            try {
              await window.api.editFile?.({
                relativePath,
                content: nextContent,
              });
            } catch (error) {
              console.error("editFile failed:", error);
            }
          }, 300);
        }}
        onMount={(editor) => {
          editorRef.current = editor as unknown as MonacoEditorLike;

          const pos = editorRef.current.getPosition();
          if (pos) setCursor({ line: pos.lineNumber, col: pos.column });

          editorRef.current.onDidChangeCursorPosition(() => {
            const p = editorRef.current?.getPosition();
            if (p) setCursor({ line: p.lineNumber, col: p.column });
          });

          editorRef.current.onDidChangeCursorSelection((event) => {
            const selection = event?.selection;
            if (!selection) {
              setSelectionRange(null);
              return;
            }

            const isEmpty =
              selection.startLineNumber === selection.endLineNumber &&
              selection.startColumn === selection.endColumn;
            if (isEmpty) {
              setSelectionRange(null);
              return;
            }

            setSelectionRange({
              startLine: Math.min(
                selection.startLineNumber,
                selection.endLineNumber,
              ),
              endLine: Math.max(
                selection.startLineNumber,
                selection.endLineNumber,
              ),
            });
          });
        }}
        options={{
          fontSize: 14,
          minimap: { enabled: false },
          automaticLayout: true,
          wordWrap: "on",
          scrollBeyondLastLine: false,
        }}
      />
    </div>
  );
};

export default CodeEditor;
