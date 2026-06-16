import { cleanOCRText } from './cleanOCRText.js';
import { parseEmails } from './parseEmails.js';
import { parsePhones } from './parsePhones.js';
import { prioritizePhones, prioritizeEmails } from './prioritizeContacts.js';

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

const isNoiseLine = (line) => {
  const l = line.trim().toLowerCase();
  if (!l || l.length < 2) return true;
  if (/^[^a-z0-9]+$/.test(l)) return true;
  if (/^(www\.|http|linkedin|twitter|facebook|instagram|@)/.test(l)) return true;
  if (/\b(street|st\.|avenue|ave\.|road|rd\.|blvd|suite|floor|p\.?o\.? box)\b/.test(l)) return true;
  return false;
};

const isProperWord = (w) =>
  /^[A-Z][a-z]+$/.test(w) || /^[A-Z]{2,6}$/.test(w);

// Detect camelCase brand words like "TechNova", "GraphicsFamily"
const isCamelCaseBrand = (word) =>
  /^[A-Z][a-z]+[A-Z][a-zA-Z]+$/.test(word);

const JOB_TITLE_WORDS = [
  'developer', 'designer', 'engineer', 'manager', 'director',
  'founder', 'consultant', 'officer', 'marketing', 'sales',
  'analyst', 'graphic', 'ui', 'ux', 'ceo', 'cto', 'coo', 'cfo',
  'vp', 'president', 'head', 'lead', 'senior', 'junior', 'intern',
  'associate', 'executive', 'specialist', 'coordinator', 'architect',
  'strategist', 'advisor', 'partner', 'principal', 'representative',
  'account', 'product', 'project', 'program', 'operations',
  'technology', 'information', 'creative', 'brand', 'content',
  'digital', 'data', 'research', 'business', 'corporate', 'software'
];

const COMPANY_SUFFIXES = [
  'llc', 'inc', 'ltd', 'corp', 'co.', 'company', 'group',
  'solutions', 'technologies', 'services', 'systems', 'global',
  'international', 'associates', 'consulting', 'ventures',
  'holdings', 'enterprises', 'studio', 'studios', 'agency',
  'partners', 'network', 'networks', 'labs', 'media', 'family'
];

const isSuffixOnlyLine = (line) => {
  const t = line.trim().toLowerCase();
  return COMPANY_SUFFIXES.some(s => t === s);
};

// ─────────────────────────────────────────────
// NAME EXTRACTION
// ─────────────────────────────────────────────

const parseNameLocal = (lines) => {
  const candidates = [];

  lines.forEach((rawLine, idx) => {
    const line = rawLine.trim();
    if (isNoiseLine(line)) return;

    const lower = line.toLowerCase();
    if (/\d/.test(line) || lower.includes('@') || lower.includes('www')) return;
    if (JOB_TITLE_WORDS.some(w => lower.split(/\W+/).includes(w))) return;
    if (COMPANY_SUFFIXES.some(s => lower.includes(s))) return;

    const words = line.split(/\s+/);
    if (words.length < 2 || words.length > 5) return;
    if (line.length > 40) return;

    const properCount = words.filter(isProperWord).length;
    if (properCount < 1) return;

    let score = 0;
    if (properCount === words.length) score += 40;
    else score += properCount * 10;

    if (idx === 0) score += 30;
    else if (idx === 1) score += 20;
    else if (idx <= 3) score += 10;

    if (words.length === 2 || words.length === 3) score += 15;

    const hasInitial = words.some(w => /^[A-Z]\.$/.test(w));
    if (hasInitial) score += 10;

    candidates.push({ name: line, score, idx });
  });

  candidates.sort((a, b) => b.score - a.score);

  if (candidates.length > 0 && candidates[0].score >= 40) {
    return { name: candidates[0].name, confidence: candidates[0].score };
  }

  for (const line of lines) {
    const clean = line.trim();
    if (!clean || /\d/.test(clean) || clean.includes('@')) continue;
    const words = clean.split(/\s+/);
    if (words.length >= 2 && words.length <= 4 && words.filter(isProperWord).length >= 2) {
      return { name: clean, confidence: 20 };
    }
  }

  return { name: '', confidence: 0 };
};

// ─────────────────────────────────────────────
// COMPANY EXTRACTION
// ─────────────────────────────────────────────

