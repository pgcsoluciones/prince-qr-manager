import { useState, useRef, useEffect, useCallback } from "react";
import { useAuth } from "../context/AuthContext.jsx";

const BASE = import.meta.env.VITE_API_URL || "https://api.code.intaprd.com";

const INACTIVITY_WARN_MS  = 23 * 60 * 1000; // aviso a los 23 min
const INACTIVITY_CLOSE_MS = 25 * 60 * 1000; // cierre a los 25 min

const FAREWELL_WORDS = ["adiós", "adios", "hasta luego", "bye", "chau", "nos vemos", "gracias, eso es todo", "eso es todo", "goodbye", "hasta pronto"];

const QUICK_QUESTIONS = [
  "¿Cómo crear mi primer QR?",
  "¿Para qué sirve Trace?",
  "¿Qué plan me conviene?",
  "¿Cómo descargo mi QR?",
];

function getTime() {
  return new Date().toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
}

function isFarewell(text) {
  const lower = text.toLowerCase().trim();
  return FAREWELL_WORDS.some((w) => lower.includes(w));
}

function loadSession() {
  try {
    const raw = sessionStorage.getItem("ai_chat_messages");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveSession(messages) {
  try {
    sessionStorage.setItem("ai_chat_messages", JSON.stringify(messages));
  } catch {}
}

function clearSession() {
  try { sessionStorage.removeItem("ai_chat_messages"); } catch {}
}

function buildWelcome(user) {
  const name = user?.company_name || user?.email?.split("@")[0] || null;
  const greeting = name ? `¡Hola, ${name}! ` : "¡Hola! ";
  return {
    id: "welcome",
    role: "assistant",
    content: `${greeting}Soy **Codi**, tu asistente de Intap Code. Puedo ayudarte a crear QRs, entender Trace, analizar métricas y elegir el plan ideal. ¿En qué te ayudo hoy?`,
    time: getTime(),
  };
}

function DotsLoader() {
  return (
    <div className="flex items-end gap-1 px-4 py-3 bg-slate-100 rounded-2xl rounded-tl-sm w-fit max-w-[80%]">
      <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: "0ms" }} />
      <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: "150ms" }} />
      <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: "300ms" }} />
    </div>
  );
}

