import * as pdfjsLib from 'pdfjs-dist';
import { hybridParsePDF, detectImageBasedPDF } from './ocr';

// 設定 PDF.js 的 Worker 來源
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

// 標準 PDF 解析（僅文字層）
export const parsePDF = async (file, onProgress = null) => {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let fullText = '';

  for (let i = 1; i <= pdf.numPages; i++) {
    if (onProgress) {
      onProgress({ stage: 'parsing', current: i, total: pdf.numPages });
    }
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const strings = content.items.map(item => item.str);
    fullText += strings.join(' ') + '\n';
  }

  return chunkTextSemantic(fullText);
};

// 智能解析（自動偵測並啟用 OCR）
export const parsePDFSmart = async (file, groqApiKey = null, onProgress = null) => {
  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  // 偵測是否為圖片型 PDF
  if (onProgress) {
    onProgress({ stage: 'detecting', message: '偵測 PDF 類型...' });
  }

  const detection = await detectImageBasedPDF(pdfDoc);

  let fullText = '';
  let stats = {
    totalPages: pdfDoc.numPages,
    isImageBased: detection.isImageBased,
    ocrUsed: false,
    ocrPages: 0
  };

  if (detection.isImageBased && groqApiKey) {
    // 圖片型 PDF：使用混合解析（OCR）
    if (onProgress) {
      onProgress({
        stage: 'ocr_detected',
        message: `偵測為圖片型 PDF，將使用 OCR...`,
        detection
      });
    }

    const result = await hybridParsePDF(file, groqApiKey, {
      ocrThreshold: 100
      // 不限制 OCR 頁數（逐頁處理不受 API 大小限制）
    }, onProgress);

    fullText = result.fullText;
    stats.ocrUsed = true;
    stats.ocrPages = result.stats.ocrPages;
    stats.textLayerPages = result.stats.textLayerPages;

  } else {
    // 文字型 PDF：使用標準解析
    if (onProgress) {
      onProgress({
        stage: 'text_detected',
        message: '偵測為文字型 PDF，使用標準解析...'
      });
    }

    for (let i = 1; i <= pdfDoc.numPages; i++) {
      if (onProgress) {
        onProgress({
          stage: 'parsing',
          current: i,
          total: pdfDoc.numPages,
          message: `解析中... (${i}/${pdfDoc.numPages})`
        });
      }
      const page = await pdfDoc.getPage(i);
      const content = await page.getTextContent();
      fullText += content.items.map(item => item.str).join(' ') + '\n';
    }
  }

  const chunks = chunkTextSemantic(fullText);

  return {
    chunks,
    stats,
    fullText
  };
};

// 語義分塊：按句子邊界切割，保持語義完整性
function chunkTextSemantic(text, maxSize = 800, overlapSentences = 2) {
  // 清理文本
  const cleanedText = text
    .replace(/\s+/g, ' ')
    .replace(/\n+/g, '\n')
    .trim();

  if (!cleanedText) return [];

  // 按句子分割（支援中英文標點）
  const sentencePattern = /[^。！？.!?\n]+[。！？.!?\n]?/g;
  const sentences = cleanedText.match(sentencePattern) || [cleanedText];

  const chunks = [];
  let currentChunk = [];
  let currentLength = 0;

  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i].trim();
    if (!sentence) continue;

    const sentenceLength = sentence.length;

    // 如果單句超過 maxSize，強制分割
    if (sentenceLength > maxSize) {
      if (currentChunk.length > 0) {
        chunks.push(currentChunk.join(' '));
        currentChunk = [];
        currentLength = 0;
      }
      const subChunks = chunkLongSentence(sentence, maxSize);
      chunks.push(...subChunks);
      continue;
    }

    // 如果加入這句會超過限制
    if (currentLength + sentenceLength > maxSize && currentChunk.length > 0) {
      chunks.push(currentChunk.join(' '));

      // 重疊：保留最後幾個句子
      const overlapStart = Math.max(0, currentChunk.length - overlapSentences);
      currentChunk = currentChunk.slice(overlapStart);
      currentLength = currentChunk.reduce((sum, s) => sum + s.length, 0);
    }

    currentChunk.push(sentence);
    currentLength += sentenceLength;
  }

  // 處理最後一個 chunk
  if (currentChunk.length > 0) {
    chunks.push(currentChunk.join(' '));
  }

  // 過濾空白和過短的 chunks
  return chunks.filter(chunk => chunk.trim().length > 50);
}

// 對超長句子進行字符級分割
function chunkLongSentence(sentence, maxSize) {
  const chunks = [];
  let start = 0;
  const overlap = 50;

  while (start < sentence.length) {
    let end = start + maxSize;

    if (end < sentence.length) {
      const breakPoints = [',', '，', ';', '；', ':', '：', ' '];
      for (const bp of breakPoints) {
        const lastBreak = sentence.lastIndexOf(bp, end);
        if (lastBreak > start + maxSize / 2) {
          end = lastBreak + 1;
          break;
        }
      }
    }

    chunks.push(sentence.substring(start, end).trim());
    start = end - overlap;
  }

  return chunks;
}

// 取得文檔統計資訊（含 OCR 偵測）
export const getDocumentStats = async (file) => {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  let totalChars = 0;
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    totalChars += content.items.reduce((sum, item) => sum + item.str.length, 0);
  }

  // 偵測是否為圖片型
  const detection = await detectImageBasedPDF(pdf);

  const estimatedChunks = detection.isImageBased
    ? Math.ceil(pdf.numPages * 1.5) // 圖片型估計每頁 1-2 個 chunk
    : Math.ceil(totalChars / 700);

  let estimatedTime = Math.ceil(estimatedChunks * 4.5); // Gemini 向量化時間

  // 如果需要 OCR，加上 OCR 時間（逐頁處理，無頁數限制）
  if (detection.isImageBased) {
    estimatedTime += pdf.numPages * 3; // 每頁約 3 秒 OCR
  }

  return {
    pages: pdf.numPages,
    estimatedChars: totalChars,
    estimatedChunks,
    estimatedTime,
    isImageBased: detection.isImageBased,
    textDensity: detection.textDensity,
    needsOCR: detection.isImageBased
  };
};

// 導出偵測函數
export { detectImageBasedPDF };
