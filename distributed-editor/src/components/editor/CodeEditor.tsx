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
  getModel: () => { getLineMaxColumn: (lineNumber: number) => number } | null;
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
  } = useEditorStore();

  const editorRef = useRef<MonacoEditorLike | null>(null);
  const decorationIdsRef = useRef<string[]>([]);
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
    `;
    document.head.appendChild(style);
  }, []);

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

    decorationIdsRef.current = editor.deltaDecorations(decorationIdsRef.current, [
      {
        range: {
          startLineNumber: pendingReveal.line,
          startColumn: 1,
          endLineNumber: pendingReveal.line,
          endColumn: maxCol,
        },
        options: { isWholeLine: true, className: "line-ref-highlight" },
      },
    ]);

    window.setTimeout(() => {
      if (!editorRef.current) return;
      decorationIdsRef.current = editorRef.current.deltaDecorations(
        decorationIdsRef.current,
        [],
      );
    }, 2000);

    clearPendingReveal();
  }, [pendingReveal, activeFileId, clearPendingReveal]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
      }
    };
  }, []);

  if (!activeFile) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400">
        Open a file from Explorer to start editing
      </div>
    );
  }

  return (
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
      }}
      options={{
        fontSize: 14,
        minimap: { enabled: false },
        automaticLayout: true,
        wordWrap: "on",
        scrollBeyondLastLine: false,
      }}
    />
  );
};

export default CodeEditor;
