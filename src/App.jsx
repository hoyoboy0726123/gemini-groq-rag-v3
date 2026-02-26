import React, { useState, useEffect, useMemo } from 'react';

// Gemini (Embedding only)
import { initGemini, verifyGeminiApiKey, getEmbedding, getEmbeddingsBatch } from './lib/gemini';

// Groq (Chat & Vision)
import { initGroq, verifyGroqApiKey, chatWithGroq, analyzeQueryIntent } from './lib/groq';

// PDF & DB (with OCR support)
import { parsePDFSmart } from './lib/pdf';
import {
  saveDocument,
  getAllDocuments,
  clearAllData,
  searchChunks,
  deleteDocument,
  deleteCategory,
  updateCategory,
  saveChatMessage,
  getChatHistory,
  clearChatHistory,
  getStorageStats
} from './lib/db';

// Components
import LoginScreen from './components/LoginScreen';
import Sidebar from './components/Sidebar';
import ChatPanel from './components/ChatPanel';
import UploadModal from './components/Modals/UploadModal';
import TechSpecsModal from './components/Modals/TechSpecsModal';
import PDFPageAnalyzer from './components/Modals/PDFPageAnalyzer';
import ExportImportModal from './components/Modals/ExportImportModal';

export default function App() {
  // Auth State
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationStep, setVerificationStep] = useState(''); // 'gemini' | 'groq'
  const [groqApiKey, setGroqApiKey] = useState(''); // 保存用於 OCR

  // Documents State
  const [documents, setDocuments] = useState([]);
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [expandedCategories, setExpandedCategories] = useState({});

  // Chat State
  const [chatHistory, setChatHistory] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [lastChunks, setLastChunks] = useState([]);

  // UI State
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState({ type: 'info', message: '' });
  const [similarityThreshold, setSimilarityThreshold] = useState(0.25);
  const [storageStats, setStorageStats] = useState(null);

  // Modal State
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showTechSpecs, setShowTechSpecs] = useState(false);
  const [showPageAnalyzer, setShowPageAnalyzer] = useState(false);
  const [showExportImport, setShowExportImport] = useState(false);

  // Load data on auth
  useEffect(() => {
    if (isAuthorized) {
      loadDocs();
      loadChatHistory();
      loadStorageStats();
    }
  }, [isAuthorized]);

  // Grouped documents
  const groupedDocs = useMemo(() => {
    const groups = {};
    documents.forEach(doc => {
      const cat = doc.category || '未分類';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(doc);
    });
    return groups;
  }, [documents]);

  const categoryList = Object.keys(groupedDocs);

  // Data loading functions
  const loadDocs = async () => {
    const docs = await getAllDocuments();
    setDocuments(docs);
  };

  const loadChatHistory = async () => {
    const history = await getChatHistory();
    setChatHistory(history.map(h => ({ role: h.role, content: h.content })));
  };

  const loadStorageStats = async () => {
    const stats = await getStorageStats();
    setStorageStats(stats);
  };

  // Auth handler - verify both API keys
  const handleStart = async (geminiKey, groqKey) => {
    setIsVerifying(true);

    try {
      // Step 1: Verify Gemini
      setVerificationStep('gemini');
      setStatus({ type: 'info', message: '驗證 Gemini API Key...' });
      await verifyGeminiApiKey(geminiKey);
      initGemini(geminiKey);

      // Step 2: Verify Groq
      setVerificationStep('groq');
      setStatus({ type: 'info', message: '驗證 Groq API Key...' });
      await verifyGroqApiKey(groqKey);
      initGroq(groqKey);
      setGroqApiKey(groqKey); // 保存用於 OCR

      // Success
      setStatus({ type: 'success', message: '驗證成功！' });
      setIsAuthorized(true);

    } catch (err) {
      setStatus({ type: 'error', message: err.message });
    } finally {
      setIsVerifying(false);
      setVerificationStep('');
    }
  };

  // Upload handler (with OCR support)
  const handleUploadProcess = async (file, category) => {
    setIsProcessing(true);

    try {
      setStatus({ type: 'info', message: '偵測 PDF 類型...' });

      // 使用智能解析（自動偵測並啟用 OCR）
      const result = await parsePDFSmart(file, groqApiKey, (progress) => {
        if (progress.stage === 'detecting') {
          setStatus({ type: 'info', message: progress.message });
        } else if (progress.stage === 'ocr_detected') {
          setStatus({ type: 'info', message: `偵測為圖片型 PDF，啟用 OCR...` });
        } else if (progress.stage === 'text_detected') {
          setStatus({ type: 'info', message: '偵測為文字型 PDF...' });
        } else if (progress.stage === 'parsing') {
          setStatus({ type: 'info', message: progress.message });
        } else if (progress.stage === 'ocr') {
          setStatus({ type: 'info', message: progress.message });
        } else if (progress.stage === 'ocr_start') {
          setStatus({ type: 'info', message: progress.message });
        }
      });

      const textChunks = result.chunks;

      if (textChunks.length === 0) {
        throw new Error('無法從 PDF 提取文字（文字層為空且 OCR 失敗）');
      }

      // 顯示統計
      const ocrInfo = result.stats.ocrUsed
        ? ` (OCR: ${result.stats.ocrPages} 頁)`
        : '';
      setStatus({ type: 'info', message: `使用 Gemini 向量化 ${textChunks.length} 個區塊${ocrInfo}...` });

      const embeddings = await getEmbeddingsBatch(
        textChunks,
        (progress) => {
          setStatus({ type: 'info', message: progress.message });
        }
      );

      const processed = textChunks.map((text, i) => ({
        content: text,
        embedding: embeddings[i],
        metadata: {
          fileName: file.name,
          ocrUsed: result.stats.ocrUsed
        }
      }));

      await saveDocument(file.name, category, processed);
      await loadDocs();
      await loadStorageStats();

      const successMsg = result.stats.ocrUsed
        ? `處理完成！共 ${processed.length} 個區塊 (OCR: ${result.stats.ocrPages} 頁)`
        : `處理完成！共 ${processed.length} 個區塊`;
      setStatus({ type: 'success', message: successMsg });

    } catch (err) {
      setStatus({ type: 'error', message: `錯誤: ${err.message}` });
    } finally {
      setIsProcessing(false);
    }
  };

  // Chat handler - uses Groq
  const handleSendMessage = async (message) => {
    if (!message.trim() || isProcessing) return;

    setInputMessage('');

    // Add user message
    const userMessage = { role: 'user', content: message };
    setChatHistory(prev => [...prev, userMessage]);
    await saveChatMessage(userMessage);

    setIsProcessing(true);
    setStatus({ type: 'info', message: 'Llama 4 處理中...' });

    try {
      // Analyze intent using Groq
      const intent = await analyzeQueryIntent(message, chatHistory);
      let chunks = lastChunks;

      if (intent.type === 'search') {
        // Get filter IDs
        const filterIds = selectedCategories.length > 0
          ? documents.filter(d => selectedCategories.includes(d.category)).map(d => d.id)
          : null;

        // Get embedding using Gemini
        setStatus({ type: 'info', message: '向量化查詢...' });
        const vec = await getEmbedding(intent.newQuery);
        const results = await searchChunks(vec, filterIds);

        // Check threshold
        if (!results[0] || results[0].similarity < similarityThreshold) {
          const noResultMsg = { role: 'assistant', content: '知識庫中無相關資訊。請嘗試換個問法或上傳相關文件。' };
          setChatHistory(prev => [...prev, noResultMsg]);
          await saveChatMessage(noResultMsg);
          setStatus({ type: 'info', message: '就緒' });
          setIsProcessing(false);
          return;
        }

        chunks = results;
        setLastChunks(results);
      }

      // Generate response using Groq
      setStatus({ type: 'info', message: 'Llama 4 生成回答...' });
      const aiResponse = await chatWithGroq(
        intent.newQuery || message,
        chunks,
        chatHistory
      );

      const assistantMessage = { role: 'assistant', content: aiResponse };
      setChatHistory(prev => [...prev, assistantMessage]);
      await saveChatMessage(assistantMessage);
      setStatus({ type: 'info', message: '就緒' });

    } catch (err) {
      const errorMessage = { role: 'assistant', content: `錯誤: ${err.message}` };
      setChatHistory(prev => [...prev, errorMessage]);
      setStatus({ type: 'error', message: err.message });
    } finally {
      setIsProcessing(false);
    }
  };

  // Clear chat handler
  const handleClearChat = async () => {
    if (!confirm('確定要清除所有對話記錄嗎？')) return;

    await clearChatHistory();
    setChatHistory([]);
    setLastChunks([]);
    setStatus({ type: 'info', message: '對話已清除' });
    await loadStorageStats();
  };

  // Document handlers
  const handleDeleteDoc = async (id, name) => {
    if (!confirm(`確定要刪除「${name}」嗎？`)) return;
    await deleteDocument(id);
    await loadDocs();
    await loadStorageStats();
  };

  const handleDeleteCategory = async (name) => {
    if (!confirm(`確定要刪除分類「${name}」及其所有文件嗎？`)) return;
    await deleteCategory(name);
    await loadDocs();
    await loadStorageStats();
  };

  const handleRenameCategory = async (oldName) => {
    const newName = prompt('請輸入新的分類名稱：', oldName);
    if (newName && newName !== oldName) {
      await updateCategory(oldName, newName);
      await loadDocs();
    }
  };

  const handleClearAll = async () => {
    if (!confirm('確定要清空所有資料嗎？此操作無法復原！')) return;
    await clearAllData();
    await loadDocs();
    setChatHistory([]);
    setLastChunks([]);
    await loadStorageStats();
    setStatus({ type: 'info', message: '已清空所有資料' });
  };

  // Import complete handler
  const handleImportComplete = async () => {
    await loadDocs();
    await loadChatHistory();
    await loadStorageStats();
  };

  // Login screen
  if (!isAuthorized) {
    return (
      <LoginScreen
        onStart={handleStart}
        isVerifying={isVerifying}
        verificationStep={verificationStep}
        status={status}
      />
    );
  }

  // Main app
  return (
    <div className="flex h-screen bg-white overflow-hidden font-sans">
      {/* Modals */}
      <UploadModal
        isOpen={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        onUpload={handleUploadProcess}
        existingCategories={categoryList}
      />
      <TechSpecsModal
        isOpen={showTechSpecs}
        onClose={() => setShowTechSpecs(false)}
        storageStats={storageStats}
      />
      <PDFPageAnalyzer
        isOpen={showPageAnalyzer}
        onClose={() => setShowPageAnalyzer(false)}
      />
      <ExportImportModal
        isOpen={showExportImport}
        onClose={() => setShowExportImport(false)}
        onImportComplete={handleImportComplete}
      />

      {/* Sidebar */}
      <Sidebar
        groupedDocs={groupedDocs}
        selectedCategories={selectedCategories}
        setSelectedCategories={setSelectedCategories}
        expandedCategories={expandedCategories}
        setExpandedCategories={setExpandedCategories}
        similarityThreshold={similarityThreshold}
        setSimilarityThreshold={setSimilarityThreshold}
        onDeleteDoc={handleDeleteDoc}
        onDeleteCategory={handleDeleteCategory}
        onRenameCategory={handleRenameCategory}
        onClearAll={handleClearAll}
        onUploadClick={() => setShowUploadModal(true)}
        onPageAnalyzerClick={() => setShowPageAnalyzer(true)}
        onTechSpecsClick={() => setShowTechSpecs(true)}
        onExportImportClick={() => setShowExportImport(true)}
        storageStats={storageStats}
      />

      {/* Chat Panel */}
      <ChatPanel
        chatHistory={chatHistory}
        inputMessage={inputMessage}
        setInputMessage={setInputMessage}
        isProcessing={isProcessing}
        status={status}
        onSendMessage={handleSendMessage}
        onClearChat={handleClearChat}
      />
    </div>
  );
}
