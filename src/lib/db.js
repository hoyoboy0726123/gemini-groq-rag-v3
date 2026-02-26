import { openDB } from 'idb';

const DB_NAME = 'GeminiRAG_DB_V2';
const DB_VERSION = 3;

export const initDB = async () => {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion, newVersion, transaction) {
      // Documents store
      if (!db.objectStoreNames.contains('documents')) {
        db.createObjectStore('documents', { keyPath: 'id', autoIncrement: true });
      }

      // Chunks store
      if (!db.objectStoreNames.contains('chunks')) {
        const chunkStore = db.createObjectStore('chunks', { keyPath: 'id', autoIncrement: true });
        chunkStore.createIndex('docId', 'docId', { unique: false });
      }

      // Chat history store (V2 新增)
      if (!db.objectStoreNames.contains('chatHistory')) {
        const chatStore = db.createObjectStore('chatHistory', { keyPath: 'id', autoIncrement: true });
        chatStore.createIndex('timestamp', 'timestamp', { unique: false });
      }

      // Settings store (V2 新增)
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }

      // Migration for older versions
      if (oldVersion < 2) {
        try {
          const docStore = transaction.objectStore('documents');
          docStore.openCursor().then(function cursorIterate(cursor) {
            if (!cursor) return;
            const doc = cursor.value;
            if (!doc.category) {
              doc.category = '未分類';
              cursor.update(doc);
            }
            cursor.continue().then(cursorIterate);
          });
        } catch (e) {
          console.warn('Migration skipped:', e);
        }
      }
    },
  });
};

// ==================== Documents ====================

export const saveDocument = async (name, category = '未分類', chunks) => {
  const db = await initDB();
  const tx = db.transaction(['documents', 'chunks'], 'readwrite');

  const docId = await tx.objectStore('documents').add({
    name,
    category,
    timestamp: new Date(),
    chunkCount: chunks.length,
    embeddingDimension: chunks[0]?.embedding?.length || 0
  });

  const chunkStore = tx.objectStore('chunks');
  for (const chunk of chunks) {
    await chunkStore.add({
      docId,
      content: chunk.content,
      embedding: chunk.embedding,
      metadata: chunk.metadata
    });
  }

  await tx.done;
  return docId;
};

export const getAllDocuments = async () => {
  const db = await initDB();
  return db.getAll('documents');
};

export const deleteDocument = async (docId) => {
  const db = await initDB();
  const tx = db.transaction(['documents', 'chunks'], 'readwrite');

  await tx.objectStore('documents').delete(docId);

  const chunkStore = tx.objectStore('chunks');
  const index = chunkStore.index('docId');
  let cursor = await index.openCursor(IDBKeyRange.only(docId));

  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }

  await tx.done;
};

export const deleteCategory = async (categoryName) => {
  const db = await initDB();
  const allDocs = await db.getAll('documents');
  const targetDocs = allDocs.filter(d => (d.category || '未分類') === categoryName);

  for (const doc of targetDocs) {
    await deleteDocument(doc.id);
  }
};

export const updateCategory = async (oldName, newName) => {
  const db = await initDB();
  const tx = db.transaction('documents', 'readwrite');
  const store = tx.objectStore('documents');

  let cursor = await store.openCursor();
  while (cursor) {
    const doc = cursor.value;
    if ((doc.category || '未分類') === oldName) {
      doc.category = newName;
      cursor.update(doc);
    }
    cursor = await cursor.continue();
  }
  await tx.done;
};

// ==================== Search ====================

export const searchChunks = async (queryEmbedding, filterDocIds = null, limit = 5) => {
  const db = await initDB();
  let chunks = await db.getAll('chunks');

  // Filter by docIds if provided
  if (filterDocIds && filterDocIds.length > 0) {
    chunks = chunks.filter(chunk => filterDocIds.includes(chunk.docId));
  }

  // 計算相似度並排序
  const results = chunks.map(chunk => ({
    ...chunk,
    similarity: cosineSimilarity(queryEmbedding, chunk.embedding)
  }));

  return results
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
};

// 向量數學：餘弦相似度
function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// ==================== Chat History (V2 新增) ====================

export const saveChatMessage = async (message) => {
  const db = await initDB();
  return db.add('chatHistory', {
    ...message,
    timestamp: new Date()
  });
};

