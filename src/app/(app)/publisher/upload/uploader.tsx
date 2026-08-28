"use client";

import { useCallback, useRef, useState } from "react";
import Papa from "papaparse";
import {
  Ban,
  CircleCheck,
  CloudUpload,
  Download,
  FileSpreadsheet,
  TriangleAlert,
  X,
} from "lucide-react";
import type { BatchIntegrityFlag, Vertical } from "@prisma/client";
import { cn } from "@/lib/utils";
import { count } from "@/lib/format";
import {
  BATCH_INTEGRITY_FLAG,
  REJECTION_REASON,
  humanize,
} from "@/lib/domain/labels";
import { VERTICAL_SPECS, csvTemplateHeaders } from "@/lib/domain/verticals";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, NativeSelect } from "@/components/ui/input";
import { JsonBlock } from "@/components/domain/json-block";

/**
 * High-volume CSV intake.
 *
 * Parsing happens in the browser with a streaming reader so a 50k-row file
 * never has to be uploaded before the publisher finds out the header row is
 * wrong. The pre-flight verdict shown here is advisory — the server re-runs
 * every heuristic on submit and its answer is the one that counts.
 */

const MAX_ROWS = 5_000;

interface Finding {
  flag: BatchIntegrityFlag;
  blocking: boolean;
  detail: Record<string, unknown>;
}

interface PreflightResponse {
  ok: boolean;
  rowCount: number;
  findings: Finding[];
  missingRequiredColumns: string[];
}

interface ProcessResponse {
  batchId: string;
  ok: boolean;
  status: string;
  rowCount: number;
  accepted: number;
  rejected: number;
  held: number;
  unattributable: number;
  reasonCodes: Record<string, number>;
  findings: Finding[];
}

type Phase = "idle" | "parsing" | "preflight" | "ready" | "uploading" | "done" | "error";

