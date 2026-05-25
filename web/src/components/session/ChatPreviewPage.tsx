import { useEffect, useMemo, useRef, useState } from "react";
import { api, type RouterOutputs } from "@/src/utils/api";
import { ChatWidgetAwareContent } from "./ChatWidgetAwareContent";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";

interface OutputEvent {
  type: "content" | "tool_call";
  content?: string;
  tool_name?: string;
  tool_args?: unknown;
  /** Alternate keys used by some instrumentations */
  arguments?: unknown;
  args?: unknown;
  params?: unknown;
  input?: unknown;
  function?: { arguments?: unknown };
  result?: string;
  success?: boolean;
  elapsed_ms?: number;
}

/** Popipo trace output uses tool_args; OpenAI-style payloads may use arguments/args. */
function extractToolArgs(event: OutputEvent): unknown {
  if (event.tool_args != null) return event.tool_args;
  if (event.arguments != null) return event.arguments;
  if (event.args != null) return event.args;
  if (event.params != null) return event.params;
  if (event.input != null) return event.input;
  if (event.function?.arguments != null) return event.function.arguments;
  return undefined;
}

function parseIfString(val: unknown): unknown {
  if (typeof val === "string") {
    try {
      return JSON.parse(val);
    } catch {
      return val;
    }
  }
  return val;
}

function extractInputText(val: unknown): string {
  if (!val) return "";
  if (typeof val === "string") {
    try {
      return extractInputText(JSON.parse(val));
    } catch {
      return val;
    }
  }
  if (typeof val === "object" && val !== null) {
    const obj = val as Record<string, unknown>;
    if (typeof obj.message === "string") return obj.message;
    if (typeof obj.content === "string") return obj.content;
    if (typeof obj.text === "string") return obj.text;
    if (Array.isArray(val)) {
      const last = val
        .filter(
          (m: Record<string, unknown>) =>
            m.role === "user" || m.role === "assistant",
        )
        .pop() as Record<string, unknown> | undefined;
      if (last && typeof last.content === "string") return last.content;
      return val
        .map((v) => extractInputText(v))
        .filter(Boolean)
        .join("\n");
    }
    return JSON.stringify(val, null, 2);
  }
  return String(val);
}

function extractOutputEvents(val: unknown): OutputEvent[] | null {
  val = parseIfString(val);
  if (!val || typeof val !== "object") return null;
  const obj = val as Record<string, unknown>;
  if (Array.isArray(obj.events)) {
    return obj.events as OutputEvent[];
  }
  return null;
}

function extractOutputFallback(val: unknown): string {
  val = parseIfString(val);
  if (!val) return "";
  if (typeof val === "object" && val !== null) {
    const obj = val as Record<string, unknown>;
    if (typeof obj.content === "string") return obj.content;
    if (obj.events) return "";
  }
  return extractInputText(val);
}

function formatToolArgs(args: unknown): string {
  if (!args) return "";
  if (typeof args === "string") return args;
  try {
    return JSON.stringify(args, null, 2);
  } catch {
    return String(args);
  }
}

