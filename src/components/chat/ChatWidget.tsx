'use client';

import { useState } from 'react';
import { MessageCircle, X, Send, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { usePathname } from 'next/navigation';
import { chatAskAction, chatGreetingAction } from '@/actions/chat';

interface Msg {
  role: 'user' | 'assistant';
  text: string;
}

export default function ChatWidget() {
  const { user } = useAuth();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [greeted, setGreeted] = useState(false);

  // Chỉ hiển thị cho Manager/Leader/SubLeader
  if (!user || !['Manager', 'Leader', 'SubLeader'].includes(user.role)) return null;

  const openWidget = async () => {
    setOpen(true);
    if (greeted) return;
    setGreeted(true);
    const res = await chatGreetingAction(pathname || '/');
    const greeting = res.greeting;
    if (greeting) {
      setMessages((m) => [...m, { role: 'assistant', text: greeting }]);
    }
  };

  const send = async () => {
    const q = input.trim();
    if (!q || loading) return;
    setInput('');
    setMessages((m) => [...m, { role: 'user', text: q }]);
    setLoading(true);
    const res = await chatAskAction({ question: q, pathname: pathname || '/', history: messages.slice(-12) });
    const reply = res.reply || res.error || 'Em chưa trả lời được lúc này, chị thử lại sau nhé.';
    setMessages((m) => [...m, { role: 'assistant', text: reply }]);
    setLoading(false);
  };

  return (
    <>
      {/* Nút mở: chỉ hiện khi widget ĐÓNG (khi mở đã có nút X ở header panel) */}
      {!open && (
        <button
          onClick={openWidget}
          className="fixed right-4 bottom-24 md:bottom-6 z-[9998] w-14 h-14 rounded-full bg-primary text-white shadow-xl shadow-primary/30 flex items-center justify-center hover:bg-primary/90 transition-all"
          aria-label="Hỗ trợ"
          title="Hỗ trợ"
        >
          <MessageCircle size={24} />
        </button>
      )}

      {/* Panel chat */}
      {open && (
        <div className="fixed right-4 bottom-40 md:bottom-24 z-[9999] w-[calc(100vw-2rem)] max-w-sm h-[calc(100dvh-5rem)] bg-white rounded-2xl border border-outline-variant shadow-2xl flex flex-col overflow-hidden">
          <div className="px-4 py-3 bg-primary text-white flex items-center justify-between">
            <div>
              <p className="font-bold text-sm">Trợ lý KURABE</p>
              <p className="text-[11px] text-white/80">Hỏi đáp về cách sử dụng hệ thống</p>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Đóng" className="p-1 rounded-lg hover:bg-white/10">
              <X size={18} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-surface">
            {messages.length === 0 && (
              <p className="text-sm text-outline italic">Chị có thắc mắc gì về hệ thống, em hỗ trợ được ạ.</p>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap ${
                  m.role === 'user'
                    ? 'bg-primary text-white rounded-br-sm'
                    : 'bg-white border border-outline-variant rounded-bl-sm'
                }`}>
                  {m.text}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="px-3 py-2 rounded-2xl text-sm bg-white border border-outline-variant flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin text-outline" /> Em đang xem giúp chị...
                </div>
              </div>
            )}
          </div>

          <div className="p-3 border-t border-outline-variant bg-white">
            <div className="flex items-center gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
                placeholder="Nhập câu hỏi..."
                disabled={loading}
                className="flex-1 px-3 py-2 rounded-xl border border-outline-variant text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
              />
              <button
                onClick={send}
                disabled={loading || !input.trim()}
                className="p-2.5 rounded-xl bg-primary text-white disabled:opacity-40 hover:bg-primary/90 transition-all"
                aria-label="Gửi"
              >
                <Send size={18} />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
