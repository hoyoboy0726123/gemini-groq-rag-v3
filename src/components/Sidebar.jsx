import React from 'react';
import {
  BookOpen,
  Trash2,
  Edit2,
  FolderOpen,
  FileText,
  Settings,
  Download,
  HardDrive,
  Eye,
  Zap,
  Database
} from 'lucide-react';

const Sidebar = ({
  groupedDocs,
  selectedCategories,
  setSelectedCategories,
  expandedCategories,
  setExpandedCategories,
  similarityThreshold,
  setSimilarityThreshold,
  onDeleteDoc,
  onDeleteCategory,
  onRenameCategory,
  onClearAll,
  onUploadClick,
  onPageAnalyzerClick,
  onTechSpecsClick,
  onExportImportClick,
  storageStats
}) => {
  const toggleCategory = (cat) => {
    setExpandedCategories(prev => ({ ...prev, [cat]: !prev[cat] }));
  };

  const toggleCategorySelection = (cat) => {
    setSelectedCategories(prev =>
      prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
    );
  };

  const formatBytes = (bytes) => {
    if (!bytes) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  };

  return (
    <aside className="w-80 bg-gradient-to-b from-slate-900 to-purple-950 text-white flex flex-col shadow-2xl border-r border-slate-800">
      {/* Header */}
      <div className="p-6 border-b border-slate-700/50 flex items-center gap-3">
        <div className="p-2 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg">
          <BookOpen className="text-white" size={20} />
        </div>
        <div>
          <span className="font-bold text-lg">RAG 知識庫</span>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Database size={10} />
            <span>Gemini</span>
            <span>+</span>
            <Zap size={10} />
            <span>Groq</span>
          </div>
        </div>
        <span className="ml-auto text-xs bg-purple-600 px-2 py-0.5 rounded">V3</span>
      </div>

      {/* Category List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
        <div className="flex justify-between items-center px-2 text-xs font-semibold text-slate-400">
          <span>分類清單</span>
          <button
            onClick={onClearAll}
            className="text-slate-500 hover:text-red-400 transition-colors"
            title="清空所有資料"
          >
            <Trash2 size={14} />
          </button>
        </div>

        <div className="space-y-2">
          {Object.entries(groupedDocs).map(([cat, docs]) => (
            <div key={cat} className="space-y-1">
              {/* Category Header */}
              <div className="flex items-center gap-2 text-sm bg-slate-800/50 p-2 rounded-lg group hover:bg-slate-800 transition-colors">
                <input
                  type="checkbox"
                  checked={selectedCategories.includes(cat)}
                  onChange={() => toggleCategorySelection(cat)}
                  className="accent-purple-500"
                />
                <button
                  className="flex-1 text-left truncate flex items-center gap-2"
                  onClick={() => toggleCategory(cat)}
                >
                  <FolderOpen size={14} className="text-yellow-500" />
                  <span>{cat}</span>
                  <span className="text-xs text-slate-500">({docs.length})</span>
                </button>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => onRenameCategory(cat)}
                    className="text-slate-400 hover:text-white"
                    title="重新命名"
                  >
                    <Edit2 size={12} />
                  </button>
                  <button
                    onClick={() => onDeleteCategory(cat)}
                    className="text-slate-400 hover:text-red-400"
                    title="刪除分類"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>

              {/* Documents List */}
              {expandedCategories[cat] && (
                <div className="ml-4 pl-2 border-l border-slate-700 space-y-1">
                  {docs.map((d) => (
                    <div
                      key={d.id}
                      className="text-xs p-2 flex justify-between items-center group hover:bg-slate-800/30 rounded"
                    >
                      <span className="flex items-center gap-2 truncate">
                        <FileText size={12} className="text-slate-500" />
                        <span className="truncate" title={d.name}>{d.name}</span>
                      </span>
                      <button
                        onClick={() => onDeleteDoc(d.id, d.name)}
                        className="text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          {Object.keys(groupedDocs).length === 0 && (
            <div className="text-center text-slate-500 text-sm py-8">
              尚無文件，點擊下方新增
            </div>
          )}
        </div>
      </div>

      {/* Bottom Controls */}
      <div className="p-4 border-t border-slate-700/50 space-y-4 bg-slate-900/50">
        {/* Storage Stats */}
        {storageStats && (
          <div className="text-[10px] text-slate-500 flex items-center gap-2 bg-slate-800/50 p-2 rounded">
            <HardDrive size={12} />
            <span>{storageStats.chunkCount} 區塊</span>
            <span>|</span>
            <span>{formatBytes(storageStats.estimatedSize?.total)}</span>
          </div>
        )}

        {/* Similarity Threshold */}
        <div className="text-[10px] text-slate-500 space-y-1">
          <div className="flex justify-between">
            <span>相似度門檻</span>
            <span className="text-purple-400">{(similarityThreshold * 100).toFixed(0)}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={similarityThreshold}
            onChange={(e) => setSimilarityThreshold(parseFloat(e.target.value))}
            className="w-full h-1 accent-purple-500"
          />
        </div>

        {/* Page Analyzer Button */}
        <button
          onClick={onPageAnalyzerClick}
          className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 p-3 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2"
        >
          <Eye size={16} />
          PDF 頁面視覺分析
        </button>

        {/* Bottom Buttons */}
        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={onTechSpecsClick}
            className="bg-slate-800 hover:bg-slate-700 p-2 rounded-xl text-[10px] transition-colors flex items-center justify-center gap-1"
          >
            <Settings size={12} />
            技術
          </button>
          <button
            onClick={onExportImportClick}
            className="bg-slate-800 hover:bg-slate-700 p-2 rounded-xl text-[10px] transition-colors flex items-center justify-center gap-1"
          >
            <Download size={12} />
            備份
          </button>
          <button
            onClick={onUploadClick}
            className="bg-blue-600 hover:bg-blue-700 p-2 rounded-xl text-[10px] font-bold transition-colors"
          >
            新增文件
          </button>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