function ToolCallCard({ event }: { event: OutputEvent }) {
  const [argsOpen, setArgsOpen] = useState(false);
  const [resultOpen, setResultOpen] = useState(false);
  const isFailed = event.success === false;

  return (
    <div
      className={`my-2 max-w-[80%] self-start rounded-lg border bg-zinc-950 px-3.5 py-2.5 text-[13px] ${
        isFailed
          ? "border-l-[3px] border-l-red-500 border-zinc-800"
          : "border-l-[3px] border-l-emerald-500 border-zinc-800"
      }`}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className={isFailed ? "text-red-400" : "text-emerald-400"}>
          {isFailed ? "✗" : "⚡"}
        </span>
        <span className="font-semibold text-zinc-200">
          {event.tool_name || "unknown"}
        </span>
        <span className="ml-auto text-[11px] text-zinc-500">
          {isFailed ? "failed" : "ok"}
          {event.elapsed_ms != null ? ` · ${event.elapsed_ms}ms` : ""}
        </span>
      </div>

      {extractToolArgs(event) != null && (
        <div className="mt-1.5">
          <button
            className="flex items-center gap-1 text-[12px] text-zinc-500 hover:text-zinc-300 cursor-pointer select-none"
            onClick={() => setArgsOpen(!argsOpen)}
          >
            {argsOpen ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            Arguments
          </button>
          {argsOpen && (
            <pre className="mt-1 rounded-md bg-black/30 p-2 text-[12px] leading-relaxed text-zinc-500 overflow-x-auto max-h-[300px] overflow-y-auto whitespace-pre-wrap break-all">
              {formatToolArgs(extractToolArgs(event))}
            </pre>
          )}
        </div>
      )}

      {Boolean(event.result) && (
        <div className="mt-1.5">
          <button
            className="flex items-center gap-1 text-[12px] text-zinc-500 hover:text-zinc-300 cursor-pointer select-none"
            onClick={() => setResultOpen(!resultOpen)}
          >
            {resultOpen ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            Result
          </button>
          {resultOpen && (
            <pre className="mt-1 rounded-md bg-black/30 p-2 text-[12px] leading-relaxed text-zinc-500 overflow-x-auto max-h-[300px] overflow-y-auto whitespace-pre-wrap break-all">
              {event.result}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

type SessionTrace =
  RouterOutputs["sessions"]["byIdWithScores"]["traces"][number];

function TraceMessage({
  trace,
  projectId,
}: {
  trace: SessionTrace;
  projectId: string;
}) {
  const fullTrace = api.traces.byId.useQuery(
    {
      traceId: trace.id,
      projectId,
      timestamp: new Date(trace.timestamp),
    },
    {
      trpc: { context: { skipBatch: true } },
      refetchOnMount: false,
    },
  );

  if (!fullTrace.data) {
    return (
      <div className="flex items-center gap-2 py-4 text-zinc-500 text-sm">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading trace…
      </div>
    );
  }

  const ts = new Date(trace.timestamp);
  const timeStr = ts.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const input = extractInputText(fullTrace.data.input);
  const events = extractOutputEvents(fullTrace.data.output);
  const fallback = !events ? extractOutputFallback(fullTrace.data.output) : "";

  return (
    <>
      {input && (
        <div className="flex flex-col gap-1.5 mb-5">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 text-right px-1">
            User
          </div>
          <div className="self-end max-w-[75%] rounded-xl rounded-br-sm bg-blue-600 px-4 py-3 text-[14px] leading-relaxed text-white break-words">
            {input}
          </div>
          <div className="text-[11px] text-zinc-500 text-right px-1">
            {timeStr}
          </div>
        </div>
      )}

      {events && events.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 px-1">
            Assistant
          </div>
          {events.map((evt, i) =>
            evt.type === "content" && evt.content ? (
              <div
                key={`e-${i}`}
                className="self-start max-w-[75%] rounded-xl rounded-bl-sm border border-zinc-800 bg-zinc-900 px-4 py-3 text-[14px] leading-relaxed text-zinc-100 break-words"
              >
                <ChatWidgetAwareContent content={evt.content} />
              </div>
            ) : evt.type === "tool_call" ? (
              <ToolCallCard key={`e-${i}`} event={evt} />
            ) : null,
          )}
          <div className="text-[11px] text-zinc-500 px-1">{timeStr}</div>
        </div>
      )}

      {!events && fallback && (
        <div className="flex flex-col gap-1.5">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 px-1">
            Assistant
          </div>
          <div className="self-start max-w-[75%] rounded-xl rounded-bl-sm border border-zinc-800 bg-zinc-900 px-4 py-3 text-[14px] leading-relaxed text-zinc-100 break-words">
            <ChatWidgetAwareContent content={fallback} />
          </div>
          <div className="text-[11px] text-zinc-500 px-1">{timeStr}</div>
        </div>
      )}
    </>
  );
}

interface ChatPreviewPageProps {
  sessionId: string;
  projectId: string;
}

export function ChatPreviewPage({
  sessionId,
  projectId,
}: ChatPreviewPageProps) {
  const chatRef = useRef<HTMLDivElement>(null);

  const session = api.sessions.byIdWithScores.useQuery(
    { sessionId, projectId },
    {
      retry(failureCount, error) {
        if (
          error.data?.code === "UNAUTHORIZED" ||
          error.data?.code === "NOT_FOUND"
        )
          return false;
        return failureCount < 3;
      },
    },
  );

  useEffect(() => {
    if (session.data && chatRef.current) {
      setTimeout(() => {
        chatRef.current?.scrollTo({
          top: chatRef.current.scrollHeight,
          behavior: "smooth",
        });
      }, 500);
    }
  }, [session.data]);

  const traces = useMemo(
    () => session.data?.traces ?? [],
    [session.data?.traces],
  );

  if (session.isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[hsl(240,5.6%,7.1%)]">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
      </div>
    );
  }

  if (session.error || !session.data) {
    return (
      <div className="flex h-screen items-center justify-center bg-[hsl(240,5.6%,7.1%)] text-zinc-400">
        Failed to load session data.
      </div>
    );
  }

  const { users } = session.data;
  const metaParts: string[] = [];
  if (sessionId) metaParts.push("Session: " + sessionId.slice(0, 12) + "…");
  if (users?.length) metaParts.push("Users: " + users.join(", "));
  metaParts.push(traces.length + " turns");

  let lastDate = "";

  return (
    <div className="flex h-screen flex-col bg-[hsl(240,5.6%,7.1%)] text-zinc-100">
      <header className="flex items-center justify-between border-b border-zinc-800 px-6 py-4 shrink-0">
        <div>
          <h1 className="text-[15px] font-semibold">Chat Preview</h1>
          <div className="text-[12px] text-zinc-500">
            {metaParts.join(" · ")}
          </div>
        </div>
        <button
          className="text-[13px] font-medium text-blue-400 hover:underline cursor-pointer"
          onClick={() => window.close()}
        >
          ✕ Close
        </button>
      </header>

      <div
        ref={chatRef}
        className="flex-1 overflow-y-auto px-6 py-6 flex flex-col gap-5 scroll-smooth"
        style={{
          scrollbarWidth: "thin",
          scrollbarColor: "hsl(240 4% 22%) transparent",
        }}
      >
        {traces.map((trace) => {
          const ts = new Date(trace.timestamp);
          const dateStr = ts.toLocaleDateString("zh-CN", {
            year: "numeric",
            month: "long",
            day: "numeric",
          });

          const showDateDivider = dateStr !== lastDate;
          if (showDateDivider) lastDate = dateStr;

          return (
            <div key={trace.id}>
              {showDateDivider && (
                <div className="flex items-center gap-3 py-2 text-[11px] text-zinc-500">
                  <div className="flex-1 h-px bg-zinc-800" />
                  {dateStr}
                  <div className="flex-1 h-px bg-zinc-800" />
                </div>
              )}
              <TraceMessage trace={trace} projectId={projectId} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
