import React, { useRef, useEffect } from 'react';
import { Send, Loader2, Trash2, MessageSquare, AlertCircle, Zap } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const ChatPanel = ({
  chatHistory,
  inputMessage,
  setInputMessage,
  isProcessing,
  status,
  onSendMessage,
  onClearChat
}) => {
  const chatEndRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (inputMessage.trim() && !isProcessing) {
      onSendMessage(inputMessage);
    }
  };

  return (
    <main className="flex-1 flex flex-col relative bg-slate-50">
      {/* Status Bar */}
      <div className={`p-2 text-center text-xs border-b flex items-center justify-center gap-2 ${
        status.type === 'error'
          ? 'bg-red-50 text-red-700'
          : status.type === 'success'
          ? 'bg-green-50 text-green-700'
          : 'bg-gradient-to-r from-blue-50 to-purple-50 text-purple-700'
      }`}>
        {isProcessing && <Loader2 size={12} className="animate-spin" />}
        {status.type === 'error' && <AlertCircle size={12} />}
        {!isProcessing && !status.type && <Zap size={12} className="text-purple-500" />}
        {status.message}
      </div>

      {/* Chat Header with Clear Button */}
      {chatHistory.length > 0 && (
        <div className="px-6 py-2 border-b bg-white flex justify-between items-center">
          <span className="text-xs text-slate-500 flex items-center gap-1">
            <MessageSquare size={12} />
            {chatHistory.length} 條訊息
            <span className="ml-2 text-purple-500 flex items-center gap-1">
              <Zap size={10} />
              Llama 4 Scout
            </span>
          </span>
          <button
            onClick={onClearChat}
            className="text-xs text-slate-400 hover:text-red-500 flex items-center gap-1 px-2 py-1 rounded hover:bg-red-50 transition-colors"
          >
            <Trash2 size={12} />
            清除對話
          </button>
        </div>
      )}

      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {chatHistory.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-400">
            <div className="p-4 bg-gradient-to-br from-purple-100 to-indigo-100 rounded-full mb-4">
              <Zap size={48} className="text-purple-500" />
            </div>
            <p className="text-lg font-medium text-slate-600">開始對話</p>
            <p className="text-sm mt-2 text-center max-w-sm">
              使用 Groq 的 Llama 4 Scout 模型回答問題<br />
              支援 RAG 知識庫檢索
            </p>
          </div>
        ) : (
          chatHistory.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] p-4 rounded-2xl shadow-sm ${
                  msg.role === 'user'
                    ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white'
                    : 'bg-white border border-slate-100'
                }`}
              >
                {msg.role === 'user' ? (
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                ) : (
                  <div className="prose prose-sm max-w-none prose-slate">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        table: ({ children }) => (
                          <div className="overflow-x-auto my-4">
                            <table className="min-w-full border-collapse border border-slate-200">
                              {children}
                            </table>
                          </div>
                        ),
                        th: ({ children }) => (
                          <th className="border border-slate-200 bg-slate-50 px-3 py-2 text-left text-sm font-semibold">
                            {children}
                          </th>
                        ),
                        td: ({ children }) => (
                          <td className="border border-slate-200 px-3 py-2 text-sm">
                            {children}
                          </td>
                        ),
                        code: ({ inline, children, ...props }) => {
                          if (inline) {
                            return (
                              <code className="bg-slate-100 px-1.5 py-0.5 rounded text-sm font-mono text-slate-800" {...props}>
                                {children}
                              </code>
                            );
                          }
                          return (
                            <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg overflow-x-auto my-4">
                              <code className="text-sm font-mono" {...props}>{children}</code>
                            </pre>
                          );
                        }
                      }}
                    >
                      {msg.content}
                    </ReactMarkdown>
                  </div>
                )}
              </div>
            </div>
          ))
        )}

        {/* Typing Indicator */}
        {isProcessing && chatHistory.length > 0 && (
          <div className="flex justify-start">
            <div className="bg-white border border-slate-100 p-4 rounded-2xl shadow-sm">
              <div className="flex items-center gap-2 text-purple-600">
                <Loader2 size={16} className="animate-spin" />
                <span className="text-sm">Llama 4 思考中...</span>
              </div>
            </div>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-6 bg-white border-t">
        <form onSubmit={handleSubmit} className="max-w-4xl mx-auto flex gap-3">
          <input
            type="text"
            placeholder="輸入問題..."
            disabled={isProcessing}
            className="flex-1 p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
          />
          <button
            type="submit"
            disabled={isProcessing || !inputMessage.trim()}
            className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white p-4 rounded-xl hover:from-purple-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            <Send size={20} />
          </button>
        </form>
      </div>
    </main>
  );
};

export default ChatPanel;
