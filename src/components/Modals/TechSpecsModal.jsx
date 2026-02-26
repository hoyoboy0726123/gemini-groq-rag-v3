import React from 'react';
import { X, Code2, ShieldCheck, Zap, Database, Cpu, Globe } from 'lucide-react';
import { getEmbeddingModelInfo } from '../../lib/gemini';
import { getModelInfo } from '../../lib/groq';

const TechSpecsModal = ({ isOpen, onClose, storageStats = null }) => {
  if (!isOpen) return null;

  const embeddingInfo = getEmbeddingModelInfo();
  const groqInfo = getModelInfo();

  const formatBytes = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gradient-to-r from-blue-50 to-purple-50">
          <h3 className="font-bold text-xl text-slate-800 flex items-center gap-2">
            <Code2 size={24} className="text-purple-600" />
            V3 混合架構技術說明
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="p-8 overflow-y-auto space-y-8 custom-scrollbar">
          {/* Architecture Overview */}
          <section className="bg-gradient-to-r from-blue-50 to-purple-50 p-6 rounded-2xl border border-purple-100">
            <h4 className="text-lg font-bold text-purple-800 mb-4 flex items-center gap-2">
              <Zap className="text-purple-600" size={20} />
              混合模型架構
            </h4>
            <div className="grid grid-cols-2 gap-4">
              {/* Gemini */}
              <div className="bg-white p-4 rounded-xl border border-blue-200">
                <div className="flex items-center gap-2 mb-2">
                  <Database size={18} className="text-blue-600" />
                  <span className="font-bold text-blue-800">Google Gemini</span>
                </div>
                <ul className="text-xs text-slate-600 space-y-1">
                  <li>• 模型: {embeddingInfo.id}</li>
                  <li>• 任務: 文字向量化</li>
                  <li>• 維度: {embeddingInfo.dimensions}</li>
                  <li>• 速率: {embeddingInfo.rateLimit}</li>
                </ul>
              </div>

              {/* Groq */}
              <div className="bg-white p-4 rounded-xl border border-purple-200">
                <div className="flex items-center gap-2 mb-2">
                  <Zap size={18} className="text-purple-600" />
                  <span className="font-bold text-purple-800">Groq (Llama 4)</span>
                </div>
                <ul className="text-xs text-slate-600 space-y-1">
                  <li>• 模型: {groqInfo.name}</li>
                  <li>• 任務: 對話 + 視覺分析</li>
                  <li>• Context: {groqInfo.contextWindow}</li>
                  <li>• 圖片: 最多 5 張/請求</li>
                </ul>
              </div>
            </div>
          </section>

          <hr className="border-gray-100" />

          {/* Security */}
          <section>
            <h4 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
              <ShieldCheck className="text-green-600" size={20} />
              安全與隱私
            </h4>
            <ul className="text-sm text-slate-600 space-y-2">
              <li className="flex items-start gap-2">
                <span className="text-green-500">✓</span>
                兩組 API Key 皆採用 Memory-Only 策略，關閉即銷毀
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-500">✓</span>
                所有向量和對話存儲在本地 IndexedDB
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-500">✓</span>
                PDF 頁面截圖僅在分析時發送，不永久儲存
              </li>
            </ul>
          </section>

          <hr className="border-gray-100" />

          {/* Capabilities */}
          <section>
            <h4 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
              <Globe className="text-blue-600" size={20} />
              Llama 4 Scout 能力
            </h4>
            <div className="grid grid-cols-3 gap-3">
              {groqInfo.capabilities.map((cap, i) => (
                <div key={i} className="bg-slate-50 p-3 rounded-lg text-center text-sm text-slate-700">
                  {cap}
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-500 mt-3">
              支援語言: 英語、中文、日語、韓語、法語、德語、西班牙語、葡萄牙語等 12 種語言
            </p>
          </section>

          <hr className="border-gray-100" />

          {/* Storage Stats */}
          {storageStats && (
            <section>
              <h4 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                <Database className="text-green-600" size={20} />
                存儲統計
              </h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 p-4 rounded-xl">
                  <div className="text-2xl font-bold text-slate-800">{storageStats.documentCount}</div>
                  <div className="text-sm text-slate-500">文件數</div>
                </div>
                <div className="bg-gray-50 p-4 rounded-xl">
                  <div className="text-2xl font-bold text-slate-800">{storageStats.chunkCount}</div>
                  <div className="text-sm text-slate-500">向量區塊</div>
                </div>
                <div className="bg-gray-50 p-4 rounded-xl">
                  <div className="text-2xl font-bold text-slate-800">{storageStats.messageCount}</div>
                  <div className="text-sm text-slate-500">對話訊息</div>
                </div>
                <div className="bg-gray-50 p-4 rounded-xl">
                  <div className="text-2xl font-bold text-slate-800">
                    {formatBytes(storageStats.estimatedSize?.total || 0)}
                  </div>
                  <div className="text-sm text-slate-500">估計大小</div>
                </div>
              </div>
            </section>
          )}

          {/* Version Info */}
          <section className="bg-slate-50 p-4 rounded-xl">
            <h4 className="text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
              <Cpu size={16} />
              版本資訊
            </h4>
            <div className="text-xs text-slate-500 space-y-1">
              <div>RAG Engine: V3.0 (Hybrid)</div>
              <div>Embedding: Gemini ({embeddingInfo.id})</div>
              <div>Chat/Vision: Groq ({groqInfo.id})</div>
              <div>Chunk Strategy: Semantic (sentence-aware)</div>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-100 flex justify-end bg-gray-50">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-700 transition-colors"
          >
            關閉
          </button>
        </div>
      </div>
    </div>
  );
};

export default TechSpecsModal;
