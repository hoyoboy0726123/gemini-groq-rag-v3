import React, { useState, useEffect } from 'react';
import { X, Upload, FileText, Clock, ScanLine, Type } from 'lucide-react';
import { getDocumentStats } from '../../lib/pdf';

const UploadModal = ({ isOpen, onClose, onUpload, existingCategories }) => {
  const [file, setFile] = useState(null);
  const [fileStats, setFileStats] = useState(null);
  const [mode, setMode] = useState('existing');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setFile(null);
      setFileStats(null);
      setNewCategory('');
      if (existingCategories.length > 0) {
        setMode('existing');
        setSelectedCategory(existingCategories[0]);
      } else {
        setMode('new');
      }
    }
  }, [isOpen, existingCategories]);

  const handleFileSelect = async (e) => {
    const f = e.target.files?.[0];
    if (f) {
      setFile(f);
      setIsAnalyzing(true);
      try {
        const stats = await getDocumentStats(f);
        setFileStats(stats);
      } catch (err) {
        console.error('Failed to analyze PDF:', err);
      }
      setIsAnalyzing(false);
    }
  };

  const handleSubmit = () => {
    const category = mode === 'existing' ? selectedCategory : newCategory;
    if (!file || !category.trim()) {
      alert('請選擇檔案並設定分類');
      return;
    }
    onUpload(file, category);
    onClose();
  };

  const formatTime = (seconds) => {
    if (seconds < 60) return `${seconds} 秒`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins} 分 ${secs} 秒`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b flex justify-between items-center bg-slate-50">
          <h3 className="font-bold text-lg flex items-center gap-2">
            <Upload size={20} className="text-blue-600" />
            上傳知識庫
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* File Drop Zone */}
          <label className="flex flex-col items-center justify-center h-32 border-2 border-dashed border-gray-200 rounded-xl cursor-pointer hover:bg-gray-50 hover:border-blue-300 transition-colors">
            {file ? (
              <div className="text-center">
                <FileText size={24} className="mx-auto text-blue-600 mb-2" />
                <span className="text-sm font-medium text-gray-700">{file.name}</span>
                <span className="text-xs text-gray-500 block mt-1">
                  {(file.size / 1024 / 1024).toFixed(2)} MB
                </span>
              </div>
            ) : (
              <div className="text-center text-gray-500">
                <Upload size={24} className="mx-auto mb-2" />
                <span className="text-sm">點擊或拖曳 PDF 檔案</span>
              </div>
            )}
            <input
              type="file"
              className="hidden"
              accept=".pdf"
              onChange={handleFileSelect}
            />
          </label>

          {/* File Stats */}
          {isAnalyzing && (
            <div className="text-center text-sm text-gray-500">
              分析文件中...
            </div>
          )}
          {fileStats && (
            <div className="space-y-2">
              {/* OCR Badge */}
              {fileStats.needsOCR ? (
                <div className="bg-amber-50 border border-amber-200 p-3 rounded-lg">
                  <div className="flex items-center gap-2 text-amber-700 font-medium mb-1">
                    <ScanLine size={16} />
                    <span>圖片型 PDF - 自動 OCR</span>
                  </div>
                  <p className="text-xs text-amber-600">
                    此 PDF 為掃描版或圖片型文件，將自動使用 Groq Vision AI 逐頁進行 OCR 文字識別。
                  </p>
                </div>
              ) : (
                <div className="bg-green-50 border border-green-200 p-2 rounded-lg flex items-center gap-2 text-green-700 text-sm">
                  <Type size={16} />
                  <span>文字型 PDF - 直接提取</span>
                </div>
              )}

              {/* Stats */}
              <div className="bg-blue-50 p-3 rounded-lg text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-gray-600">頁數：</span>
                  <span className="font-medium">{fileStats.pages} 頁</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">預估區塊：</span>
                  <span className="font-medium">{fileStats.estimatedChunks} 個</span>
                </div>
                {fileStats.needsOCR && (
                  <div className="flex justify-between text-amber-600">
                    <span>OCR 頁數：</span>
                    <span className="font-medium">{fileStats.pages} 頁（自動處理）</span>
                  </div>
                )}
                <div className="flex justify-between items-center text-orange-600">
                  <span className="flex items-center gap-1">
                    <Clock size={14} />
                    預估時間：
                  </span>
                  <span className="font-medium">{formatTime(fileStats.estimatedTime)}</span>
                </div>
              </div>
            </div>
          )}

          {/* Category Selection */}
          <div className="space-y-2">
            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-1 cursor-pointer">
                <input
                  type="radio"
                  checked={mode === 'existing'}
                  onChange={() => setMode('existing')}
                  disabled={existingCategories.length === 0}
                  className="accent-blue-600"
                />
                <span className={existingCategories.length === 0 ? 'text-gray-400' : ''}>
                  現有分類
                </span>
              </label>
              <label className="flex items-center gap-1 cursor-pointer">
                <input
                  type="radio"
                  checked={mode === 'new'}
                  onChange={() => setMode('new')}
                  className="accent-blue-600"
                />
                新分類
              </label>
            </div>

            {mode === 'existing' ? (
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              >
                {existingCategories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                placeholder="輸入新分類名稱"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t bg-gray-50 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={!file}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            開始處理
          </button>
        </div>
      </div>
    </div>
  );
};

export default UploadModal;
