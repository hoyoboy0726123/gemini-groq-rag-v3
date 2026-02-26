import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  X,
  Upload,
  Trash2,
  FileSearch,
  Send,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Camera,
  Zap,
  Eye,
  Layers,
  Check,
  AlertTriangle
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import * as pdfjsLib from 'pdfjs-dist';
import { chatWithPDFPages, batchAnalyzePDFPages, calculateImagesSize } from '../../lib/groq';

const PDFPageAnalyzer = ({ isOpen, onClose }) => {
  const [file, setFile] = useState(null);
  const [pdfDoc, setPdfDoc] = useState(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPreviewPage, setCurrentPreviewPage] = useState(1);

  // 多頁選擇
  const [selectedPages, setSelectedPages] = useState([]); // [1, 2, 3]
  const [pageImages, setPageImages] = useState({}); // { 1: base64, 2: base64, ... }

  const [chatHistory, setChatHistory] = useState([]);
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [batchProgress, setBatchProgress] = useState(null); // { stage, current, total, message }

  const canvasRef = useRef(null);
  const scrollRef = useRef(null);

  // Reset on close
  useEffect(() => {
    if (!isOpen) {
      setFile(null);
      setPdfDoc(null);
      setSelectedPages([]);
      setPageImages({});
      setChatHistory([]);
      setCurrentPreviewPage(1);
      setNumPages(0);
    }
  }, [isOpen]);

  // Scroll to bottom on new message
  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory]);

  // Render preview page
  const renderPreviewPage = useCallback(async (num) => {
    if (!pdfDoc || !canvasRef.current) return;

    const page = await pdfDoc.getPage(num);
    const viewport = page.getViewport({ scale: 1.2 });
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    canvas.height = viewport.height;
    canvas.width = viewport.width;

    await page.render({ canvasContext: context, viewport }).promise;
  }, [pdfDoc]);

  // Re-render preview when page changes
  useEffect(() => {
    if (pdfDoc) {
      renderPreviewPage(currentPreviewPage);
    }
  }, [pdfDoc, currentPreviewPage, renderPreviewPage]);

  // Capture a page as base64 (JPEG with compression to stay under limits)
  const capturePage = async (pageNum, maxSizeKB = 800) => {
    if (!pdfDoc) return null;

    const page = await pdfDoc.getPage(pageNum);

    // Start with scale 1.5 for balance of quality and size
    let scale = 1.5;
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.height = viewport.height;
    canvas.width = viewport.width;

    await page.render({ canvasContext: context, viewport }).promise;

    // Use JPEG format with compression
    let quality = 0.85;
    let dataUrl = canvas.toDataURL('image/jpeg', quality);

    // Compress if needed (target: maxSizeKB per image)
    // Base64 is ~33% larger than binary, so check accordingly
    while (dataUrl.length > maxSizeKB * 1024 * 1.33 && quality > 0.3) {
      quality -= 0.1;
      dataUrl = canvas.toDataURL('image/jpeg', quality);
    }

    // If still too large, reduce scale and try again
    if (dataUrl.length > maxSizeKB * 1024 * 1.33 && scale > 1.0) {
      const smallerViewport = page.getViewport({ scale: 1.0 });
      canvas.height = smallerViewport.height;
      canvas.width = smallerViewport.width;
      await page.render({ canvasContext: context, viewport: smallerViewport }).promise;
      dataUrl = canvas.toDataURL('image/jpeg', 0.7);
    }

    return dataUrl.split(',')[1];
  };

  // Toggle page selection
  const togglePageSelection = async (pageNum) => {
    if (selectedPages.includes(pageNum)) {
      // Remove page
      setSelectedPages(prev => prev.filter(p => p !== pageNum));
      setPageImages(prev => {
        const newImages = { ...prev };
        delete newImages[pageNum];
        return newImages;
      });
    } else {
      // Add page (no limit - batch mode handles large selections)
      setIsCapturing(true);
      const base64 = await capturePage(pageNum);
      if (base64) {
        setSelectedPages(prev => [...prev, pageNum].sort((a, b) => a - b));
        setPageImages(prev => ({ ...prev, [pageNum]: base64 }));
      }
      setIsCapturing(false);
    }
  };

  // Select range of pages (no limit - batch mode handles large selections)
  const selectPageRange = async (start, end) => {
    const pagesToAdd = [];
    for (let i = start; i <= end; i++) {
      if (!selectedPages.includes(i) && i <= numPages) {
        pagesToAdd.push(i);
      }
    }

    setIsCapturing(true);
    const newImages = { ...pageImages };
    for (const pageNum of pagesToAdd) {
      const base64 = await capturePage(pageNum);
      if (base64) {
        newImages[pageNum] = base64;
      }
    }
    setPageImages(newImages);
    setSelectedPages(prev => [...prev, ...pagesToAdd].sort((a, b) => a - b));
    setIsCapturing(false);
  };

  // Handle file upload
  const handleFileChange = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;

    setFile(f);
    setSelectedPages([]);
    setPageImages({});
    setChatHistory([]);

    try {
      const arrayBuffer = await f.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      setPdfDoc(pdf);
      setNumPages(pdf.numPages);
      setCurrentPreviewPage(1);
    } catch (err) {
      console.error('Failed to load PDF:', err);
    }
  };

  // 計算當前選擇的總大小
  const totalSizeMB = Object.values(pageImages).reduce((s, b) => s + (b?.length || 0), 0) / 1024 / 1024;
  // 批量模式條件：超過 3MB 或 超過 5 頁（Groq API 限制每次最多 5 張圖）
  const needsBatchMode = totalSizeMB > 3.0 || selectedPages.length > 5;

  // Handle send message
  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim() || selectedPages.length === 0 || isProcessing) return;

    const msg = input;
    setInput('');

    // Add user message with page info
    const userContent = selectedPages.length > 1
      ? `[分析頁面 ${selectedPages.join(', ')}]${needsBatchMode ? ' (批量模式)' : ''}\n${msg}`
      : msg;
    setChatHistory(prev => [...prev, { role: 'user', content: userContent }]);

    setIsProcessing(true);
    setBatchProgress(null);

    try {
      // Prepare images array (using JPEG for smaller size)
      const images = selectedPages.map(pageNum => ({
        pageNum,
        base64: pageImages[pageNum],
        mimeType: 'image/jpeg'
      }));

      let response;

      if (needsBatchMode) {
        // 使用批量分析模式
        const result = await batchAnalyzePDFPages(images, msg, chatHistory, (progress) => {
          setBatchProgress(progress);
        });
        response = result.response;
      } else {
        // 使用普通模式
        response = await chatWithPDFPages(images, msg, chatHistory);
      }

      setChatHistory(prev => [...prev, { role: 'assistant', content: response }]);
    } catch (err) {
      setChatHistory(prev => [...prev, {
        role: 'assistant',
        content: `錯誤: ${err.message}`
      }]);
    } finally {
      setIsProcessing(false);
      setBatchProgress(null);
    }
  };

  // Quick prompts
  const quickPrompts = [
    '請描述這些頁面的內容',
    '整理這些頁面的重點',
    '比較這些頁面的差異',
    '將內容整理成表格'
  ];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900 z-50 flex flex-col">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-800 to-indigo-800 p-4 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-white/20 rounded-lg">
            <Layers className="text-white" size={24} />
          </div>
          <div>
            <h2 className="text-white font-bold">PDF 多頁視覺分析</h2>
            <p className="text-purple-200 text-xs">
              Llama 4 Scout Vision | 支援批量智能分析
            </p>
          </div>
        </div>
        <button onClick={onClose} className="text-white/70 hover:text-white">
          <X size={28} />
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* PDF Panel */}
        <div className="w-[50%] bg-slate-900 border-r border-slate-700 flex flex-col">
          {!file ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8">
              <label className="cursor-pointer flex flex-col items-center justify-center w-full h-64 border-2 border-dashed border-slate-600 rounded-2xl hover:border-purple-500 text-slate-300 transition-colors">
                <Upload size={48} className="mb-4" />
                <span className="text-lg mb-2">上傳 PDF</span>
                <span className="text-xs text-slate-500">選擇多頁進行視覺分析</span>
                <input type="file" accept=".pdf" className="hidden" onChange={handleFileChange} />
              </label>

              {/* Info Card */}
              <div className="mt-8 p-4 bg-slate-800/50 rounded-xl max-w-sm">
                <h4 className="text-purple-400 text-sm font-medium mb-2 flex items-center gap-2">
                  <Layers size={14} />
                  智能多頁分析
                </h4>
                <ul className="text-xs text-slate-400 space-y-1">
                  <li>• 無頁數限制，自動批量處理</li>
                  <li>• ≤5 頁：直接視覺分析</li>
                  <li>• &gt;5 頁：自動分批整合</li>
                  <li>• 適合跨頁表格、連續段落</li>
                  <li>• 點擊頁碼選擇/取消選擇</li>
                </ul>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col h-full">
              {/* Page Controls */}
              <div className="p-3 bg-slate-800 border-b border-slate-700">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-slate-200 text-sm truncate max-w-[150px]" title={file.name}>
                    {file.name}
                  </span>
                  <div className="flex items-center gap-2">
                    {isCapturing && (
                      <span className="text-purple-400 text-xs flex items-center gap-1">
                        <Camera size={12} className="animate-pulse" />
                        截圖中...
                      </span>
                    )}
                    <button
                      onClick={() => { setFile(null); setPdfDoc(null); setSelectedPages([]); setPageImages({}); }}
                      className="text-slate-400 hover:text-red-400 p-1"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>

                {/* Page Selection Grid */}
                <div className="flex flex-wrap gap-1 mb-2">
                  {Array.from({ length: numPages }, (_, i) => i + 1).map(pageNum => (
                    <button
                      key={pageNum}
                      onClick={() => togglePageSelection(pageNum)}
                      onMouseEnter={() => setCurrentPreviewPage(pageNum)}
                      disabled={isCapturing}
                      className={`w-8 h-8 rounded text-xs font-medium transition-all ${
                        selectedPages.includes(pageNum)
                          ? 'bg-purple-600 text-white'
                          : currentPreviewPage === pageNum
                          ? 'bg-slate-600 text-white'
                          : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                      } ${isCapturing ? 'opacity-50' : ''}`}
                    >
                      {selectedPages.includes(pageNum) ? (
                        <Check size={14} className="mx-auto" />
                      ) : (
                        pageNum
                      )}
                    </button>
                  ))}
                </div>

                {/* Selection Info */}
                <div className="flex justify-between items-center text-xs">
                  <div className="text-slate-400">
                    <span>
                      已選擇: <span className="text-purple-400 font-medium">{selectedPages.length}</span> 頁
                    </span>
                    {selectedPages.length > 0 && (
                      <>
                        <span className="ml-2 text-slate-500">
                          ({selectedPages.join(', ')})
                        </span>
                        {/* Show estimated size with mode hint */}
                        <span className={`ml-2 ${needsBatchMode ? 'text-blue-400' : 'text-green-400'}`}>
                          ~{totalSizeMB.toFixed(1)}MB
                          {needsBatchMode && ' (批量)'}
                        </span>
                      </>
                    )}
                  </div>
                  {selectedPages.length > 0 && (
                    <button
                      onClick={() => { setSelectedPages([]); setPageImages({}); }}
                      className="text-slate-500 hover:text-red-400"
                    >
                      清除選擇
                    </button>
                  )}
                </div>

                {/* Quick Select */}
                {numPages > 1 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      onClick={() => selectPageRange(1, Math.min(5, numPages))}
                      disabled={isCapturing}
                      className="text-xs px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-slate-300"
                    >
                      前 5 頁
                    </button>
                    {numPages > 5 && (
                      <button
                        onClick={() => selectPageRange(1, Math.min(10, numPages))}
                        disabled={isCapturing}
                        className="text-xs px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-slate-300"
                      >
                        前 10 頁
                      </button>
                    )}
                    <button
                      onClick={() => selectPageRange(1, numPages)}
                      disabled={isCapturing}
                      className="text-xs px-2 py-1 bg-purple-700 hover:bg-purple-600 rounded text-slate-200"
                    >
                      全選 ({numPages} 頁)
                    </button>
                    {currentPreviewPage > 1 && (
                      <button
                        onClick={() => selectPageRange(
                          Math.max(1, currentPreviewPage - 1),
                          Math.min(numPages, currentPreviewPage + 2)
                        )}
                        disabled={isCapturing}
                        className="text-xs px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-slate-300"
                      >
                        當前頁附近
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Preview Navigation */}
              <div className="flex items-center justify-center gap-4 p-2 bg-slate-800/50">
                <button
                  onClick={() => setCurrentPreviewPage(p => Math.max(1, p - 1))}
                  disabled={currentPreviewPage <= 1}
                  className="p-1 disabled:opacity-30 text-slate-400 hover:text-white"
                >
                  <ChevronLeft size={20} />
                </button>
                <span className="text-sm text-slate-400">
                  預覽: {currentPreviewPage} / {numPages}
                </span>
                <button
                  onClick={() => setCurrentPreviewPage(p => Math.min(numPages, p + 1))}
                  disabled={currentPreviewPage >= numPages}
                  className="p-1 disabled:opacity-30 text-slate-400 hover:text-white"
                >
                  <ChevronRight size={20} />
                </button>
              </div>

              {/* Canvas Display */}
              <div className="flex-1 overflow-auto bg-slate-800/30 p-4 flex justify-center items-start">
                <canvas
                  ref={canvasRef}
                  className="shadow-2xl max-w-full border border-slate-600 rounded"
                />
              </div>
            </div>
          )}
        </div>

        {/* Chat Panel */}
        <div className="w-[50%] flex flex-col bg-slate-50">
          {file ? (
            <>
              {/* Selected Pages Warning */}
              {selectedPages.length === 0 && (
                <div className="p-3 bg-amber-50 border-b border-amber-200 flex items-center gap-2 text-amber-700 text-sm">
                  <AlertTriangle size={16} />
                  請先選擇要分析的頁面（點擊頁碼）
                </div>
              )}

              {/* Batch Mode Indicator */}
              {needsBatchMode && selectedPages.length > 0 && (
                <div className="p-3 bg-blue-50 border-b border-blue-200 text-sm">
                  <div className="flex items-center gap-2 text-blue-700 font-medium">
                    <Layers size={16} />
                    將啟用「批量分析模式」
                  </div>
                  <p className="text-blue-600 text-xs mt-1">
                    {selectedPages.length > 5
                      ? `已選擇 ${selectedPages.length} 頁（超過單次 5 頁限制）`
                      : `圖片總大小 ${totalSizeMB.toFixed(1)}MB（超過單次 3MB 限制）`
                    }，系統將自動分批處理後整合結果。
                  </p>
                </div>
              )}

              {/* Chat Messages */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {chatHistory.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center">
                    <Layers size={48} className="text-purple-300 mb-4" />
                    <p className="text-slate-500 text-center mb-6">
                      選擇頁面後，詢問關於這些頁面的問題
                    </p>

                    {/* Quick Prompts */}
                    <div className="space-y-2 w-full max-w-sm">
                      <p className="text-xs text-slate-400 text-center mb-2">快速提問</p>
                      {quickPrompts.map((prompt, i) => (
                        <button
                          key={i}
                          onClick={() => setInput(prompt)}
                          disabled={selectedPages.length === 0}
                          className="w-full p-2 text-sm text-left bg-white border border-slate-200 rounded-lg hover:bg-purple-50 hover:border-purple-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {prompt}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  chatHistory.map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[90%] p-4 rounded-2xl ${
                        msg.role === 'user'
                          ? 'bg-purple-600 text-white'
                          : 'bg-white border border-slate-200 shadow-sm'
                      }`}>
                        {msg.role === 'user' ? (
                          <p className="whitespace-pre-wrap">{msg.content}</p>
                        ) : (
                          <div className="prose prose-sm max-w-none">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {msg.content}
                            </ReactMarkdown>
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}

                {/* Processing Indicator */}
                {isProcessing && (
                  <div className="flex justify-start">
                    <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-sm min-w-[200px]">
                      <div className="flex items-center gap-2 text-purple-600 mb-2">
                        <Loader2 size={16} className="animate-spin" />
                        <span className="text-sm font-medium">
                          {batchProgress ? '批量分析中...' : `分析 ${selectedPages.length} 頁中...`}
                        </span>
                      </div>
                      {batchProgress && (
                        <div className="space-y-2">
                          <p className="text-xs text-slate-600">{batchProgress.message}</p>
                          {batchProgress.stage === 'batch' && (
                            <div className="w-full bg-slate-200 rounded-full h-2">
                              <div
                                className="bg-purple-600 h-2 rounded-full transition-all"
                                style={{ width: `${(batchProgress.current / batchProgress.totalBatches) * 100}%` }}
                              />
                            </div>
                          )}
                          {batchProgress.stage === 'synthesize' && (
                            <div className="w-full bg-slate-200 rounded-full h-2">
                              <div className="bg-green-500 h-2 rounded-full w-full animate-pulse" />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div ref={scrollRef} />
              </div>

              {/* Input Area */}
              <div className="p-4 bg-white border-t">
                <form onSubmit={handleSend} className="flex gap-2">
                  <input
                    type="text"
                    placeholder={selectedPages.length > 0
                      ? `詢問關於第 ${selectedPages.join(', ')} 頁的問題...`
                      : '請先選擇頁面'
                    }
                    className="flex-1 p-3 bg-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-purple-500"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    disabled={isProcessing || selectedPages.length === 0}
                  />
                  <button
                    type="submit"
                    disabled={isProcessing || !input.trim() || selectedPages.length === 0}
                    className="p-3 bg-purple-600 text-white rounded-xl hover:bg-purple-700 disabled:opacity-50"
                  >
                    <Send size={18} />
                  </button>
                </form>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-slate-400">
              <div className="text-center">
                <FileSearch size={48} className="mx-auto mb-4 opacity-50" />
                <p>請先上傳 PDF 文件</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PDFPageAnalyzer;
