import React, { useState, useRef } from 'react';
import { X, Download, Upload, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { exportKnowledgeBase, importKnowledgeBase } from '../../lib/db';

const ExportImportModal = ({ isOpen, onClose, onImportComplete }) => {
  const [mode, setMode] = useState('export');
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState(null);
  const [clearExisting, setClearExisting] = useState(false);
  const fileInputRef = useRef(null);

  const handleExport = async () => {
    setIsProcessing(true);
    setResult(null);

    try {
      const data = await exportKnowledgeBase();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = `rag-backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setResult({
        type: 'success',
        message: `成功匯出 ${data.data.documents.length} 個文件、${data.data.chunks.length} 個區塊`
      });
    } catch (err) {
      setResult({ type: 'error', message: err.message });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setResult(null);

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      const stats = await importKnowledgeBase(data, { clearExisting });

      setResult({
        type: 'success',
        message: `成功匯入 ${stats.documentsImported} 個文件、${stats.chunksImported} 個區塊、${stats.messagesImported} 條對話`
      });

      if (onImportComplete) {
        onImportComplete();
      }
    } catch (err) {
      setResult({ type: 'error', message: `匯入失敗: ${err.message}` });
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b flex justify-between items-center bg-slate-50">
          <h3 className="font-bold text-lg">匯出 / 匯入知識庫</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        {/* Mode Tabs */}
        <div className="flex border-b">
          <button
            onClick={() => { setMode('export'); setResult(null); }}
            className={`flex-1 p-3 text-sm font-medium flex items-center justify-center gap-2 ${
              mode === 'export'
                ? 'bg-blue-50 text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-500 hover:bg-gray-50'
            }`}
          >
            <Download size={18} />
            匯出
          </button>
          <button
            onClick={() => { setMode('import'); setResult(null); }}
            className={`flex-1 p-3 text-sm font-medium flex items-center justify-center gap-2 ${
              mode === 'import'
                ? 'bg-green-50 text-green-600 border-b-2 border-green-600'
                : 'text-gray-500 hover:bg-gray-50'
            }`}
          >
            <Upload size={18} />
            匯入
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {mode === 'export' ? (
            <>
              <p className="text-sm text-gray-600">
                將所有文件、向量區塊和對話記錄匯出為 JSON 檔案，可用於備份或遷移。
              </p>
              <button
                onClick={handleExport}
                disabled={isProcessing}
                className="w-full p-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isProcessing ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    匯出中...
                  </>
                ) : (
                  <>
                    <Download size={18} />
                    下載備份檔案
                  </>
                )}
              </button>
            </>
          ) : (
            <>
              <p className="text-sm text-gray-600">
                從 JSON 備份檔案還原知識庫。
              </p>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={clearExisting}
                  onChange={(e) => setClearExisting(e.target.checked)}
                  className="accent-red-600"
                />
                <span className="text-red-600">清空現有資料後再匯入</span>
              </label>

              <label className="flex flex-col items-center justify-center h-32 border-2 border-dashed border-gray-200 rounded-xl cursor-pointer hover:bg-gray-50 hover:border-green-300 transition-colors">
                {isProcessing ? (
                  <div className="flex items-center gap-2 text-gray-500">
                    <Loader2 size={24} className="animate-spin" />
                    匯入中...
                  </div>
                ) : (
                  <>
                    <Upload size={32} className="text-gray-400 mb-2" />
                    <span className="text-sm text-gray-500">點擊選擇備份檔案 (.json)</span>
                  </>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json"
                  className="hidden"
                  onChange={handleImport}
                  disabled={isProcessing}
                />
              </label>
            </>
          )}

          {/* Result Message */}
          {result && (
            <div className={`p-3 rounded-lg flex items-start gap-2 ${
              result.type === 'success'
                ? 'bg-green-50 text-green-700'
                : 'bg-red-50 text-red-700'
            }`}>
              {result.type === 'success' ? (
                <CheckCircle size={18} className="shrink-0 mt-0.5" />
              ) : (
                <AlertCircle size={18} className="shrink-0 mt-0.5" />
              )}
              <span className="text-sm">{result.message}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t bg-gray-50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded-lg"
          >
            關閉
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExportImportModal;