export const getChatHistory = async (limit = 100) => {
  const db = await initDB();
  const all = await db.getAll('chatHistory');
  return all.sort((a, b) => a.timestamp - b.timestamp).slice(-limit);
};

export const clearChatHistory = async () => {
  const db = await initDB();
  const tx = db.transaction('chatHistory', 'readwrite');
  await tx.objectStore('chatHistory').clear();
  await tx.done;
};

// ==================== Settings ====================

export const saveSetting = async (key, value) => {
  const db = await initDB();
  return db.put('settings', { key, value });
};

export const getSetting = async (key, defaultValue = null) => {
  const db = await initDB();
  const result = await db.get('settings', key);
  return result?.value ?? defaultValue;
};

// ==================== Export / Import (V2 新增) ====================

export const exportKnowledgeBase = async () => {
  const db = await initDB();
  const documents = await db.getAll('documents');
  const chunks = await db.getAll('chunks');
  const chatHistory = await db.getAll('chatHistory');
  const settings = await db.getAll('settings');

  const exportData = {
    version: 2,
    exportDate: new Date().toISOString(),
    data: {
      documents,
      chunks,
      chatHistory,
      settings
    }
  };

  return exportData;
};

export const importKnowledgeBase = async (importData, options = { clearExisting: false }) => {
  if (!importData?.data) {
    throw new Error('無效的匯入資料格式');
  }

  const db = await initDB();

  if (options.clearExisting) {
    await clearAllData();
  }

  const tx = db.transaction(['documents', 'chunks', 'chatHistory', 'settings'], 'readwrite');

  // Import documents and chunks with ID mapping
  const idMap = {};
  for (const doc of importData.data.documents || []) {
    const oldId = doc.id;
    delete doc.id; // 讓 IndexedDB 自動生成新 ID
    const newId = await tx.objectStore('documents').add(doc);
    idMap[oldId] = newId;
  }

  for (const chunk of importData.data.chunks || []) {
    delete chunk.id;
    chunk.docId = idMap[chunk.docId] || chunk.docId;
    await tx.objectStore('chunks').add(chunk);
  }

  // Import chat history
  for (const msg of importData.data.chatHistory || []) {
    delete msg.id;
    await tx.objectStore('chatHistory').add(msg);
  }

  // Import settings
  for (const setting of importData.data.settings || []) {
    await tx.objectStore('settings').put(setting);
  }

  await tx.done;

  return {
    documentsImported: importData.data.documents?.length || 0,
    chunksImported: importData.data.chunks?.length || 0,
    messagesImported: importData.data.chatHistory?.length || 0
  };
};

// ==================== Clear All ====================

export const clearAllData = async () => {
  const db = await initDB();
  const tx = db.transaction(['documents', 'chunks', 'chatHistory'], 'readwrite');
  await tx.objectStore('documents').clear();
  await tx.objectStore('chunks').clear();
  await tx.objectStore('chatHistory').clear();
  await tx.done;
};

// ==================== Validation (V2 新增) ====================

export const validateEmbeddingDimension = async (expectedDim = 3072) => {
  const db = await initDB();
  const chunks = await db.getAll('chunks');

  if (chunks.length === 0) return { valid: true, count: 0 };

  const mismatch = chunks.find(c => c.embedding?.length !== expectedDim);
  if (mismatch) {
    return {
      valid: false,
      found: mismatch.embedding?.length,
      expected: expectedDim,
      count: chunks.length
    };
  }
  return { valid: true, count: chunks.length };
};

export const getStorageStats = async () => {
  const db = await initDB();
  const documents = await db.getAll('documents');
  const chunks = await db.getAll('chunks');
  const chatHistory = await db.getAll('chatHistory');

  // 估算存儲大小
  const estimateSize = (arr) => {
    return new Blob([JSON.stringify(arr)]).size;
  };

  return {
    documentCount: documents.length,
    chunkCount: chunks.length,
    messageCount: chatHistory.length,
    estimatedSize: {
      documents: estimateSize(documents),
      chunks: estimateSize(chunks),
      chatHistory: estimateSize(chatHistory),
      total: estimateSize(documents) + estimateSize(chunks) + estimateSize(chatHistory)
    }
  };
};
