import Tesseract from 'tesseract.js';

const OCR_SPACE_API_KEY = 'K89475579988957';

export async function runOCR(imageFile, engine = 2, onProgress = () => {}) {

  // ONLINE → OCR.Space
  if (navigator.onLine) {
    try {
      const formData = new FormData();

      formData.append('file', imageFile);
      formData.append('language', 'eng');
      formData.append('isOverlayRequired', 'false');
      formData.append('detectOrientation', 'true');
      formData.append('scale', 'true');
      formData.append('OCREngine', String(engine));

      const response = await fetch(
        'https://api.ocr.space/parse/image',
        {
          method: 'POST',
          headers: {
            apikey: OCR_SPACE_API_KEY
          },
          body: formData
        }
      );

      const result = await response.json();

      const parsed = result?.ParsedResults?.[0];

      return {
        text: parsed?.ParsedText || '',
        exitCode: result?.OCRExitCode || 99,
        errorMessage: parsed?.ErrorMessage || ''
      };

    } catch (error) {
      console.error('OCR.Space failed. Falling back to Tesseract.', error);
    }
  }

  // OFFLINE OR OCR FAIL → Tesseract
  return runOfflineOCR(imageFile, onProgress);
}

export async function runOfflineOCR(
  imageFile,
  onProgress = () => {}
) {

  const result = await Tesseract.recognize(
    imageFile,
    'eng',
    {
      logger: m => {
        if (m.status === 'recognizing text') {
          onProgress(m.progress);
        }
      }
    }
  );

  return {
    text: result.data.text || '',
    exitCode: 1,
    errorMessage: ''
  };
}

export function mergeOCRTexts(textA, textB) {

  if (!textA) return textB;
  if (!textB) return textA;

  const linesA = textA
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean);

  const linesB = textB
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean);

  const base =
    linesA.length >= linesB.length
      ? linesA
      : linesB;

  const other =
    linesA.length >= linesB.length
      ? linesB
      : linesA;

  const baseSet = new Set(
    base.map(l => l.toLowerCase())
  );

  const extras = other.filter(
    l => !baseSet.has(l.toLowerCase())
  );

  return [...base, ...extras].join('\n');
} 