const parseCompanyLocal = (lines, detectedName) => {
  const candidates = [];

  lines.forEach((rawLine, idx) => {
    const line = rawLine.trim();
    if (isNoiseLine(line)) return;

    const lower = line.toLowerCase();
    if (lower.includes('@') || lower.includes('www') || /\d{5,}/.test(line)) return;
    if (line.replace(/\D/g, '').length >= 7) return;
    if (detectedName && line === detectedName) return;

    const words = lower.split(/\W+/);
    const isJobTitle = JOB_TITLE_WORDS.some(w => words.includes(w));
    if (isJobTitle) return;

    // Skip bare suffix-only lines — they get merged onto the brand line
    if (isSuffixOnlyLine(line)) return;

    const nextLine = lines[idx + 1]?.trim() || '';

    let score = 0;

    const hasSuffix = COMPANY_SUFFIXES.some(s => lower.includes(s));
    if (hasSuffix) score += 50;

    // Next line is a suffix word → this line is the brand prefix
    if (isSuffixOnlyLine(nextLine)) score += 40;

    // CamelCase single word like "TechNova" or "GraphicsFamily"
    const lineWords = line.split(/\s+/);
    if (lineWords.length === 1 && isCamelCaseBrand(line)) score += 35;

    // Two-word ALL CAPS like "GRAPHICS FAMILY" or "TECH VERSE"
    if (/^[A-Z][A-Z\s&.,'-]+$/.test(line)) score += 20;
    // Title Case multi-word
    if (/^([A-Z][a-z]+\s?){2,}$/.test(line)) score += 15;

    if (line.length >= 3 && line.length <= 50) score += 10;

    if (idx <= 2) score += 15;
    else if (idx <= 5) score += 5;

    // Penalise single-word lines with no other company signals
    if (lineWords.length === 1 && !hasSuffix && !isSuffixOnlyLine(nextLine) && !isCamelCaseBrand(line)) score -= 5;

    if (score > 0) candidates.push({ company: line, score, idx });
  });

  candidates.sort((a, b) => b.score - a.score);

  if (candidates.length > 0) {
    let best = candidates[0].company;
    const bestIdx = candidates[0].idx;

    // Merge next line if it is a standalone suffix word
    // e.g. "TechNova" + "SOLUTIONS" → "TechNova SOLUTIONS"
    // e.g. "GRAPHICS" + "FAMILY" → "GRAPHICS FAMILY"
    const nextLine = lines[bestIdx + 1]?.trim() || '';
    if (isSuffixOnlyLine(nextLine)) {
      best = `${best} ${nextLine}`;
    }

    return { company: best, confidence: candidates[0].score };
  }

  return { company: '', confidence: 0 };
};

// ─────────────────────────────────────────────
// EXPORTED INTEGRATION PARSER
// ─────────────────────────────────────────────

export const extractCardData = (mergedText) => {
  const lines = cleanOCRText(mergedText);

  // ── Phones: deduplicate by digits, pick primary + alt
  const allPhones = parsePhones(lines);
  const normalizePhone = (p) => p.replace(/\D/g, '');
  const uniquePhones = allPhones.filter(
    (p, i, arr) => arr.findIndex(x => normalizePhone(x) === normalizePhone(p)) === i
  );
  const phone    = prioritizePhones(uniquePhones, lines) || uniquePhones[0] || '';
  const altPhone = uniquePhones.find(
    p => normalizePhone(p) !== normalizePhone(phone)
  ) || '';

  // ── Emails: deduplicate by exact lowercase only — do NOT strip dots
  const normalizeEmail = (e) => e.toLowerCase().trim();
  const allEmails = parseEmails(lines);
  const uniqueEmails = allEmails.filter(
    (e, i, arr) => arr.findIndex(x => normalizeEmail(x) === normalizeEmail(e)) === i
  );
  const email    = prioritizeEmails(uniqueEmails) || uniqueEmails[0] || '';
  const altEmail = uniqueEmails.find(
    e => normalizeEmail(e) !== normalizeEmail(email)
  ) || '';

  // ── Websites: parse domains and URLs
  const websiteRegex = /(https?:\/\/)?(www\.)?([a-zA-Z0-9-]+)\.([a-zA-Z]{2,6})(?:\/[^\s]*)?/i;
  const websites = [];
  lines.forEach(line => {
    const cleanLine = line.trim();
    if (cleanLine.includes('@')) return; // Skip email
    const match = cleanLine.match(websiteRegex);
    if (match) {
      const lower = cleanLine.toLowerCase();
      if (lower.includes('www.') || lower.includes('http') || /\.(com|org|net|in|co|io|me|tech|edu|gov|xyz)\b/.test(lower)) {
        if (!websites.includes(cleanLine)) {
          websites.push(cleanLine);
        }
      }
    }
  });
  const website = websites[0] || '';

  // ── Title: parse Designation/Job Role
  const commonTitleRegex = /\b(ceo|founder|director|manager|engineer|developer|software\s+engineer|ui\s+designer|ux\s+designer|ui\/ux\s+designer|marketing\s+manager|digital\s+marketing\s+specialist|consultant|analyst|sales\s+executive)\b/i;
  let title = '';
  for (const line of lines) {
    if (commonTitleRegex.test(line)) {
      title = line.trim();
      break;
    }
  }
  // Fallback to broader job title words
  if (!title) {
    for (const line of lines) {
      const lower = line.toLowerCase();
      const words = lower.split(/\W+/);
      const hasJobWord = JOB_TITLE_WORDS.some(w => words.includes(w));
      if (hasJobWord && !lower.includes('@') && !lower.includes('www') && !lower.includes('http') && !/\d{5,}/.test(line)) {
        title = line.trim();
        break;
      }
    }
  }

  // ── Address: parse street/city/state/PIN/ZIP
  const addressKeywords = /\b(street|st\.|road|rd\.|avenue|ave\.|nagar|layout|lane|ln|drive|dr|court|ct|place|pl|square|sq|building|bldg|floor|fl|sector|block|p\.?o\.?\s*box|city|state|zip|post|postal|pin\s*code|chennai|mumbai|bangalore|delhi|india|tamil\s*nadu|karnataka|maharashtra)\b/i;
  const addressLines = [];
  lines.forEach(line => {
    const cleanLine = line.trim();
    if (cleanLine.includes('@') || cleanLine.toLowerCase().includes('www') || cleanLine.toLowerCase().includes('http')) return;
    const isPhone = uniquePhones.some(p => p.replace(/\D/g, '') === cleanLine.replace(/\D/g, ''));
    if (isPhone) return;

    if (addressKeywords.test(cleanLine) || /\b\d{5,6}\b/.test(cleanLine)) {
      if (!addressLines.includes(cleanLine)) {
        addressLines.push(cleanLine);
      }
    }
  });
  const address = addressLines.join(', ');

  const { name }    = parseNameLocal(lines);
  const { company } = parseCompanyLocal(lines, name);

  return {
    name:     name    || 'Unknown Name',
    company:  company || 'Unknown Company',
    phone:    phone,
    altPhone: altPhone,
    email:    email,
    altEmail: altEmail,
    phones:   uniquePhones,
    emails:   uniqueEmails,
    title,
    website,
    address
  };
};
