import React, { useState } from 'react';
import { Key, Loader2, CheckCircle, AlertCircle, Zap, Database } from 'lucide-react';

const LoginScreen = ({
  onStart,
  isVerifying,
  verificationStep,
  status
}) => {
  const [geminiKey, setGeminiKey] = useState('');
  const [groqKey, setGroqKey] = useState('');
  const [currentStep, setCurrentStep] = useState(1); // 1: Gemini, 2: Groq, 3: Ready

  const handleGeminiSubmit = (e) => {
    e.preventDefault();
    if (geminiKey.trim()) {
      setCurrentStep(2);
    }
  };

  const handleGroqSubmit = (e) => {
    e.preventDefault();
    if (groqKey.trim()) {
      onStart(geminiKey.trim(), groqKey.trim());
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-4">
      <div className="bg-white p-8 rounded-2xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex justify-center mb-6">
          <div className="p-4 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full">
            <Zap size={40} className="text-white" />
          </div>
        </div>

        <h2 className="text-2xl font-bold text-center mb-1">Gemini + Groq RAG</h2>
        <p className="text-center text-slate-500 text-sm mb-6">V3 - 混合模型架構</p>

        {/* Architecture Info */}
        <div className="mb-6 p-4 bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl border border-blue-100">
          <div className="flex items-center gap-4 text-xs">
            <div className="flex-1 text-center">
              <Database size={20} className="mx-auto mb-1 text-blue-600" />
              <span className="font-medium text-blue-800">Gemini</span>
              <p className="text-blue-600">向量化</p>
            </div>
            <div className="text-slate-400">+</div>
            <div className="flex-1 text-center">
              <Zap size={20} className="mx-auto mb-1 text-purple-600" />
              <span className="font-medium text-purple-800">Groq</span>
              <p className="text-purple-600">對話 & 視覺</p>
            </div>
          </div>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center justify-center gap-2 mb-6">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
            currentStep >= 1 ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'
          }`}>
            {verificationStep === 'gemini' && isVerifying ? (
              <Loader2 size={16} className="animate-spin" />
            ) : currentStep > 1 ? (
              <CheckCircle size={16} />
            ) : '1'}
          </div>
          <div className={`h-1 w-12 ${currentStep >= 2 ? 'bg-purple-600' : 'bg-gray-200'}`} />
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
            currentStep >= 2 ? 'bg-purple-600 text-white' : 'bg-gray-200 text-gray-500'
          }`}>
            {verificationStep === 'groq' && isVerifying ? (
              <Loader2 size={16} className="animate-spin" />
            ) : currentStep > 2 ? (
              <CheckCircle size={16} />
            ) : '2'}
          </div>
        </div>

        {/* Status Message */}
        {status.message && (
          <div className={`mb-4 p-3 rounded-xl text-center text-sm flex items-center justify-center gap-2 ${
            status.type === 'error'
              ? 'bg-red-50 text-red-600'
              : status.type === 'success'
              ? 'bg-green-50 text-green-600'
              : 'bg-blue-50 text-blue-600'
          }`}>
            {status.type === 'success' && <CheckCircle size={16} />}
            {status.type === 'error' && <AlertCircle size={16} />}
            {isVerifying && <Loader2 size={16} className="animate-spin" />}
            {status.message}
          </div>
        )}

        {/* Step 1: Gemini API Key */}
        {currentStep === 1 && (
          <form onSubmit={handleGeminiSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-2">
                <Database size={16} className="text-blue-600" />
                Google AI Studio API Key
              </label>
              <input
                type="password"
                placeholder="AIza..."
                className="w-full p-3 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                value={geminiKey}
                onChange={(e) => setGeminiKey(e.target.value)}
                autoFocus
              />
              <p className="text-xs text-slate-400 mt-1">用於文字向量化 (Embedding)</p>
            </div>
            <button
              type="submit"
              disabled={!geminiKey.trim()}
              className="w-full bg-blue-600 text-white p-3 rounded-xl font-bold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              下一步
            </button>
            <p className="text-xs text-slate-400 text-center">
              <a
                href="https://aistudio.google.com/apikey"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-500 hover:underline"
              >
                取得 Google AI Studio API Key
              </a>
            </p>
          </form>
        )}

        {/* Step 2: Groq API Key */}
        {currentStep === 2 && (
          <form onSubmit={handleGroqSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-2">
                <Zap size={16} className="text-purple-600" />
                Groq API Key
              </label>
              <input
                type="password"
                placeholder="gsk_..."
                className="w-full p-3 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-purple-500"
                value={groqKey}
                onChange={(e) => setGroqKey(e.target.value)}
                autoFocus
              />
              <p className="text-xs text-slate-400 mt-1">用於對話生成和圖像分析 (Llama 4 Scout)</p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setCurrentStep(1)}
                className="flex-1 bg-slate-200 text-slate-700 p-3 rounded-xl font-bold hover:bg-slate-300 transition-colors"
              >
                上一步
              </button>
              <button
                type="submit"
                disabled={!groqKey.trim() || isVerifying}
                className="flex-1 bg-purple-600 text-white p-3 rounded-xl font-bold hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                {isVerifying ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    驗證中...
                  </>
                ) : (
                  '開始使用'
                )}
              </button>
            </div>
            <p className="text-xs text-slate-400 text-center">
              <a
                href="https://console.groq.com/keys"
                target="_blank"
                rel="noopener noreferrer"
                className="text-purple-500 hover:underline"
              >
                取得 Groq API Key
              </a>
            </p>
          </form>
        )}

        {/* Features */}
        <div className="mt-8 pt-6 border-t border-slate-100">
          <p className="text-xs text-slate-400 text-center mb-3">V3 混合架構優勢</p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-blue-50 p-2 rounded-lg text-center text-blue-700">
              Gemini 向量化
            </div>
            <div className="bg-purple-50 p-2 rounded-lg text-center text-purple-700">
              Groq 超快推理
            </div>
            <div className="bg-green-50 p-2 rounded-lg text-center text-green-700">
              Llama 4 視覺
            </div>
            <div className="bg-orange-50 p-2 rounded-lg text-center text-orange-700">
              雙免費額度
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginScreen;