export default function AIChat() {
  const { user } = useAuth();
  const [open, setOpen]       = useState(false);
  const [messages, setMessages] = useState(() => loadSession() || [buildWelcome(user)]);
  const [input, setInput]     = useState("");
  const [loading, setLoading] = useState(false);
  const [warned, setWarned]   = useState(false);
  const [avatar, setAvatar]   = useState(null);

  const messagesEndRef  = useRef(null);
  const textareaRef     = useRef(null);
  const warnTimerRef    = useRef(null);
  const closeTimerRef   = useRef(null);

  useEffect(() => {
    if (!user) return;
    const token = localStorage.getItem("qr_token") || "";
    fetch(`${BASE}/api/codi/config`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => { if (d.avatar) setAvatar(d.avatar); })
      .catch(() => {});
  }, [user?.id]);

  // ── helpers ────────────────────────────────────────────────────────────────

  const resetChat = useCallback((keepOpen = false) => {
    clearSession();
    setWarned(false);
    setMessages([buildWelcome(user)]);
    if (!keepOpen) setOpen(false);
  }, [user]);

  const addSystemMsg = useCallback((content, type = "info") => {
    setMessages((prev) => [
      ...prev,
      { id: Date.now().toString() + "_sys", role: "system", content, type, time: getTime() },
    ]);
  }, []);

  // ── inactivity timers ──────────────────────────────────────────────────────

  const clearTimers = useCallback(() => {
    clearTimeout(warnTimerRef.current);
    clearTimeout(closeTimerRef.current);
  }, []);

  const startTimers = useCallback(() => {
    clearTimers();
    setWarned(false);

    warnTimerRef.current = setTimeout(() => {
      setWarned(true);
      addSystemMsg("⏱ Llevas un rato sin escribir. El chat se cerrará en 2 minutos por inactividad. Escribe algo para continuar.", "warning");
    }, INACTIVITY_WARN_MS);

    closeTimerRef.current = setTimeout(() => {
      addSystemMsg("👋 Sesión cerrada por inactividad. ¡Hasta pronto!");
      setTimeout(() => resetChat(false), 1500);
    }, INACTIVITY_CLOSE_MS);
  }, [clearTimers, addSystemMsg, resetChat]);

  // Start timers when chat opens; clear when it closes
  useEffect(() => {
    if (open) {
      startTimers();
    } else {
      clearTimers();
    }
    return clearTimers;
  }, [open, startTimers, clearTimers]);

  // ── scroll & session persistence ──────────────────────────────────────────

  useEffect(() => {
    if (open) setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }, [messages, open]);

  useEffect(() => { saveSession(messages); }, [messages]);

  // Reset welcome when user loads from localStorage
  useEffect(() => {
    if (user) {
      setMessages((prev) => {
        if (prev.length === 1 && prev[0].id === "welcome") return [buildWelcome(user)];
        return prev;
      });
    }
  }, [user?.id]);

  // ── send message ───────────────────────────────────────────────────────────

  const sendMessage = useCallback(
    async (text) => {
      const trimmed = text.trim();
      if (!trimmed || loading) return;

      // Reset inactivity timers on user activity
      startTimers();

      // Detect farewell
      if (isFarewell(trimmed)) {
        const userMsg = { id: Date.now().toString(), role: "user", content: trimmed, time: getTime() };
        setMessages((prev) => [
          ...prev,
          userMsg,
          { id: Date.now().toString() + "_bye", role: "assistant", content: "¡Hasta luego! Que tengas un excelente día. Aquí estaré cuando me necesites. 👋", time: getTime() },
        ]);
        setInput("");
        setTimeout(() => resetChat(false), 2500);
        return;
      }

      const userMsg = { id: Date.now().toString(), role: "user", content: trimmed, time: getTime() };
      const nextMessages = [...messages, userMsg];
      setMessages(nextMessages);
      setInput("");
      setLoading(true);

      if (textareaRef.current) textareaRef.current.style.height = "auto";

      try {
        const token = localStorage.getItem("qr_token") || "";
        const res = await fetch(`${BASE}/api/ai/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            message: trimmed,
            history: nextMessages
              .filter((m) => m.role !== "system")
              .slice(-10)
              .map((m) => ({ role: m.role, content: m.content })),
          }),
        });
        const data = await res.json();
        const reply = data.reply || data.message || data.content || "Lo siento, no pude procesar tu solicitud.";
        setMessages((prev) => [
          ...prev,
          { id: Date.now().toString() + "_a", role: "assistant", content: reply, time: getTime() },
        ]);
      } catch {
        setMessages((prev) => [
          ...prev,
          { id: Date.now().toString() + "_err", role: "assistant", content: "Hubo un error al conectar con el asistente. Inténtalo de nuevo.", time: getTime() },
        ]);
      } finally {
        setLoading(false);
      }
    },
    [messages, loading, startTimers, resetChat]
  );

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); }
  };

  const handleTextareaInput = (e) => {
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 80) + "px";
    setInput(el.value);
    // Reset inactivity when user types
    startTimers();
  };

  const showQuickQuestions = messages.filter((m) => m.role !== "system").length <= 1;

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <>
      {open && (
        <div
          className="fixed bottom-24 right-6 z-50 flex flex-col bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden"
          style={{ width: 360, height: 520 }}
        >
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 flex-shrink-0">
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white font-bold text-sm flex-shrink-0 overflow-hidden">
              {avatar ? (
                <img src={avatar} alt="Codi" className="w-full h-full object-cover" />
              ) : (
                <span>🤖</span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-white text-sm leading-none">Codi</p>
              <p className="text-blue-200 text-xs mt-0.5">En línea · Tu asistente de Intap Code</p>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="p-1 rounded-lg hover:bg-white/20 text-white/80 hover:text-white transition-colors"
              aria-label="Cerrar"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3 min-h-0">
            {messages.map((msg) => {
              if (msg.role === "system") {
                return (
                  <div key={msg.id} className="flex justify-center">
                    <span className={`text-xs px-3 py-1.5 rounded-full ${msg.type === "warning" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500"}`}>
                      {msg.content}
                    </span>
                  </div>
                );
              }
              return (
                <div key={msg.id} className={`flex flex-col gap-0.5 ${msg.role === "user" ? "items-end" : "items-start"}`}>
                  <div
                    className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed max-w-[85%] whitespace-pre-wrap ${
                      msg.role === "user"
                        ? "bg-blue-600 text-white rounded-tr-sm"
                        : "bg-slate-100 text-slate-800 rounded-tl-sm"
                    }`}
                  >
                    {msg.content}
                  </div>
                  <span className="text-[10px] text-slate-400 px-1">{msg.time}</span>
                </div>
              );
            })}

            {loading && (
              <div className="flex flex-col items-start gap-0.5">
                <DotsLoader />
              </div>
            )}

            {showQuickQuestions && !loading && (
              <div className="flex flex-wrap gap-2 mt-1">
                {QUICK_QUESTIONS.map((q) => (
                  <button
                    key={q}
                    onClick={() => sendMessage(q)}
                    className="text-xs px-3 py-1.5 rounded-full border border-blue-200 text-blue-600 hover:bg-blue-50 transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input area */}
          <div className="flex-shrink-0 border-t border-slate-100 px-3 py-3 flex items-end gap-2">
            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onInput={handleTextareaInput}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Escribe un mensaje..."
              disabled={loading}
              className="flex-1 resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 bg-slate-50 placeholder-slate-400 disabled:opacity-50"
              style={{ minHeight: 36, maxHeight: 80 }}
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={loading || !input.trim()}
              className="flex-shrink-0 w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Enviar"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Floating button */}
      <div className="fixed bottom-6 right-6 z-50">
        <div className="relative group">
          <span className="absolute bottom-full right-0 mb-2 px-2 py-1 rounded-lg bg-slate-800 text-white text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none select-none">
            Codi — Asistente IA
          </span>
          <button
            onClick={() => setOpen((o) => !o)}
            className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-200 focus:outline-none focus:ring-4 focus:ring-blue-300 overflow-hidden"
            aria-label={open ? "Cerrar asistente" : "Abrir asistente IA"}
          >
            {open ? (
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : avatar ? (
              <img src={avatar} alt="Codi" className="w-full h-full object-cover" />
            ) : (
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
              </svg>
            )}
          </button>
          <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-green-400 border-2 border-white" />
        </div>
      </div>
    </>
  );
}
