/**
 * Groq API Client for Llama 4 Scout Vision
 * 處理對話和圖像分析
 */

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';

let groqApiKey = null;

// 速率限制配置 (Groq Free Tier: 約 30 RPM)
const RATE_LIMIT = {
  minDelayMs: 2000,
  lastRequestTime: 0,
};

// 速率限制等待
const waitForRateLimit = async () => {
  const now = Date.now();
  const timeSinceLastRequest = now - RATE_LIMIT.lastRequestTime;
  if (timeSinceLastRequest < RATE_LIMIT.minDelayMs) {
    await new Promise(r => setTimeout(r, RATE_LIMIT.minDelayMs - timeSinceLastRequest));
  }
  RATE_LIMIT.lastRequestTime = Date.now();
};

// 初始化 Groq
export const initGroq = (apiKey) => {
  groqApiKey = apiKey;
};

// 驗證 Groq API Key
export const verifyGroqApiKey = async (apiKey) => {
  try {
    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        messages: [{ role: 'user', content: 'Hi' }],
        max_completion_tokens: 10,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'API Key 無效');
    }

    return true;
  } catch (error) {
    if (error.message.includes('API Key')) {
      throw error;
    }
    throw new Error('Groq API Key 驗證失敗: ' + error.message);
  }
};

// 基礎 API 調用
const callGroqAPI = async (messages, options = {}) => {
  if (!groqApiKey) throw new Error('Groq 未初始化，請先輸入 API Key');

  await waitForRateLimit();

  const response = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${groqApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: options.model || DEFAULT_MODEL,
      messages,
      temperature: options.temperature ?? 0.7,
      max_completion_tokens: options.maxTokens || 4096,
      top_p: options.topP ?? 1,
      stream: false,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Groq API 錯誤');
  }

  const data = await response.json();
  return data.choices[0]?.message?.content || '';
};

// RAG 對話功能
export const chatWithGroq = async (prompt, contextChunks, history = []) => {
  // 格式化上下文
  const contextText = contextChunks.map(c => `[參考資訊]: ${c.content}`).join('\n\n');

  // 格式化歷史
  const historyText = history.slice(-6).map(msg =>
    `${msg.role === 'user' ? 'User' : 'AI'}: ${msg.content}`
  ).join('\n');

  const systemPrompt = `你是一個專業的 RAG 知識庫助手。請根據以下提供的[參考資訊]與[對話歷史]來回答[使用者問題]。

規則：
1. 請優先依據[參考資訊]回答。
2. 如果參考資訊不足以回答，請明確告知「知識庫中無相關資訊」，不要編造。
3. 請使用 Markdown 格式回答，若有數據請整理成表格。
4. 回答要簡潔明瞭，直接切入重點。`;

  const userContent = `[對話歷史]:
${historyText}

[參考資訊]:
${contextText}

[使用者問題]:
${prompt}`;

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userContent }
  ];

  return await callGroqAPI(messages);
};

// 意圖分析（使用 Groq）
export const analyzeQueryIntent = async (query, history) => {
  const historyText = history.slice(-4).map(msg =>
    `${msg.role === 'user' ? 'User' : 'AI'}: ${msg.content}`
  ).join('\n');

  const systemPrompt = `You are a query intent analyzer. Analyze the user's query and determine:
1. If it needs document search ('search') or is general chat ('chat')
2. If 'search', rewrite the query to be standalone and specific.

Output JSON only: { "type": "search" | "chat", "newQuery": "..." }`;

  const userContent = `History:
${historyText}

User Query: "${query}"`;

  try {
    const result = await callGroqAPI([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent }
    ], { maxTokens: 256, temperature: 0.3 });

    // 解析 JSON
    const jsonStr = result.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(jsonStr);
  } catch (e) {
    console.error('Intent analysis failed:', e);
    return { type: 'search', newQuery: query };
  }
};

