/**
 * Cleans raw OCR output text to prepare it for field mapping.
 * Removes duplicate spaces, control characters, standalone noise symbols,
 * cleans noisy characters, merges multiline fragments,
 * and deduplicates repeated lines (case-insensitive).
 *
 * @param {string} rawText - The raw text string from the OCR response
 * @returns {string[]} An array of cleaned, non-empty text lines
 */
export function cleanOCRText(rawText) {
  if (!rawText) return [];

  // Log raw OCR text
  console.log('[OCR.Space] Raw OCR Text:\n', rawText);

  // 1. Initial split, basic cleaning and trim
  const initialLines = rawText
    .split(/\r?\n/)
    .map(line => {
      // Remove control characters and non-printable characters
      let cleaned = line.replace(/[\x00-\x1F\x7F-\x9F]/g, '');
      
      // Normalize whitespace (tabs, multiple spaces) to a single space
      cleaned = cleaned.replace(/\s+/g, ' ').trim();
      
      // Clean common noisy OCR characters (like |, •, ©, ®, ¢, ¥, ~, etc.)
      cleaned = cleaned.replace(/[|•_~¥©®¢]/g, '');
      
      // Strip starting/trailing garbage characters commonly found in OCR noise,
      // but retain plus (+) and parentheses () which are standard in phone numbers.
      cleaned = cleaned.replace(/^[\s\-_\\\/#\*\.]+|[\s\-_\\\/#\*\.]+$/g, '').trim();
      
      return cleaned;
    })
    .filter(line => {
      // Filter out empty lines
      if (!line) return false;
      
      // Filter out standalone punctuation noise (e.g. ",", ".", "|", "_", "-")
      if (line.length === 1 && !/[a-zA-Z0-9]/i.test(line)) return false;
      
      return true;
    });

  // 2. Merge multiline fragments where appropriate
  const mergedLines = [];
  for (let i = 0; i < initialLines.length; i++) {
    let current = initialLines[i];
    
    while (i + 1 < initialLines.length) {
      const next = initialLines[i + 1];
      let shouldMerge = false;
      let joinChar = ' ';
      
      // Heuristic A: Current line ends with a hyphen (word split)
      if (current.endsWith('-')) {
        shouldMerge = true;
        current = current.slice(0, -1);
        joinChar = '';
      }
      // Heuristic B: Current line ends with @ or next starts with @ (email split)
      else if (current.endsWith('@') || next.startsWith('@')) {
        shouldMerge = true;
        joinChar = '';
      }
      // Heuristic C: Next line starts with a lowercase letter and current line does not end with sentence punctuation
      // AND neither line is an email/website/phone number to avoid fusing distinct fields
      else if (
        /^[a-z]/.test(next) && 
        !/[\.\?\!]$/.test(current) &&
        !next.includes('@') &&
        !next.toLowerCase().includes('www.') &&
        !next.toLowerCase().includes('http') &&
        !/^[+\d]/.test(next) &&
        !current.includes('@') &&
        !current.toLowerCase().includes('www.') &&
        !current.toLowerCase().includes('http')
      ) {
        shouldMerge = true;
        joinChar = ' ';
      }
      // Heuristic D: Split email/website domain parts
      else if (
        (current.endsWith('.') && /^(com|org|net|in|co|io|me|tech|edu|gov|xyz)\b/i.test(next)) ||
        (next.startsWith('.') && (current.toLowerCase().endsWith('example') || current.toLowerCase().includes('@')))
      ) {
        shouldMerge = true;
        joinChar = '';
      }
      
      if (shouldMerge) {
        current = current + joinChar + next;
        i++; // Consume the next line
      } else {
        break;
      }
    }
    mergedLines.push(current);
  }

  // 3. Deduplicate lines (case-insensitive and whitespace-stripped duplicates)
  const uniqueLines = [];
  const seenNormalized = new Set();

  for (const line of mergedLines) {
    const normalized = line.toLowerCase().replace(/\s+/g, '');
    if (!seenNormalized.has(normalized)) {
      seenNormalized.add(normalized);
      uniqueLines.push(line);
    }
  }

  // Log cleaned OCR text
  console.log('[OCR.Space] Cleaned OCR Text:\n', uniqueLines.join('\n'));

  return uniqueLines;
}
