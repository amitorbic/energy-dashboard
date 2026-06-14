import { useState, useRef, useEffect, Fragment } from "react";
import { useRouter } from "next/router";
import {
  Send,
  Loader2,
  Sparkles,
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Trash2,
} from "lucide-react";
import { getToken, getUser } from "../utils/auth";

// ── Types ─────────────────────────────────────────────────────────────────────

type Role = "user" | "assistant";
type ChatMessage = { role: Role; content: string };
type Segment =
  | { type: "text"; content: string }
  | { type: "table"; headers: string[]; rows: string[][] };

// ── Quick actions ─────────────────────────────────────────────────────────────

const QUICK_ACTIONS = [
  {
    category: "Contracts",
    items: [
      { label: "Expiring in 30 days", query: "Show me all customer contracts expiring in the next 30 days" },
      { label: "Expiring in 60 days", query: "Show me customer contracts expiring in the next 60 days" },
      { label: "Renewal pipeline", query: "Show me the full contract renewal pipeline bucketed by time window" },
      { label: "Already expired", query: "Show me all contracts that have already expired" },
    ],
  },
  {
    category: "Portfolio",
    items: [
      { label: "Monthly open position", query: "What is our current monthly open position?" },
      { label: "ERCOT shape forecast", query: "Get the ERCOT composite load forecast" },
      { label: "Position by zone", query: "Show the open position broken down by ERCOT zone" },
    ],
  },
  {
    category: "Collections",
    items: [
      { label: "Past due 30+ days", query: "Show all past-due accounts over 30 days" },
      { label: "Past due 60+ days", query: "Show all past-due accounts over 60 days" },
    ],
  },
  {
    category: "Pricing",
    items: [
      {
        label: "Commercial pricing",
        query: `Show commercial pricing for ${new Date().toISOString().slice(0, 7)} for 12, 24, and 36 month terms`,
      },
    ],
  },
  {
    category: "Commission",
    items: [
      { label: "Latest summary", query: "Show me the latest commission summary for all vendors" },
    ],
  },
];

// ── Markdown parsing ──────────────────────────────────────────────────────────

function parseCells(line: string): string[] {
  return line.split("|").map((c) => c.trim()).filter(Boolean);
}

function parseSegments(text: string): Segment[] {
  const lines = text.split("\n");
  const segments: Segment[] = [];
  const buf: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const next = lines[i + 1] ?? "";
    const isRow = line.trim().startsWith("|");
    const nextIsSep = /^\|[\s\-:|]+\|/.test(next.trim());

    if (isRow && nextIsSep) {
      if (buf.length) { segments.push({ type: "text", content: buf.join("\n") }); buf.length = 0; }
      const headers = parseCells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        rows.push(parseCells(lines[i]));
        i++;
      }
      segments.push({ type: "table", headers, rows });
    } else {
      buf.push(line);
      i++;
    }
  }
  if (buf.length) segments.push({ type: "text", content: buf.join("\n") });
  return segments;
}

// ── Sortable Table ────────────────────────────────────────────────────────────

function SortableTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  const [sortCol, setSortCol] = useState<number | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const sorted =
    sortCol === null
      ? rows
      : [...rows].sort((a, b) => {
          const av = a[sortCol] ?? "";
          const bv = b[sortCol] ?? "";
          const an = parseFloat(av.replace(/[,$%]/g, ""));
          const bn = parseFloat(bv.replace(/[,$%]/g, ""));
          if (!isNaN(an) && !isNaN(bn)) return sortDir === "asc" ? an - bn : bn - an;
          return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
        });

  const toggle = (col: number) => {
    if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortCol(col); setSortDir("asc"); }
  };

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-700 my-3 text-xs">
      <table className="w-full">
        <thead>
          <tr className="bg-slate-800/80">
            {headers.map((h, i) => (
              <th
                key={i}
                onClick={() => toggle(i)}
                className="px-3 py-2 text-left text-slate-300 font-semibold uppercase tracking-wide cursor-pointer select-none hover:text-white whitespace-nowrap"
              >
                {h}{" "}
                <span className="text-slate-500 font-normal">
                  {sortCol === i ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, ri) => (
            <tr key={ri} className="border-t border-slate-700/50 hover:bg-slate-700/30 transition-colors">
              {row.map((cell, ci) => (
                <td key={ci} className="px-3 py-2 text-slate-300 font-mono whitespace-nowrap">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="px-3 py-1.5 bg-slate-800/40 border-t border-slate-700/50 text-slate-500 text-xs">
        {sorted.length} row{sorted.length !== 1 ? "s" : ""} · click column header to sort
      </div>
    </div>
  );
}

// ── Text renderer ─────────────────────────────────────────────────────────────

function renderLine(line: string, key: number) {
  const parts = line.split(/(\*\*[^*]+\*\*)/g).map((p, j) =>
    p.startsWith("**") && p.endsWith("**")
      ? <strong key={j} className="text-white font-semibold">{p.slice(2, -2)}</strong>
      : <Fragment key={j}>{p}</Fragment>
  );

  if (/^#{1,3}\s/.test(line)) {
    return <p key={key} className="font-bold text-white text-sm mt-3 mb-1">{line.replace(/^#+\s/, "")}</p>;
  }
  if (/^[-*•]\s/.test(line.trim())) {
    return (
      <div key={key} className="flex gap-2 my-0.5 text-sm">
        <span className="text-blue-400 shrink-0 mt-0.5">•</span>
        <span>{parts}</span>
      </div>
    );
  }
  if (!line.trim()) return <div key={key} className="h-1.5" />;
  return <p key={key} className="my-0.5 text-sm">{parts}</p>;
}

function MessageContent({ content, role }: { content: string; role: Role }) {
  if (role === "user") {
    return <span className="text-sm whitespace-pre-wrap">{content}</span>;
  }
  const segments = parseSegments(content);
  return (
    <div className="text-slate-200 leading-relaxed">
      {segments.map((seg, i) =>
        seg.type === "table" ? (
          <SortableTable key={i} headers={seg.headers} rows={seg.rows} />
        ) : (
          <div key={i}>{seg.content.split("\n").map((l, j) => renderLine(l, j))}</div>
        )
      )}
    </div>
  );
}

// ── Sidebar category ──────────────────────────────────────────────────────────

function SidebarCategory({
  category,
  items,
  onSelect,
  disabled,
}: {
  category: string;
  items: { label: string; query: string }[];
  onSelect: (q: string) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="mb-1">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-1.5 text-xs font-bold text-slate-500 uppercase tracking-widest hover:text-slate-400 transition-colors"
      >
        {category}
        {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
      </button>
      {open && (
        <div className="space-y-0.5">
          {items.map((item) => (
            <button
              key={item.label}
              onClick={() => onSelect(item.query)}
              disabled={disabled}
              className="w-full text-left px-3 py-1.5 text-sm text-slate-400 rounded-lg hover:bg-slate-700/50 hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function AgentPage() {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<{ username: string } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const u = getUser();
    if (!u) { router.replace("/login"); return; }
    setUser(u);
  }, [router]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function send(text?: string) {
    const content = (text ?? input).trim();
    if (!content || loading) return;

    const updated: ChatMessage[] = [...messages, { role: "user", content }];
    setMessages(updated);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: updated, token: getToken() ?? "" }),
      });
      const data = await res.json();
      setMessages([
        ...updated,
        { role: "assistant", content: data.reply ?? data.error ?? "Something went wrong." },
      ]);
    } catch {
      setMessages([...updated, { role: "assistant", content: "Connection error. Please try again." }]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  }

  if (!user) return null;

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-white overflow-hidden">

      {/* Header */}
      <header className="shrink-0 flex items-center gap-3 px-5 py-3 border-b border-slate-800 bg-slate-900">
        <button
          onClick={() => router.back()}
          className="text-slate-500 hover:text-white transition-colors p-1 rounded"
        >
          <ArrowLeft size={17} />
        </button>
        <div className="flex items-center gap-2">
          <div className="bg-blue-600 rounded-full p-1.5">
            <Sparkles size={13} />
          </div>
          <span className="font-bold text-sm">Orbi</span>
          <span className="text-slate-500 text-xs">· ORBIC AI Agent</span>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-slate-500">{user.username}</span>
          {messages.length > 0 && (
            <button
              onClick={() => setMessages([])}
              className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors"
            >
              <Trash2 size={12} />
              Clear
            </button>
          )}
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">

        {/* Sidebar */}
        <aside className="w-52 shrink-0 flex flex-col border-r border-slate-800 bg-slate-900/60 overflow-y-auto">
          <div className="px-2 pt-4 pb-6">
            <p className="text-xs text-slate-600 font-semibold uppercase tracking-widest px-3 mb-3">
              Quick Actions
            </p>
            {QUICK_ACTIONS.map((group) => (
              <SidebarCategory
                key={group.category}
                category={group.category}
                items={group.items}
                onSelect={(q) => send(q)}
                disabled={loading}
              />
            ))}
          </div>
        </aside>

        {/* Chat area */}
        <main className="flex flex-col flex-1 min-w-0 overflow-hidden">

          {/* Message list */}
          <div className="flex-1 overflow-y-auto px-8 py-6 space-y-5">

            {/* Empty state */}
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full gap-5 select-none text-center">
                <div className="bg-blue-600/15 border border-blue-600/20 rounded-full p-6">
                  <Sparkles size={36} className="text-blue-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-white tracking-tight">Hi, I'm Orbi</p>
                  <p className="text-slate-400 text-sm mt-1.5 max-w-sm">
                    Ask me anything about customers, contracts, pricing, portfolio data, or past-due accounts.
                  </p>
                </div>
                <p className="text-xs text-slate-600">
                  Use the quick actions on the left or type your question below.
                </p>
              </div>
            )}

            {/* Messages */}
            {messages.map((m, i) => (
              <div key={i} className={`flex gap-3 ${m.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
                <div
                  className={`w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-xs font-bold ${
                    m.role === "user" ? "bg-slate-700 text-slate-300" : "bg-blue-600 text-white"
                  }`}
                >
                  {m.role === "user" ? user.username[0].toUpperCase() : "O"}
                </div>
                <div
                  className={`rounded-2xl px-4 py-3 ${
                    m.role === "user"
                      ? "bg-blue-600 text-white rounded-br-sm max-w-xl"
                      : "bg-slate-800/80 rounded-bl-sm flex-1 min-w-0"
                  }`}
                >
                  <MessageContent content={m.content} role={m.role} />
                </div>
              </div>
            ))}

            {/* Thinking indicator */}
            {loading && (
              <div className="flex gap-3">
                <div className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center bg-blue-600">
                  <Sparkles size={12} />
                </div>
                <div className="bg-slate-800/80 rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin text-blue-400" />
                  <span className="text-sm text-slate-400">Orbi is thinking…</span>
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input bar */}
          <div className="shrink-0 border-t border-slate-800 px-8 py-4 bg-slate-900/60">
            <div className="flex gap-3 items-end max-w-4xl">
              <textarea
                ref={inputRef}
                rows={2}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder="Ask Orbi anything… (Enter to send, Shift+Enter for new line)"
                className="flex-1 resize-none bg-slate-800 text-white text-sm px-4 py-3 rounded-xl border border-slate-700 focus:outline-none focus:border-blue-500 placeholder-slate-600 transition-colors"
              />
              <button
                onClick={() => send()}
                disabled={!input.trim() || loading}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:text-slate-600 text-white px-4 py-3 rounded-xl transition-colors shrink-0"
              >
                <Send size={16} />
              </button>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