// 圖像分析功能（用於 PDF 頁面截圖）
export const analyzeImage = async (base64Image, prompt, mimeType = 'image/png') => {
  if (!groqApiKey) throw new Error('Groq 未初始化');

  await waitForRateLimit();

  const messages = [
    {
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        {
          type: 'image_url',
          image_url: {
            url: `data:${mimeType};base64,${base64Image}`
          }
        }
      ]
    }
  ];

  const response = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${groqApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      messages,
      temperature: 0.7,
      max_completion_tokens: 4096,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Groq Vision API 錯誤');
  }

  const data = await response.json();
  return data.choices[0]?.message?.content || '';
};

// PDF 頁面對話（帶歷史）
export const chatWithPDFPage = async (base64Image, prompt, history = [], mimeType = 'image/png') => {
  if (!groqApiKey) throw new Error('Groq 未初始化');

  await waitForRateLimit();

  // 構建消息歷史
  const messages = [];

  // 添加系統提示
  messages.push({
    role: 'system',
    content: `你是一個專業的文件分析助手。用戶會提供 PDF 頁面的截圖，請根據圖像內容回答問題。
規則：
1. 仔細分析圖像中的所有文字、圖表、表格內容。
2. 使用 Markdown 格式回答。
3. 如果圖像中有表格，請整理成 Markdown 表格格式。
4. 回答要基於圖像內容，不要編造。`
  });

  // 添加歷史消息（純文字）
  for (const msg of history.slice(-6)) {
    messages.push({
      role: msg.role === 'assistant' ? 'assistant' : 'user',
      content: msg.content
    });
  }

  // 添加當前帶圖像的請求
  messages.push({
    role: 'user',
    content: [
      { type: 'text', text: prompt },
      {
        type: 'image_url',
        image_url: {
          url: `data:${mimeType};base64,${base64Image}`
        }
      }
    ]
  });

  const response = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${groqApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      messages,
      temperature: 0.7,
      max_completion_tokens: 4096,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Groq Vision API 錯誤');
  }

  const data = await response.json();
  return data.choices[0]?.message?.content || '';
};

// 多頁 PDF 分析（最多 4 頁，保守設定）
// Groq 限制：Base64 請求總大小 4MB
export const chatWithPDFPages = async (images, prompt, history = []) => {
  if (!groqApiKey) throw new Error('Groq 未初始化');
  if (images.length === 0) throw new Error('請至少選擇一頁');
  if (images.length > 5) throw new Error('單次請求最多 5 頁，請使用批量分析模式');

  // 檢查總 payload 大小（Base64 限制 4MB）
  const totalSize = images.reduce((sum, img) => sum + (img.base64?.length || 0), 0);
  const estimatedMB = (totalSize / 1024 / 1024).toFixed(2);

  if (totalSize > 3.5 * 1024 * 1024) { // 預留空間給其他欄位
    throw new Error(`圖片總大小 ${estimatedMB}MB 超過限制（最大 3.5MB）。請減少頁數或選擇文字較多的頁面。`);
  }

  console.log(`[Groq Vision] 發送 ${images.length} 張圖片，總大小: ${estimatedMB}MB`);

  await waitForRateLimit();

  // 構建消息
  const messages = [];

  // 系統提示
  const pageInfo = images.map(img => `第 ${img.pageNum} 頁`).join('、');
  messages.push({
    role: 'system',
    content: `你是一個專業的 PDF 文件分析助手。用戶提供了 ${images.length} 張 PDF 頁面截圖（${pageInfo}）。

規則：
1. 仔細分析所有圖像中的文字、圖表、表格內容。
2. 如果內容跨頁，請整合分析。
3. 使用 Markdown 格式回答，表格請整理成 Markdown 表格。
4. 如需引用特定頁面，請標註頁碼。
5. 回答要基於圖像內容，不要編造。`
  });

  // 添加歷史消息（純文字，多頁模式減少歷史以節省 tokens）
  for (const msg of history.slice(-2)) {
    messages.push({
      role: msg.role === 'assistant' ? 'assistant' : 'user',
      content: msg.content
    });
  }

  // 構建多圖像內容
  const contentParts = [
    { type: 'text', text: prompt }
  ];

  // 添加所有圖像（使用 JPEG 格式）
  for (const img of images) {
    contentParts.push({
      type: 'image_url',
      image_url: {
        url: `data:${img.mimeType || 'image/jpeg'};base64,${img.base64}`
      }
    });
  }

  messages.push({
    role: 'user',
    content: contentParts
  });

  // 使用 AbortController 設定超時（60 秒）
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);

  try {
    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${groqApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        messages,
        temperature: 0.7,
        max_completion_tokens: 8192,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMsg = errorData.error?.message || `HTTP ${response.status}`;

      // 針對常見錯誤提供更好的訊息
      if (response.status === 413) {
        throw new Error('請求大小超過限制，請減少選擇的頁數');
      } else if (response.status === 429) {
        throw new Error('API 請求過於頻繁，請稍後再試');
      } else if (response.status === 400) {
        throw new Error(`請求格式錯誤: ${errorMsg}`);
      }

      throw new Error(`Groq API 錯誤: ${errorMsg}`);
    }

    const data = await response.json();
    return data.choices[0]?.message?.content || '（無回應內容）';

  } catch (err) {
    clearTimeout(timeoutId);

    if (err.name === 'AbortError') {
      throw new Error('請求超時（60秒），請減少頁數或稍後再試');
    }
    throw err;
  }
};

