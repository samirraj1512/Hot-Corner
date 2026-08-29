import { useEffect, useRef, useState } from "react";
import { MessageCircleMore, SendHorizontal } from "lucide-react";

const formatMessageTime = (value) => new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

const WatchChat = ({ messages, currentUserId, onSend }) => {
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  const submit = async (event) => {
    event.preventDefault();
    const nextText = text.trim();
    if (!nextText) return;

    setSending(true);
    setError("");
    try {
      await onSend(nextText);
      setText("");
    } catch (sendError) {
      setError(sendError.message || "Message could not be sent.");
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="border border-white/10 bg-white/[0.025] rounded-lg overflow-hidden flex flex-col min-h-84">
      <div className="h-12 px-4 flex items-center border-b border-white/10">
        <span className="flex items-center gap-2 text-sm font-medium"><MessageCircleMore className="w-4 h-4 text-primary" /> Live chat</span>
      </div>
      <div className="flex-1 max-h-72 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length ? messages.map((message) => {
          const ownMessage = message.userId === currentUserId;
          return (
            <div key={message.id} className={ownMessage ? "text-right" : "text-left"}>
              <div className={`inline-block max-w-[90%] px-3 py-2 text-sm rounded-lg ${ownMessage ? "bg-primary text-white" : "bg-white/10 text-gray-100"}`}>
                {!ownMessage && <span className="block text-xs font-medium text-primary mb-1">{message.name}</span>}
                <span className="break-words">{message.text}</span>
              </div>
              <span className="block text-[11px] text-gray-500 mt-1">{formatMessageTime(message.sentAt)}</span>
            </div>
          );
        }) : <p className="h-full min-h-28 flex items-center justify-center text-center text-sm text-gray-500">No messages yet.</p>}
        <div ref={messagesEndRef} />
      </div>
      <form onSubmit={submit} className="border-t border-white/10 p-3">
        {error && <p className="text-xs text-red-300 mb-2">{error}</p>}
        <div className="flex gap-2">
          <input
            value={text}
            onChange={(event) => setText(event.target.value)}
            maxLength={500}
            placeholder="Write a message"
            className="min-w-0 flex-1 h-10 border border-white/10 bg-black/30 px-3 rounded-lg outline-none text-sm focus:border-primary"
          />
          <button
            type="submit"
            disabled={sending || !text.trim()}
            title="Send message"
            aria-label="Send message"
            className="w-10 h-10 shrink-0 flex items-center justify-center bg-primary hover:bg-primary-dull disabled:opacity-50 transition rounded-lg cursor-pointer disabled:cursor-not-allowed"
          >
            <SendHorizontal className="w-4 h-4" />
          </button>
        </div>
      </form>
    </section>
  );
};

export default WatchChat;
