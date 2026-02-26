/**
 * Gemini API Client - V3 (僅向量化功能)
 * 在 V3 中，Gemini 只負責文字向量化
 * 對話和圖像分析由 Groq 處理
 */

import { GoogleGenerativeAI } from "@google/generative-ai";

let genAI = null;

// 速率限制配置 (免費 API: 15 RPM)
const RATE_LIMIT = {
  maxRequestsPerMinute: 15,
  minDelayMs: 4500,
  lastRequestTime: 0,
  requestCount: 0,
  windowStart: 0,
};

// 速率限制等待函數
const waitForRateLimit = async () => {
  const now = Date.now();

  if (now - RATE_LIMIT.windowStart > 60000) {
    RATE_LIMIT.requestCount = 0;
    RATE_LIMIT.windowStart = now;
  }

  if (RATE_LIMIT.requestCount >= RATE_LIMIT.maxRequestsPerMinute) {
    const waitTime = 60000 - (now - RATE_LIMIT.windowStart) + 1000;
    if (waitTime > 0) {
      await new Promise(r => setTimeout(r, waitTime));
      RATE_LIMIT.requestCount = 0;
      RATE_LIMIT.windowStart = Date.now();
    }
  }

  const timeSinceLastRequest = now - RATE_LIMIT.lastRequestTime;
  if (timeSinceLastRequest < RATE_LIMIT.minDelayMs) {
    await new Promise(r => setTimeout(r, RATE_LIMIT.minDelayMs - timeSinceLastRequest));
  }

  RATE_LIMIT.lastRequestTime = Date.now();
  RATE_LIMIT.requestCount++;
};

// 帶重試的 API 調用
const withRetry = async (fn, maxRetries = 3) => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const isRateLimit = error.message?.includes('429') ||
                          error.message?.includes('quota') ||
                          error.message?.includes('rate');

      if (isRateLimit && attempt < maxRetries) {
        const backoffTime = 15000 * Math.pow(2, attempt - 1);
        console.log(`Rate limited, waiting ${backoffTime/1000}s before retry ${attempt + 1}/${maxRetries}`);
        await new Promise(r => setTimeout(r, backoffTime));
        continue;
      }
      throw error;
    }
  }
};

// 初始化 Gemini
export const initGemini = (apiKey) => {
  genAI = new GoogleGenerativeAI(apiKey);
};

// 驗證 Gemini API Key
export const verifyGeminiApiKey = async (apiKey) => {
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
    );
    if (!response.ok) {
      throw new Error('API Key 無效');
    }
    return true;
  } catch (error) {
    throw new Error('Gemini API Key 驗證失敗: ' + error.message);
  }
};

// 向量化功能 (gemini-embedding-001)
export const getEmbedding = async (text, outputDimensionality = null) => {
  if (!genAI) throw new Error("Gemini 未初始化，請先輸入 API Key");

  await waitForRateLimit();

  return await withRetry(async () => {
    const model = genAI.getGenerativeModel({ model: "gemini-embedding-001" });
    const config = outputDimensionality ? { outputDimensionality } : {};
    const result = await model.embedContent({ content: { parts: [{ text }] }, ...config });
    return result.embedding.values;
  });
};

// 批量向量化（帶進度回調）
export const getEmbeddingsBatch = async (texts, onProgress = null, outputDimensionality = null) => {
  const results = [];
  const total = texts.length;
  const estimatedTimePerRequest = RATE_LIMIT.minDelayMs / 1000;

  for (let i = 0; i < total; i++) {
    const remainingRequests = total - i;
    const estimatedRemainingTime = Math.ceil(remainingRequests * estimatedTimePerRequest);

    if (onProgress) {
      onProgress({
        current: i + 1,
        total,
        estimatedRemainingSeconds: estimatedRemainingTime,
        message: `向量化中... (${i + 1}/${total}) - 預計剩餘 ${formatTime(estimatedRemainingTime)}`
      });
    }

    const embedding = await getEmbedding(texts[i], outputDimensionality);
    results.push(embedding);
  }

  return results;
};

// 格式化時間
const formatTime = (seconds) => {
  if (seconds < 60) return `${seconds} 秒`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins} 分 ${secs} 秒`;
};

// 獲取模型資訊
export const getEmbeddingModelInfo = () => ({
  name: 'Gemini Embedding',
  id: 'gemini-embedding-001',
  provider: 'Google',
  dimensions: 3072,
  rateLimit: '15 RPM (Free Tier)'
});