// 獲取模型資訊
export const getModelInfo = () => ({
  name: 'Llama 4 Scout',
  id: DEFAULT_MODEL,
  provider: 'Groq',
  contextWindow: '131K tokens',
  capabilities: ['Text Generation', 'Vision/Image Analysis', 'Multilingual (12 languages)'],
  imageLimit: '4MB (base64) / 20MB (URL)',
  maxImages: 5,
  maxOutputTokens: 8192
});

// ============ 批量分析模式 ============

// 計算圖片大小（MB）
export const calculateImagesSize = (images) => {
  const totalBytes = images.reduce((sum, img) => sum + (img.base64?.length || 0), 0);
  return totalBytes / 1024 / 1024;
};

// 智能分批：確保每批 < maxSizeMB 且 <= maxImages 張
export const createBatches = (images, maxSizeMB = 3.0, maxImages = 5) => {
  const batches = [];
  let currentBatch = [];
  let currentSize = 0;

  for (const img of images) {
    const imgSize = (img.base64?.length || 0) / 1024 / 1024;

    // 檢查是否需要開新批次：超過大小限制 或 超過圖片數量限制
    const wouldExceedSize = currentSize + imgSize > maxSizeMB && currentBatch.length > 0;
    const wouldExceedCount = currentBatch.length >= maxImages;

    if (wouldExceedSize || wouldExceedCount) {
      batches.push(currentBatch);
      currentBatch = [];
      currentSize = 0;
    }

    currentBatch.push(img);
    currentSize += imgSize;
  }

  // 處理最後一批
  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }

  return batches;
};

// 單批次分析（提取摘要）
export const analyzeBatch = async (images, batchIndex, totalBatches, userPrompt) => {
  if (!groqApiKey) throw new Error('Groq 未初始化');

  await waitForRateLimit();

  const pageNums = images.map(img => img.pageNum).join('、');

  const messages = [
    {
      role: 'system',
      content: `你是一個專業的 PDF 文件分析助手。這是批量分析的第 ${batchIndex + 1}/${totalBatches} 批。

你正在分析第 ${pageNums} 頁的內容。請：
1. 詳細描述這些頁面的所有重要內容（文字、表格、圖表）
2. 如果有表格，請轉換為 Markdown 格式
3. 如果內容似乎與其他頁面相關（如跨頁表格），請特別標註
4. 保持內容完整性，不要省略重要資訊

輸出格式：
### 第 X 頁
[該頁內容摘要]

### 第 Y 頁
[該頁內容摘要]`
    }
  ];

  const contentParts = [
    { type: 'text', text: `請分析這 ${images.length} 頁的內容，用戶最終想要了解：「${userPrompt}」` }
  ];

  for (const img of images) {
    contentParts.push({
      type: 'image_url',
      image_url: {
        url: `data:${img.mimeType || 'image/jpeg'};base64,${img.base64}`
      }
    });
  }

  messages.push({ role: 'user', content: contentParts });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 90000); // 90秒超時

  try {
    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${groqApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        messages,
        temperature: 0.3, // 較低溫度確保準確性
        max_completion_tokens: 4096,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `HTTP ${response.status}`);
    }

    const data = await response.json();
    return {
      batchIndex,
      pages: images.map(img => img.pageNum),
      summary: data.choices[0]?.message?.content || ''
    };

  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error(`批次 ${batchIndex + 1} 超時`);
    }
    throw err;
  }
};

