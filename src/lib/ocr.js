/**
 * OCR 模組 - 使用 Groq Llama 4 Scout Vision 進行 OCR
 * 用於處理圖片型 PDF（掃描版）
 */

import * as pdfjsLib from 'pdfjs-dist';

// 檢測 PDF 是否為圖片型（文字內容很少）
export const detectImageBasedPDF = async (pdfDoc, samplePages = 3) => {
  const pagesToCheck = Math.min(samplePages, pdfDoc.numPages);
  let totalTextLength = 0;
  let totalArea = 0;

  for (let i = 1; i <= pagesToCheck; i++) {
    const page = await pdfDoc.getPage(i);
    const content = await page.getTextContent();
    const viewport = page.getViewport({ scale: 1.0 });

    const pageText = content.items.map(item => item.str).join('');
    totalTextLength += pageText.replace(/\s/g, '').length;
    totalArea += viewport.width * viewport.height;
  }

  // 計算文字密度（字元數 / 頁面面積）
  const textDensity = totalTextLength / totalArea;

  // 如果文字密度很低（< 0.001），可能是圖片型 PDF
  // 或者總文字長度很短
  const isImageBased = textDensity < 0.001 || totalTextLength < 100;

  return {
    isImageBased,
    textDensity,
    totalTextLength,
    pagesChecked: pagesToCheck,
    confidence: isImageBased ? 'high' : 'low'
  };
};

// 將 PDF 頁面渲染為圖片
export const renderPageToImage = async (pdfDoc, pageNum, scale = 2.0) => {
  const page = await pdfDoc.getPage(pageNum);
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  canvas.height = viewport.height;
  canvas.width = viewport.width;

  await page.render({ canvasContext: context, viewport }).promise;

  // 檢查圖片大小，如果太大則降低品質
  let quality = 0.9;
  let dataUrl = canvas.toDataURL('image/jpeg', quality);

  // Base64 限制 4MB，預留一些空間
  while (dataUrl.length > 3.5 * 1024 * 1024 && quality > 0.3) {
    quality -= 0.1;
    dataUrl = canvas.toDataURL('image/jpeg', quality);
  }

  return {
    base64: dataUrl.split(',')[1],
    mimeType: 'image/jpeg',
    width: canvas.width,
    height: canvas.height,
    quality
  };
};

// 使用 Groq 進行 OCR（單頁）
export const ocrPage = async (groqApiKey, base64Image, mimeType = 'image/jpeg', pageNum = 1) => {
  const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
  const MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';

  const systemPrompt = `你是一個專業的 OCR 文字識別助手。請仔細識別圖像中的所有文字內容。

規則：
1. 準確識別所有文字，包括標題、段落、表格、列表等。
2. 保持原文的結構和格式。
3. 表格請轉換為 Markdown 表格格式。
4. 如果有多欄排版，請按閱讀順序整理。
5. 忽略頁碼、頁眉頁腳等非主要內容。
6. 只輸出識別的文字內容，不要添加任何解釋或評論。
7. 如果圖像模糊或無法識別某些字，用 [?] 標記。`;

  const response = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${groqApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            { type: 'text', text: `請識別這張圖片（第 ${pageNum} 頁）中的所有文字內容：` },
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType};base64,${base64Image}`
              }
            }
          ]
        }
      ],
      temperature: 0.1, // 低溫度提高準確性
      max_completion_tokens: 4096,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'OCR 失敗');
  }

  const data = await response.json();
  return data.choices[0]?.message?.content || '';
};

// 批量 OCR（多頁）
export const ocrPDFPages = async (
  groqApiKey,
  pdfDoc,
  pageNumbers,
  onProgress = null
) => {
  const results = [];
  const total = pageNumbers.length;

  for (let i = 0; i < total; i++) {
    const pageNum = pageNumbers[i];

    if (onProgress) {
      onProgress({
        current: i + 1,
        total,
        pageNum,
        stage: 'rendering',
        message: `渲染第 ${pageNum} 頁...`
      });
    }

    // 渲染頁面為圖片
    const image = await renderPageToImage(pdfDoc, pageNum);

    if (onProgress) {
      onProgress({
        current: i + 1,
        total,
        pageNum,
        stage: 'ocr',
        message: `OCR 識別第 ${pageNum} 頁... (${i + 1}/${total})`
      });
    }

    // 進行 OCR
    const text = await ocrPage(groqApiKey, image.base64, image.mimeType, pageNum);

    // 速率限制等待
    if (i < total - 1) {
      await new Promise(r => setTimeout(r, 2000));
    }

    results.push({
      pageNum,
      text,
      imageInfo: {
        width: image.width,
        height: image.height,
        quality: image.quality
      }
    });
  }

  return results;
};

// 合併 OCR 結果為完整文本
export const mergeOCRResults = (results) => {
  return results
    .sort((a, b) => a.pageNum - b.pageNum)
    .map(r => r.text)
    .join('\n\n---\n\n'); // 用分隔線區分頁面
};

// 混合解析：優先使用 PDF 文字層，不足時使用 OCR
export const hybridParsePDF = async (
  file,
  groqApiKey,
  options = {},
  onProgress = null
) => {
  const {
    ocrThreshold = 100, // 每頁少於此字數則使用 OCR
    maxOCRPages = 999,  // 移除實際限制（逐頁處理不受 API 大小限制）
  } = options;

  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const numPages = pdfDoc.numPages;

  const pageTexts = [];
  const ocrNeededPages = [];

  // 第一輪：提取 PDF 文字層
  for (let i = 1; i <= numPages; i++) {
    if (onProgress) {
      onProgress({
        stage: 'extract',
        current: i,
        total: numPages,
        message: `提取文字層... (${i}/${numPages})`
      });
    }

    const page = await pdfDoc.getPage(i);
    const content = await page.getTextContent();
    const text = content.items.map(item => item.str).join(' ').trim();

    if (text.length < ocrThreshold) {
      ocrNeededPages.push(i);
      pageTexts.push({ pageNum: i, text: '', needsOCR: true });
    } else {
      pageTexts.push({ pageNum: i, text, needsOCR: false });
    }
  }

  // 第二輪：對需要 OCR 的頁面進行 OCR
  if (ocrNeededPages.length > 0 && groqApiKey) {
    const pagesToOCR = ocrNeededPages.slice(0, maxOCRPages);

    if (onProgress) {
      onProgress({
        stage: 'ocr_start',
        ocrPages: pagesToOCR.length,
        message: `開始 OCR 識別 ${pagesToOCR.length} 頁...`
      });
    }

    const ocrResults = await ocrPDFPages(
      groqApiKey,
      pdfDoc,
      pagesToOCR,
      (p) => {
        if (onProgress) {
          onProgress({
            stage: 'ocr',
            ...p
          });
        }
      }
    );

    // 合併 OCR 結果
    for (const result of ocrResults) {
      const idx = pageTexts.findIndex(p => p.pageNum === result.pageNum);
      if (idx !== -1) {
        pageTexts[idx].text = result.text;
        pageTexts[idx].ocrApplied = true;
      }
    }
  }

  // 統計
  const stats = {
    totalPages: numPages,
    textLayerPages: pageTexts.filter(p => !p.needsOCR).length,
    ocrPages: pageTexts.filter(p => p.ocrApplied).length
  };

  // 合併所有文字
  const fullText = pageTexts
    .filter(p => p.text.length > 0)
    .map(p => p.text)
    .join('\n\n');

  return {
    fullText,
    pageTexts,
    stats,
    pdfDoc
  };
};
