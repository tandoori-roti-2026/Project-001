import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Send,
  User,
  RotateCcw,
  MessageSquare,
  HelpCircle,
  FileQuestion,
  FileCheck2,
  ShieldAlert,
  Loader2,
  Sparkles,
  Info,
} from 'lucide-react';

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: string;
}

interface ExaminerChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

const WELCOME_MESSAGE = `Hello Examiner! I am Examiner Chat, your academic grading and marking assistant for PROJECT-001.

How I can assist you:
• Paste an exam question → I will provide the official model answer, key points, and marking breakdown.
• Paste a student's answer → I will suggest marks out of the max marks, determine which side (left or OR) was attempted, and provide an evaluation reason.
• Ask about FBISE marking rules (OR choices, partial credit for wrong arithmetic, blank answers).
• Ask how to use Students, Schemes, Upload, or Results.

(Note: Chat advice is for examiner reference and is never saved as an official mark.)`;

const QUICK_PROMPTS = [
  {
    icon: FileQuestion,
    label: 'Paste a Question',
    text: 'Please provide the official FBISE model answer, core key points, and marking breakdown for this question:\n\n[Paste question text here]',
  },
  {
    icon: FileCheck2,
    label: 'Evaluate Student Answer',
    text: 'Please evaluate this student answer out of 3 marks, identify if they attempted the main or OR side, and suggest marks:\n\n[Paste student handwritten text/calculation here]',
  },
  {
    icon: Info,
    label: 'FBISE OR-Side Rules',
    text: 'What are the official FBISE rules for grading questions with OR choices and arithmetic errors?',
  },
  {
    icon: HelpCircle,
    label: 'How to use this app',
    text: 'Explain how the Uploading, Editing, Result Cards, and Students Data modules work together in PROJECT-001.',
  },
];

