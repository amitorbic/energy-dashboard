import { useState, useRef, useEffect } from "react";
import { MessageCircle, X, Send, Loader2, Sparkles } from "lucide-react";

type Message = { role: "user" | "assistant"; content: string };

const WELCOME = "Hi, I'm Orbi! I can look up customers, check pricing, search brokers, review commissions, and check payment balances. How can I help you today?";

function getToken(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("ap_token") ?? "";
}

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;

    const updated: Message[] = [...messages, { role: "user", content: text }];
    setMessages(updated);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: updated, token: getToken() }),
      });

      const data = await res.json();
      setMessages([
        ...updated,
        { role: "assistant", content: data.reply ?? data.error ?? "Something went wrong." },
      ]);
    } catch {
      setMessages([
        ...updated,
        { role: "assistant", content: "Connection error. Please try again." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  function handleOpen() {
    setOpen((v) => !v);
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      {open && (
        <div className="w-80 h-[500px] bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden">

          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-4 py-3 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <div className="bg-blue-500 rounded-full p-1">
                <Sparkles size={14} />
              </div>
              <div>
                <p className="font-semibold text-sm leading-tight">Orbi</p>
                <p className="text-xs text-blue-200 leading-tight">ORBIC AI Assistant</p>
              </div>
            </div>
            <button
              onClick={handleOpen}
              className="hover:bg-blue-600 rounded-full p-1 transition-colors"
            >
              <X size={16} />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">

            {/* Static welcome bubble */}
            <div className="flex justify-start">
              <div className="max-w-[85%] text-sm px-3 py-2 rounded-2xl rounded-bl-sm bg-gray-100 text-gray-800 leading-relaxed">
                {WELCOME}
              </div>
            </div>

            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] text-sm px-3 py-2 rounded-2xl leading-relaxed whitespace-pre-wrap ${
                    m.role === "user"
                      ? "bg-blue-600 text-white rounded-br-sm"
                      : "bg-gray-100 text-gray-800 rounded-bl-sm"
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="bg-gray-100 rounded-2xl rounded-bl-sm px-3 py-2 flex items-center gap-1.5">
                  <Loader2 size={14} className="animate-spin text-gray-400" />
                  <span className="text-xs text-gray-400">Orbi is thinking…</span>
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="border-t border-gray-100 px-3 py-2 flex gap-2 shrink-0">
            <textarea
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Ask Orbi anything…"
              className="flex-1 resize-none text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-blue-400 bg-gray-50"
            />
            <button
              onClick={send}
              disabled={!input.trim() || loading}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white rounded-xl px-3 py-2 transition-colors"
            >
              <Send size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Toggle button */}
      <button
        onClick={handleOpen}
        className="bg-blue-600 hover:bg-blue-700 text-white w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-colors"
        title="Chat with Orbi"
      >
        {open ? <X size={22} /> : <MessageCircle size={22} />}
      </button>
    </div>
  );
}
