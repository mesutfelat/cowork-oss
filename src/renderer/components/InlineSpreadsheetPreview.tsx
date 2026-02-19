import { useEffect, useState } from "react";

type InlineSpreadsheetPreviewProps = {
  filePath: string;
  workspacePath: string;
  onOpenViewer?: (path: string) => void;
};

type ParsedSheet = {
  name: string;
  rows: string[][];
};

const MAX_PREVIEW_ROWS = 20;

function columnLetter(index: number): string {
  let letter = "";
  let n = index;
  while (n >= 0) {
    letter = String.fromCharCode(65 + (n % 26)) + letter;
    n = Math.floor(n / 26) - 1;
  }
  return letter;
}

function parseSheets(content: string): ParsedSheet[] {
  return content.split("\n\n").map((block) => {
    const lines = block.split("\n");
    let name = "Sheet";
    let dataLines = lines;
    if (lines[0]?.startsWith("## Sheet: ")) {
      name = lines[0].replace("## Sheet: ", "");
      dataLines = lines.slice(1);
    }
    const rows = dataLines.filter((l) => l.length > 0).map((line) => line.split("\t"));
    return { name, rows };
  });
}

export function InlineSpreadsheetPreview({
  filePath,
  workspacePath,
  onOpenViewer,
}: InlineSpreadsheetPreviewProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sheets, setSheets] = useState<ParsedSheet[]>([]);
  const [activeSheet, setActiveSheet] = useState(0);
  const [fileName, setFileName] = useState("");

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setLoading(true);
      setError(null);
      setSheets([]);
      setActiveSheet(0);

      try {
        const response = await window.electronAPI.readFileForViewer(filePath, workspacePath);
        if (cancelled) return;
        if (!response.success || !response.data) {
          setError(response.error || "Failed to load spreadsheet");
          return;
        }
        if (response.data.fileType !== "xlsx" || !response.data.content) {
          setError("File is not a spreadsheet or cannot be previewed.");
          return;
        }
        setFileName(response.data.fileName);
        setSheets(parseSheets(response.data.content));
      } catch (e: unknown) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load spreadsheet");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    if (filePath && workspacePath) {
      void run();
    } else {
      setLoading(false);
    }

    return () => {
      cancelled = true;
    };
  }, [filePath, workspacePath]);

  const handleOpenViewer = () => {
    if (onOpenViewer) {
      onOpenViewer(filePath);
    }
  };

  const handleDownload = async () => {
    try {
      await window.electronAPI.openFile(filePath, workspacePath);
    } catch (e) {
      console.error("Failed to open file:", e);
    }
  };

  if (loading) {
    return (
      <div className="inline-spreadsheet-preview">
        <div className="inline-spreadsheet-loading">Loading spreadsheet…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="inline-spreadsheet-preview">
        <div className="inline-spreadsheet-error">{error}</div>
      </div>
    );
  }

  const sheet = sheets[activeSheet];
  if (!sheet) return null;

  const maxCols = Math.max(...sheet.rows.map((r) => r.length), 0);
  const previewRows = sheet.rows.slice(0, MAX_PREVIEW_ROWS + 1); // +1 for header
  const isTruncated = sheet.rows.length > MAX_PREVIEW_ROWS + 1;

  return (
    <div className="inline-spreadsheet-preview">
      {/* Header bar */}
      <div className="inline-spreadsheet-header">
        <div className="inline-spreadsheet-header-left">
          <div className="inline-spreadsheet-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <rect
                x="3"
                y="3"
                width="18"
                height="18"
                rx="2"
                stroke="currentColor"
                strokeWidth="2"
              />
              <line x1="3" y1="9" x2="21" y2="9" stroke="currentColor" strokeWidth="2" />
              <line x1="3" y1="15" x2="21" y2="15" stroke="currentColor" strokeWidth="2" />
              <line x1="9" y1="3" x2="9" y2="21" stroke="currentColor" strokeWidth="2" />
            </svg>
          </div>
          <span className="inline-spreadsheet-filename">
            {fileName || filePath.split("/").pop()}
          </span>
        </div>
        <div className="inline-spreadsheet-header-actions">
          <button
            className="inline-spreadsheet-action-btn"
            onClick={handleDownload}
            title="Open in external app"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </button>
          {onOpenViewer && (
            <button
              className="inline-spreadsheet-action-btn"
              onClick={handleOpenViewer}
              title="Expand preview"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <polyline points="15 3 21 3 21 9" />
                <polyline points="9 21 3 21 3 15" />
                <line x1="21" y1="3" x2="14" y2="10" />
                <line x1="3" y1="21" x2="10" y2="14" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="inline-spreadsheet-table-wrapper">
        <table className="inline-spreadsheet-table">
          <thead>
            <tr>
              <th className="inline-spreadsheet-corner"></th>
              {Array.from({ length: maxCols }, (_, i) => (
                <th key={i} className="inline-spreadsheet-col-header">
                  {columnLetter(i)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {previewRows.map((row, ri) => (
              <tr key={ri} className={ri === 0 ? "inline-spreadsheet-header-row" : ""}>
                <td className="inline-spreadsheet-row-number">{ri + 1}</td>
                {Array.from({ length: maxCols }, (_, ci) => {
                  const CellTag = ri === 0 ? "th" : "td";
                  return (
                    <CellTag key={ci} className={ri === 0 ? "inline-spreadsheet-data-header" : ""}>
                      {row[ci] || ""}
                    </CellTag>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Truncation notice */}
      {isTruncated && (
        <div className="inline-spreadsheet-truncated">
          Showing {MAX_PREVIEW_ROWS} of {sheet.rows.length - 1} rows
        </div>
      )}

      {/* Sheet tabs */}
      {sheets.length > 1 && (
        <div className="inline-spreadsheet-tabs">
          {sheets.map((s, i) => (
            <button
              key={i}
              className={`inline-spreadsheet-tab ${i === activeSheet ? "active" : ""}`}
              onClick={() => setActiveSheet(i)}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