export const ExaminerChatPanel: React.FC<ExaminerChatPanelProps> = ({ isOpen, onClose }) => {
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved = sessionStorage.getItem('project001_examiner_chat');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (_) {}
    return [
      {
        id: 'welcome-msg',
        role: 'model',
        text: WELCOME_MESSAGE,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ];
  });

  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  // Save conversation in session
  useEffect(() => {
    try {
      sessionStorage.setItem('project001_examiner_chat', JSON.stringify(messages));
    } catch (_) {}
  }, [messages]);

  // Scroll to bottom on message updates
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen, isLoading]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 250);
    }
  }, [isOpen]);

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputText).trim();
    if (!text || isLoading) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setInputText('');
    setIsLoading(true);
    setErrorMsg(null);

    try {
      const apiHistory = newHistory.map((m) => ({
        role: m.role,
        text: m.text,
      }));

      const res = await fetch('/api/examiner-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: apiHistory.slice(0, -1),
        }),
      });

      if (!res.ok) {
        throw new Error(`Server returned status ${res.status}`);
      }

      const data = await res.json();
      const replyText =
        data.reply ||
        data.text ||
        'I only assist with PROJECT-001 exam marking and app workflows. Please paste an exam question or a student answer.';

      const modelMsg: ChatMessage = {
        id: `model-${Date.now()}`,
        role: 'model',
        text: replyText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages((prev) => [...prev, modelMsg]);
    } catch (err: any) {
      console.error('Examiner Chat error:', err);
      setErrorMsg('Examiner Chat is temporarily unreachable. Please try again.');
      const fallbackMsg: ChatMessage = {
        id: `err-${Date.now()}`,
        role: 'model',
        text: 'I am experiencing a momentary connection issue. Please paste your question or student answer again.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, fallbackMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearHistory = () => {
    const resetList: ChatMessage[] = [
      {
        id: `welcome-${Date.now()}`,
        role: 'model',
        text: WELCOME_MESSAGE,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ];
    setMessages(resetList);
    try {
      sessionStorage.removeItem('project001_examiner_chat');
    } catch (_) {}
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex justify-end select-none">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={onClose}
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs cursor-pointer"
          />

          {/* Slide-out Drawer Panel */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-full max-w-lg h-full bg-white text-slate-800 shadow-2xl flex flex-col z-10 border-l border-slate-200"
          >
            {/* Header */}
            <div
              className="px-5 py-4 flex items-center justify-between text-white shrink-0 relative overflow-hidden"
              style={{
                background: 'linear-gradient(90deg, #4DD9E8 0%, #0047AB 100%)',
              }}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-xs flex items-center justify-center text-white shadow-inner">
                  <MessageSquare className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-rounded font-bold text-lg text-white tracking-wide">
                      Examiner Chat
                    </h2>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-white/25 text-white">
                      Online
                    </span>
                  </div>
                  <p className="text-xs text-white/90 font-rounded">
                    PROJECT-001 Marking & Evaluation Assistant
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleClearHistory}
                  className="p-2 rounded-xl text-white/80 hover:text-white hover:bg-white/15 transition-colors cursor-pointer"
                  title="Clear Conversation"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="p-2 rounded-xl text-white/80 hover:text-white hover:bg-white/15 transition-colors cursor-pointer"
                  title="Close Examiner Chat"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Disclaimer strip */}
            <div className="bg-amber-50 border-b border-amber-200/80 px-4 py-2 flex items-center gap-2 text-xs text-amber-900 font-rounded">
              <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0" />
              <span>
                <strong>Notice:</strong> Chat advice is for examiner reference and is never saved as the official script mark.
              </span>
            </div>

            {/* Scrollable Message Thread */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 bg-slate-50">
              {messages.map((msg) => {
                const isUser = msg.role === 'user';
                return (
                  <div
                    key={msg.id}
                    className={`flex items-start gap-2.5 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
                  >
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold ${
                        isUser
                          ? 'bg-[#0047AB] text-white shadow-xs'
                          : 'bg-gradient-to-br from-[#4DD9E8] to-[#0047AB] text-white shadow-xs'
                      }`}
                    >
                      {isUser ? <User className="w-4 h-4" /> : <MessageSquare className="w-4 h-4" />}
                    </div>

                    <div className={`max-w-[82%] sm:max-w-[80%] flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
                      <div
                        className={`rounded-2xl px-4 py-3 text-xs sm:text-sm font-rounded leading-relaxed shadow-xs whitespace-pre-wrap ${
                          isUser
                            ? 'bg-[#0047AB] text-white rounded-tr-none'
                            : 'bg-white text-slate-800 border border-slate-200/80 rounded-tl-none'
                        }`}
                      >
                        {msg.text}
                      </div>
                      <span className="text-[10px] text-slate-400 mt-1 px-1 font-mono">
                        {msg.timestamp}
                      </span>
                    </div>
                  </div>
                );
              })}

              {isLoading && (
                <div className="flex items-start gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#4DD9E8] to-[#0047AB] text-white flex items-center justify-center shrink-0">
                    <MessageSquare className="w-4 h-4" />
                  </div>
                  <div className="bg-white border border-slate-200/80 rounded-2xl rounded-tl-none px-4 py-3 text-xs sm:text-sm font-rounded text-slate-500 flex items-center gap-2 shadow-xs">
                    <Loader2 className="w-4 h-4 animate-spin text-[#0047AB]" />
                    <span>Examiner Chat is reviewing...</span>
                  </div>
                </div>
              )}

              {errorMsg && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 font-rounded text-center">
                  {errorMsg}
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Quick Prompts Carousel */}
            <div className="px-4 py-2 bg-white border-t border-slate-100 flex items-center gap-2 overflow-x-auto no-scrollbar">
              {QUICK_PROMPTS.map((qp, idx) => {
                const IconComponent = qp.icon;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setInputText(qp.text);
                      inputRef.current?.focus();
                    }}
                    className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-cyan-50 hover:text-[#0047AB] hover:border-cyan-200 border border-slate-200 rounded-full text-xs font-rounded font-medium text-slate-700 transition-colors cursor-pointer"
                  >
                    <IconComponent className="w-3.5 h-3.5" />
                    <span>{qp.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Input Footer */}
            <div className="p-4 bg-white border-t border-slate-200">
              <div className="flex items-end gap-2 bg-slate-50 border border-slate-300/80 rounded-2xl p-2 focus-within:ring-2 focus-within:ring-[#4DD9E8] focus-within:border-transparent transition-all">
                <textarea
                  ref={inputRef}
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Paste question or student answer, or ask app workflows..."
                  rows={2}
                  className="flex-1 bg-transparent resize-none text-xs sm:text-sm font-rounded text-slate-800 placeholder-slate-400 outline-none px-2 py-1"
                />

                <button
                  type="button"
                  onClick={() => handleSendMessage()}
                  disabled={!inputText.trim() || isLoading}
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0 shadow-md transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
                  style={{
                    background: 'linear-gradient(135deg, #4DD9E8 0%, #0047AB 100%)',
                  }}
                  title="Send message (Enter)"
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                  ) : (
                    <Send className="w-4 h-4 text-white" />
                  )}
                </button>
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-400 font-rounded mt-2 px-1">
                <span>Press Enter to send, Shift+Enter for new line</span>
                <span>Examiner Chat · FBISE Support</span>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