// 整合所有批次結果並生成最終回答
export const synthesizeBatchResults = async (batchResults, userPrompt, history = []) => {
  if (!groqApiKey) throw new Error('Groq 未初始化');

  await waitForRateLimit();

  // 合併所有摘要
  const allSummaries = batchResults
    .sort((a, b) => a.batchIndex - b.batchIndex)
    .map(r => `## 批次 ${r.batchIndex + 1}（第 ${r.pages.join('、')} 頁）\n${r.summary}`)
    .join('\n\n---\n\n');

  const messages = [
    {
      role: 'system',
      content: `你是一個專業的文件分析助手。以下是對 PDF 多個頁面的分批分析結果。

請根據這些分析結果，回答用戶的問題。規則：
1. 整合所有批次的資訊來回答
2. 如果有跨頁的表格或內容，請嘗試合併
3. 使用 Markdown 格式，表格請整理完整
4. 標註資訊來源頁碼
5. 如果資訊不足以回答，請說明`
    }
  ];

  // 添加簡化的歷史
  for (const msg of history.slice(-2)) {
    messages.push({
      role: msg.role === 'assistant' ? 'assistant' : 'user',
      content: typeof msg.content === 'string' ? msg.content : '[圖片分析]'
    });
  }

  messages.push({
    role: 'user',
    content: `## 各批次分析結果\n\n${allSummaries}\n\n---\n\n## 用戶問題\n${userPrompt}`
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);

  try {
    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${groqApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        messages,
        temperature: 0.7,
        max_completion_tokens: 8192,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `HTTP ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0]?.message?.content || '（無回應）';

  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error('整合分析超時');
    }
    throw err;
  }
};

// 完整的批量分析流程
export const batchAnalyzePDFPages = async (images, prompt, history = [], onProgress = null) => {
  // 1. 創建批次
  const batches = createBatches(images, 3.0);
  const totalBatches = batches.length;

  if (onProgress) {
    onProgress({
      stage: 'start',
      totalBatches,
      message: `分為 ${totalBatches} 批處理`
    });
  }

  // 2. 逐批分析
  const batchResults = [];

  for (let i = 0; i < batches.length; i++) {
    if (onProgress) {
      onProgress({
        stage: 'batch',
        current: i + 1,
        totalBatches,
        pages: batches[i].map(img => img.pageNum),
        message: `分析批次 ${i + 1}/${totalBatches}（第 ${batches[i].map(img => img.pageNum).join('、')} 頁）`
      });
    }

    const result = await analyzeBatch(batches[i], i, totalBatches, prompt);
    batchResults.push(result);

    // 批次間等待（避免速率限制）
    if (i < batches.length - 1) {
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  // 3. 整合結果
  if (onProgress) {
    onProgress({
      stage: 'synthesize',
      message: '整合所有分析結果...'
    });
  }

  const finalResponse = await synthesizeBatchResults(batchResults, prompt, history);

  if (onProgress) {
    onProgress({
      stage: 'complete',
      message: '分析完成'
    });
  }

  return {
    response: finalResponse,
    batchResults,
    totalBatches
  };
};
