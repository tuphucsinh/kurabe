'use client';

import { useState } from 'react';
import { MessageCircle, X, Send, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { usePathname } from 'next/navigation';
import { chatAskAction, chatAskWithScreenshotAction, chatGreetingAction } from '@/actions/chat';
import { domToPng } from 'modern-screenshot';

interface Msg {
  role: 'user' | 'assistant';
  text: string;
  pathname: string; // trang sinh ra tin nhắn
}

export default function ChatWidget() {
  const { user } = useAuth();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sendingShot, setSendingShot] = useState(false);
  const [greeted, setGreeted] = useState(false);

  // Chỉ hiển thị cho Manager/Leader/SubLeader
  if (!user || !['Manager', 'Leader', 'SubLeader'].includes(user.role)) return null;

  const visibleMessages = messages.filter((m) => m.pathname === pathname);

  const openWidget = async () => {
    setOpen(true);
    if (greeted || visibleMessages.length > 0) return;
    setGreeted(true);
    const res = await chatGreetingAction(pathname || '/');
    const greeting = res.greeting;
    if (greeting) {
      setMessages((m) => [...m, { role: 'assistant', text: greeting, pathname: pathname || '/' }]);
    }
  };

  const send = async () => {
    const q = input.trim();
    if (!q || loading || sendingShot) return;
    setInput('');
    const history = visibleMessages.slice(-12);
    setMessages((m) => [...m, { role: 'user', text: q, pathname: pathname || '/' }]);
    setLoading(true);
    const res = await chatAskAction({ question: q, pathname: pathname || '/', history });
    const raw = res.reply || res.error || '';
    const needShot = raw.includes('[CẦN_ẢNH]');
    const cleanReply = raw.replace(/\[CẦN_ẢNH\]/g, '').trim();
    if (needShot) {
      // hiện dòng trung gian + cảnh báo PII rồi TỰ chụp
      setMessages((m) => [...m, { role: 'assistant', text: cleanReply + '\n\nEm cần xem ảnh màn hình của chị để phân tích chính xác. Em sẽ tự chụp — ảnh chỉ dùng cho câu trả lời này và không được lưu lại.', pathname: pathname || '/' }]);
      setLoading(false);
      await autoCaptureAndSend(q);
    } else {
      setMessages((m) => [...m, { role: 'assistant', text: cleanReply || 'Em chưa trả lời được lúc này, chị thử lại sau nhé.', pathname: pathname || '/' }]);
      setLoading(false);
    }
  };

  const autoCaptureAndSend = async (question: string) => {
    setSendingShot(true);
    try {
      const dataUrl = await domToPng(document.body, { scale: 0.5, backgroundColor: '#f8fafc', quality: 0.8 });
      let b64 = dataUrl.split(',')[1] || '';
      if (b64.length > 921600) {
        const d2 = await domToPng(document.body, { scale: 0.3, backgroundColor: '#f8fafc', quality: 0.7 });
        b64 = d2.split(',')[1] || '';
      }
      if (b64.length > 921600) {
        setMessages((m) => [...m, { role: 'assistant', text: 'Ảnh màn hình quá lớn, chị có thể thu nhỏ cửa sổ rồi thử lại ạ.', pathname: pathname || '/' }]);
        setSendingShot(false);
        return;
      }
      const history = visibleMessages.slice(-12);
      const res = await chatAskWithScreenshotAction({ question, pathname: pathname || '/', history, imageBase64: b64 });
      setMessages((m) => [...m, { role: 'assistant', text: res.reply || res.error || 'Em chưa phân tích được lúc này.', pathname: pathname || '/' }]);
    } catch {
      setMessages((m) => [...m, { role: 'assistant', text: 'Em chưa chụp được màn hình, chị thử lại nhé.', pathname: pathname || '/' }]);
    }
    setSendingShot(false);
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
        <div className="fixed right-4 bottom-4 md:bottom-6 z-[9999] w-[calc(100vw-2rem)] max-w-sm h-[calc(100dvh-6rem)] bg-white rounded-2xl border border-outline-variant shadow-2xl flex flex-col overflow-hidden">
          <div className="px-4 py-3 bg-primary text-white flex items-center justify-between">
            <div>
              <p className="font-bold text-sm">Trợ lý KURABE</p>
              <p className="text-[11px] text-white/80">Hỏi đáp về cách sử dụng hệ thống</p>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Đóng" className="p-2 rounded-lg hover:bg-white/10 transition-all">
              <X size={24} />
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
            {(loading || sendingShot) && (
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
                disabled={loading || sendingShot}
                className="flex-1 px-3 py-2 rounded-xl border border-outline-variant text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
              />
              <button
                type="button"
                onClick={send}
                disabled={loading || sendingShot || !input.trim()}
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