export function CsvUploader({
  verticals,
}: {
  verticals: Array<{ vertical: Vertical; sourceIds: string[] }>;
}) {
  const [vertical, setVertical] = useState<Vertical>(
    verticals[0]?.vertical ?? "AUTO_INSURANCE",
  );
  const [phase, setPhase] = useState<Phase>("idle");
  const [dragging, setDragging] = useState(false);
  const [filename, setFilename] = useState<string | null>(null);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [parseProgress, setParseProgress] = useState(0);
  const [preflight, setPreflight] = useState<PreflightResponse | null>(null);
  const [result, setResult] = useState<ProcessResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setPhase("idle");
    setFilename(null);
    setRows([]);
    setHeaders([]);
    setPreflight(null);
    setResult(null);
    setError(null);
    setParseProgress(0);
    if (inputRef.current) inputRef.current.value = "";
  }, []);

  const handleFile = useCallback(
    (file: File) => {
      reset();
      setFilename(file.name);
      setPhase("parsing");

      const collected: Record<string, unknown>[] = [];
      let capturedHeaders: string[] = [];
      let truncated = false;

      Papa.parse<Record<string, unknown>>(file, {
        header: true,
        skipEmptyLines: "greedy",
        // Streaming keeps peak memory bounded on very large files.
        chunk: (results) => {
          if (capturedHeaders.length === 0 && results.meta.fields) {
            capturedHeaders = results.meta.fields;
          }
          for (const row of results.data) {
            if (collected.length >= MAX_ROWS) {
              truncated = true;
              break;
            }
            collected.push(row);
          }
          setParseProgress(collected.length);
        },
        complete: async () => {
          setRows(collected);
          setHeaders(capturedHeaders);

          if (collected.length === 0) {
            setPhase("error");
            setError("That file has a header row but no data rows.");
            return;
          }
          if (truncated) {
            setError(
              `This upload is capped at ${count(MAX_ROWS)} rows; only the first ${count(MAX_ROWS)} will be submitted. Split the file to send the rest.`,
            );
          }

          setPhase("preflight");
          try {
            const res = await fetch("/api/publisher/batches", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                filename: file.name,
                vertical,
                headers: capturedHeaders,
                rows: collected,
                dryRun: true,
              }),
            });
            const body = (await res.json()) as PreflightResponse;
            setPreflight(body);
            setPhase("ready");
          } catch {
            setPhase("error");
            setError("Pre-flight check could not reach the server.");
          }
        },
        error: () => {
          setPhase("error");
          setError("That file could not be parsed as CSV.");
        },
      });
    },
    [reset, vertical],
  );

  async function submit() {
    setPhase("uploading");
    setError(null);
    try {
      const res = await fetch("/api/publisher/batches", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ filename, vertical, headers, rows, dryRun: false }),
      });
      const body = (await res.json()) as ProcessResponse & { error?: string };

      if (body.error) {
        setPhase("error");
        setError(
          body.error === "PUBLISHER_NOT_ACTIVE"
            ? "Your account is not ACTIVE, so batches cannot be processed."
            : "The batch was refused.",
        );
        return;
      }

      setResult(body);
      setPhase("done");
    } catch {
      setPhase("error");
      setError("Upload failed.");
    }
  }

  function downloadTemplate() {
    const headerRow = csvTemplateHeaders(vertical).join(",");
    const blob = new Blob([`${headerRow}\r\n`], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `leados-template-${VERTICAL_SPECS[vertical].code.toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const blocking = preflight?.findings.filter((f) => f.blocking) ?? [];
  const advisory = preflight?.findings.filter((f) => !f.blocking) ?? [];

  return (
    <div className="space-y-4">
      {/* Vertical selector + template */}
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Vertical" className="w-56">
          <NativeSelect
            value={vertical}
            onChange={(e) => {
              setVertical(e.target.value as Vertical);
              reset();
            }}
          >
            {verticals.map((v) => (
              <option key={v.vertical} value={v.vertical}>
                {VERTICAL_SPECS[v.vertical].label}
              </option>
            ))}
          </NativeSelect>
        </Field>

        <Button variant="secondary" size="md" onClick={downloadTemplate}>
          <Download className="size-3.5" />
          Download template
        </Button>

        <p className="ml-auto max-w-sm text-[12px] leading-relaxed text-muted">
          Every row must carry its own <code className="font-mono">source_id</code>.
          A file with no certificate column is rejected in full — without one, no
          row in it can evidence consent.
        </p>
      </div>

      {/* Dropzone */}
      {phase === "idle" || phase === "error" ? (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const file = e.dataTransfer.files?.[0];
            if (file) handleFile(file);
          }}
          className={cn(
            "flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-14 transition-colors",
            dragging
              ? "border-accent bg-accent-soft"
              : "border-line bg-sunken hover:border-line-strong",
          )}
        >
          <CloudUpload
            className={cn("size-7", dragging ? "text-accent" : "text-faint")}
          />
          <p className="text-[14px] font-medium text-ink">
            Drop a CSV here, or choose a file
          </p>
          <p className="max-w-md text-center text-[12px] leading-relaxed text-muted">
            Parsed in your browser first — a bad header row is caught before
            anything is uploaded. Up to {count(MAX_ROWS)} rows per batch.
          </p>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
          <Button
            variant="secondary"
            size="md"
            className="mt-1"
            onClick={() => inputRef.current?.click()}
          >
            <FileSpreadsheet className="size-3.5" />
            Choose file
          </Button>

          {error && (
            <p className="mt-2 flex items-center gap-1.5 text-[13px] text-danger">
              <TriangleAlert className="size-3.5" />
              {error}
            </p>
          )}
        </div>
      ) : (
        <div className="panel">
          {/* File header */}
          <div className="flex items-center gap-3 border-b border-line px-4 py-3">
            <FileSpreadsheet className="size-4 shrink-0 text-faint" />
            <div className="min-w-0 flex-1">
              <div className="truncate font-mono text-[13px] text-ink">{filename}</div>
              <div className="text-[12px] text-muted">
                {phase === "parsing"
                  ? `Parsing… ${count(parseProgress)} rows`
                  : `${count(rows.length)} rows · ${headers.length} columns · ${VERTICAL_SPECS[vertical].label}`}
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={reset} aria-label="Discard">
              <X className="size-4" />
            </Button>
          </div>

          {/* Progress states */}
          {(phase === "parsing" || phase === "preflight" || phase === "uploading") && (
            <div className="px-4 py-8 text-center">
              <div className="mx-auto mb-3 h-1 w-40 overflow-hidden rounded-full bg-line">
                <div className="shimmer h-full w-full bg-accent/40" />
              </div>
              <p className="text-[13px] text-muted">
                {phase === "parsing" && `Reading file… ${count(parseProgress)} rows`}
                {phase === "preflight" && "Running batch integrity checks…"}
                {phase === "uploading" &&
                  `Processing ${count(rows.length)} rows through the pipeline…`}
              </p>
              {phase === "uploading" && (
                <p className="mt-1 text-[12px] text-faint">
                  Each row walks the full six-step waterfall. This is not a bulk insert.
                </p>
              )}
            </div>
          )}

          {/* Pre-flight verdict */}
          {phase === "ready" && preflight && (
            <div className="space-y-3 px-4 py-4">
              {blocking.length === 0 && advisory.length === 0 && (
                <div className="flex items-start gap-2 rounded-md border border-success-border bg-success-soft px-3 py-2.5">
                  <CircleCheck className="mt-px size-4 shrink-0 text-success" />
                  <div>
                    <p className="text-[14px] font-medium text-success">
                      Batch integrity checks passed
                    </p>
                    <p className="mt-0.5 text-[13px] leading-relaxed text-success/85">
                      No sequential phone blocks, IP clustering or timestamp
                      uniformity detected. Rows will still be validated
                      individually by the pipeline.
                    </p>
                  </div>
                </div>
              )}

              {blocking.map((f) => (
                <FindingCard key={f.flag} finding={f} />
              ))}
              {advisory.map((f) => (
                <FindingCard key={f.flag} finding={f} />
              ))}

              {error && (
                <p className="flex items-center gap-1.5 rounded-md border border-warning-border bg-warning-soft px-3 py-2 text-[13px] text-warning">
                  <TriangleAlert className="size-3.5 shrink-0" />
                  {error}
                </p>
              )}

              <div className="flex items-center justify-end gap-2 border-t border-line pt-3">
                <Button variant="ghost" size="md" onClick={reset}>
                  Discard
                </Button>
                <Button
                  variant="primary"
                  size="md"
                  disabled={blocking.length > 0}
                  onClick={submit}
                >
                  <CloudUpload className="size-3.5" />
                  {blocking.length > 0
                    ? "Blocked by integrity checks"
                    : `Submit ${count(rows.length)} rows`}
                </Button>
              </div>
            </div>
          )}

          {/* Outcome */}
          {phase === "done" && result && (
            <div className="space-y-3 px-4 py-4">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Outcome label="Accepted" value={result.accepted} tone="success" />
                <Outcome label="Rejected" value={result.rejected} tone="danger" />
                <Outcome label="Held" value={result.held} tone="warning" />
                <Outcome
                  label="Unattributable"
                  value={result.unattributable}
                  tone="neutral"
                />
              </div>

              {Object.keys(result.reasonCodes).length > 0 && (
                <div>
                  <h4 className="mb-1.5 text-[11px] font-semibold tracking-[0.07em] text-faint uppercase">
                    Rejection reasons
                  </h4>
                  <ul className="divide-y divide-[var(--border)] rounded-md border border-line">
                    {Object.entries(result.reasonCodes)
                      .sort((a, b) => b[1] - a[1])
                      .map(([code, n]) => {
                        const meta =
                          REJECTION_REASON[code as keyof typeof REJECTION_REASON];
                        return (
                          <li
                            key={code}
                            className="flex items-center justify-between gap-3 px-3 py-1.5"
                          >
                            <span className="flex min-w-0 items-center gap-2">
                              <Badge tone={meta?.tone ?? "neutral"}>
                                {meta?.label ?? humanize(code)}
                              </Badge>
                              <code className="truncate font-mono text-[11px] text-faint">
                                {code}
                              </code>
                            </span>
                            <span className="font-mono text-[13px] text-ink tabular">
                              {n}
                            </span>
                          </li>
                        );
                      })}
                  </ul>
                </div>
              )}

              <div className="flex items-center justify-between border-t border-line pt-3">
                <span className="font-mono text-[12px] text-faint">
                  batch {result.batchId}
                </span>
                <Button variant="secondary" size="md" onClick={reset}>
                  Upload another file
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FindingCard({ finding }: { finding: Finding }) {
  const meta = BATCH_INTEGRITY_FLAG[finding.flag];
  return (
    <div
      className={cn(
        "rounded-md border px-3 py-2.5",
        finding.blocking
          ? "border-danger-border bg-danger-soft"
          : "border-warning-border bg-warning-soft",
      )}
    >
      <div className="flex items-start gap-2">
        {finding.blocking ? (
          <Ban className="mt-px size-4 shrink-0 text-danger" />
        ) : (
          <TriangleAlert className="mt-px size-4 shrink-0 text-warning" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "text-[14px] font-medium",
                finding.blocking ? "text-danger" : "text-warning",
              )}
            >
              {meta.label}
            </span>
            <Badge tone={finding.blocking ? "danger" : "warning"}>
              {finding.blocking ? "Blocking" : "Advisory"}
            </Badge>
          </div>
          <p
            className={cn(
              "mt-0.5 text-[13px] leading-relaxed",
              finding.blocking ? "text-danger/85" : "text-warning/85",
            )}
          >
            {meta.detail}
          </p>
          <details className="mt-2">
            <summary className="cursor-pointer text-[12px] text-muted select-none">
              Evidence
            </summary>
            <div className="mt-1.5">
              <JsonBlock value={finding.detail} maxHeight="12rem" />
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}

function Outcome({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "success" | "danger" | "warning" | "neutral";
}) {
  return (
    <div
      className={cn(
        "rounded-md border px-3 py-2",
        tone === "success" && "border-success-border bg-success-soft",
        tone === "danger" && "border-danger-border bg-danger-soft",
        tone === "warning" && "border-warning-border bg-warning-soft",
        tone === "neutral" && "border-line bg-sunken",
      )}
    >
      <div className="text-[11px] font-semibold tracking-[0.07em] text-faint uppercase">
        {label}
      </div>
      <div
        className={cn(
          "mt-0.5 font-mono text-lg leading-none font-semibold tabular",
          tone === "success" && "text-success",
          tone === "danger" && "text-danger",
          tone === "warning" && "text-warning",
          tone === "neutral" && "text-ink",
        )}
      >
        {count(value)}
      </div>
    </div>
  );
}
