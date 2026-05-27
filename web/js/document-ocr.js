/**
 * OTRUST Document OCR
 * 
 * Extracts birth dates and income amounts from ID documents and financial papers.
 * Uses Tesseract.js for OCR - runs entirely in the browser, no server uploads.
 * 
 * SECURITY: Validates that uploaded images are actual ID documents before
 * allowing proof generation. Prevents arbitrary image uploads.
 */

// Tesseract.js CDN
const TESSERACT_CDN = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';

// ID Document validation thresholds
const ID_VALIDATION = {
  MIN_MRZ_CONFIDENCE: 0.7,      // Minimum MRZ parsing confidence
  MIN_DATE_CONFIDENCE: 0.8,     // Minimum birth date confidence
  REQUIRE_FACE_ON_ID: true,     // Require face detection on document
  REQUIRE_MRZ_OR_DATE: true,    // Must find MRZ or structured date
  MIN_ID_KEYWORDS: 2            // Minimum ID-related keywords found
};

// Keywords that indicate an ID document
const ID_KEYWORDS = [
  // Document types
  'passport', 'pasaporte', 'reisepass', 'passeport', 'pass',
  'driver', 'license', 'licence', 'körkort', 'führerschein', 'permis',
  'identity', 'identitet', 'ausweis', 'carte',
  'national', 'id card', 'id-kort', 'personalausweis',
  
  // Common fields on IDs
  'surname', 'efternamn', 'nachname', 'nom',
  'given', 'förnamn', 'vorname', 'prénom',
  'birth', 'född', 'geboren', 'naissance', 'date of birth', 'dob',
  'sex', 'kön', 'geschlecht', 'sexe',
  'nationality', 'nationalitet', 'staatsangehörigkeit',
  'expiry', 'expires', 'giltig', 'gültig', 'expiration',
  'issued', 'utfärdat', 'ausgestellt',
  
  // MRZ indicators
  '<<<', '>>', 'p<', 'i<', 'v<', 'c<',
  
  // Swedish specific
  'personnummer', 'skatteverket', 'transportstyrelsen',
  
  // Country codes often in MRZ
  'swe', 'deu', 'gbr', 'usa', 'fra', 'nor', 'dnk', 'fin'
];

let tesseractLoaded = false;
let tesseractWorker = null;

/**
 * Load Tesseract.js dynamically
 */
async function loadTesseract() {
  if (tesseractLoaded && window.Tesseract) return window.Tesseract;
  
  return new Promise((resolve, reject) => {
    if (window.Tesseract) {
      tesseractLoaded = true;
      resolve(window.Tesseract);
      return;
    }
    
    const script = document.createElement('script');
    script.src = TESSERACT_CDN;
    script.onload = () => {
      tesseractLoaded = true;
      console.log('✅ Tesseract.js loaded');
      resolve(window.Tesseract);
    };
    script.onerror = () => reject(new Error('Failed to load Tesseract.js'));
    document.head.appendChild(script);
  });
}

/**
 * Initialize Tesseract worker
 * Only load English - much faster (~2MB vs 50MB for multiple languages)
 */
async function initWorker() {
  if (tesseractWorker) return tesseractWorker;
  
  const Tesseract = await loadTesseract();
  
  // Only English for speed - covers most ID documents
  tesseractWorker = await Tesseract.createWorker('eng', 1, {
    logger: m => {
      if (m.status === 'recognizing text') {
        const progress = Math.round(m.progress * 100);
        document.dispatchEvent(new CustomEvent('ocr-progress', { detail: { progress } }));
      }
    }
  });
  
  console.log('✅ Tesseract worker initialized (English only for speed)');
  return tesseractWorker;
}

/**
 * Perform OCR on an image
 * @param {File|Blob|string} image - Image file, blob, or data URL
 * @param {boolean} mrzFirst - Try MRZ zone first
 * @returns {Promise<{text: string, mrzResult: object|null}>} - Extracted text and MRZ result
 */
async function performOCR(image, mrzFirst = true) {
  const worker = await initWorker();
  
  let mrzResult = null;
  
  if (mrzFirst) {
    // First try MRZ zone (bottom 35% of image)
    console.log(' Scanning MRZ zone first...');
    const mrzImage = await preprocessImage(image, true);
    const { data: { text: mrzText } } = await worker.recognize(mrzImage);
    console.log('📝 MRZ OCR text:', mrzText);
    
    mrzResult = parseMRZ(mrzText);
    if (mrzResult) {
      return { text: mrzText, mrzResult };
    }
  }
  
  // Fall back to full image scan
  console.log(' Scanning full document...');
  const processedImage = await preprocessImage(image, false);
  const { data: { text } } = await worker.recognize(processedImage);
  
  // Try MRZ parsing on full text too
  if (!mrzResult) {
    mrzResult = parseMRZ(text);
  }
  
  return { text, mrzResult };
}

/**
 * Preprocess image for better OCR results
 * Creates multiple versions: full image and MRZ zone (bottom 30%)
 */
async function preprocessImage(image, mrzOnly = false) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      // Scale up
      const scale = Math.max(1, 2000 / Math.max(img.width, img.height));
      
      if (mrzOnly) {
        // Extract only bottom 35% where MRZ typically is
        const mrzHeight = Math.floor(img.height * 0.35);
        const mrzY = img.height - mrzHeight;
        canvas.width = img.width * scale;
        canvas.height = mrzHeight * scale;
        ctx.drawImage(img, 0, mrzY, img.width, mrzHeight, 0, 0, canvas.width, canvas.height);
      } else {
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      }
      
      // Get image data
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      
      // Convert to high contrast black/white
      for (let i = 0; i < data.length; i += 4) {
        const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        // Adaptive threshold - MRZ text is usually dark on light
        const threshold = gray > 130 ? 255 : 0;
        data[i] = threshold;
        data[i + 1] = threshold;
        data[i + 2] = threshold;
      }
      
      ctx.putImageData(imageData, 0, 0);
      
      console.log('📷 Image preprocessed' + (mrzOnly ? ' (MRZ zone)' : '') + ':', canvas.width, 'x', canvas.height);
      resolve(canvas.toDataURL('image/png'));
    };
    
    if (typeof image === 'string') {
      img.src = image;
    } else {
      img.src = URL.createObjectURL(image);
    }
  });
}

/**
 * Extract name from Swedish ID card/driver's license
 * Swedish IDs have labels like "EFTERNAMN", "FÖRNAMN", "Surname", "Given names"
 */
function extractSwedishIDName(text) {
  console.log('🔍 ===== NAME EXTRACTION =====');
  console.log('🔍 Full OCR text:', text);
  
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  console.log('🔍 Lines:', lines);
  
  let surname = null;
  let givenNames = null;
  
  // Method 1: Look for Swedish driver's license numbered fields
  // Format: "1. SURNAME" and "2. GIVEN NAMES" (with possible OCR noise before)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Match field 1 (surname) - pattern like "be 1. LEDEL" or "1. SVENSSON"
    // The "1." can have garbage before it from OCR
    const field1Match = line.match(/\b1\s*[.\s]+\s*([A-ZÅÄÖÉ][A-ZÅÄÖÉa-zåäöé\s-]+)/i);
    if (field1Match && !surname) {
      const potential = field1Match[1].replace(/[^A-ZÅÄÖÉa-zåäöé\s-]/gi, '').trim();
      // Filter out noise words
      if (potential.length >= 2 && !potential.match(/KÖRKORT|SVERIGE|TRANSPORT|STYRELSEN|LICENSE/i)) {
        surname = potential.toUpperCase();
        console.log('🔍 Found surname via field 1:', surname);
      }
    }
    
    // Match field 2 (given names) - pattern like "oT 2. LARS ERIC KRISTIAN"
    const field2Match = line.match(/\b2\s*[.\s]+\s*([A-ZÅÄÖÉ][A-ZÅÄÖÉa-zåäöé\s-]+)/i);
    if (field2Match && !givenNames) {
      const potential = field2Match[1].replace(/[^A-ZÅÄÖÉa-zåäöé\s-]/gi, '').trim();
      if (potential.length >= 2 && !potential.match(/KÖRKORT|SVERIGE|TRANSPORT|STYRELSEN|LICENSE/i)) {
        givenNames = potential.toUpperCase();
        console.log('🔍 Found given names via field 2:', givenNames);
      }
    }
  }
  
  // Method 2: Look for labeled fields (EFTERNAMN, SURNAME, FÖRNAMN, GIVEN)
  if (!surname || !givenNames) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].toUpperCase();
      const nextLine = (lines[i + 1] || '').trim();
      
      // Swedish: EFTERNAMN / Surname
      if ((line.includes('EFTERNAMN') || line.includes('SURNAME')) && !surname) {
        const afterLabel = line.replace(/.*(?:EFTERNAMN|SURNAME)[/\s:]*/i, '').trim();
        if (afterLabel.length > 1 && afterLabel.match(/^[A-ZÅÄÖ]/i)) {
          surname = afterLabel.replace(/[^A-ZÅÄÖ\s-]/gi, '').trim();
        } else if (nextLine && nextLine.length > 1 && !nextLine.match(/^\d|FÖRNAMN|GIVEN|BIRTH|FÖDD|SURNAME/i)) {
          surname = nextLine.replace(/[^A-ZÅÄÖ\s-]/gi, '').trim().toUpperCase();
        }
      }
      
      // Swedish: FÖRNAMN / Given names
      if ((line.includes('FÖRNAMN') || line.includes('GIVEN')) && !givenNames) {
        const afterLabel = line.replace(/.*(?:FÖRNAMN|GIVEN\s*NAME[S]?)[/\s:]*/i, '').trim();
        if (afterLabel.length > 1 && afterLabel.match(/^[A-ZÅÄÖ]/i)) {
          givenNames = afterLabel.replace(/[^A-ZÅÄÖ\s-]/gi, '').trim();
        } else if (nextLine && nextLine.length > 1 && !nextLine.match(/^\d|EFTERNAMN|SURNAME|BIRTH|FÖDD|GIVEN/i)) {
          givenNames = nextLine.replace(/[^A-ZÅÄÖ\s-]/gi, '').trim().toUpperCase();
        }
      }
    }
  }
  
  // Method 3: Regex patterns for EU format
  if (!surname) {
    const patterns = [
      /1[.\s]*(?:EFTERNAMN|SURNAME)[/\s:]*([A-ZÅÄÖ][A-ZÅÄÖ\s-]{1,30})/i,
      /EFTERNAMN[/\s:]*([A-ZÅÄÖ][A-ZÅÄÖ\s-]{1,30})/i,
      /SURNAME[/\s:]*([A-ZÅÄÖ][A-ZÅÄÖ\s-]{1,30})/i,
    ];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        surname = match[1].trim();
        break;
      }
    }
  }
  
  if (!givenNames) {
    const patterns = [
      /2[.\s]*(?:FÖRNAMN|GIVEN\s*NAME[S]?)[/\s:]*([A-ZÅÄÖ][A-ZÅÄÖ\s-]{1,30})/i,
      /FÖRNAMN[/\s:]*([A-ZÅÄÖ][A-ZÅÄÖ\s-]{1,30})/i,
      /GIVEN\s*NAME[S]?[/\s:]*([A-ZÅÄÖ][A-ZÅÄÖ\s-]{1,30})/i,
    ];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        givenNames = match[1].trim();
        break;
      }
    }
  }
  
  // Method 4: Look for capitalized name-like strings near the top (common on IDs)
  if (!surname && !givenNames) {
    const nameLines = lines.filter((l, idx) => 
      idx < 10 && 
      l.match(/^[A-ZÅÄÖ][A-ZÅÄÖ\s-]{2,25}$/) && 
      !l.match(/KÖRKORT|LICENSE|SVERIGE|SWEDEN|IDENTITY|TRANSPORTSTYRELSEN|PASSPORT/i)
    );
    
    if (nameLines.length >= 2) {
      surname = nameLines[0];
      givenNames = nameLines[1];
      console.log('📝 Found names from capitalized lines:', nameLines);
    } else if (nameLines.length === 1) {
      const parts = nameLines[0].split(/\s+/);
      if (parts.length >= 2) {
        surname = parts[parts.length - 1];
        givenNames = parts.slice(0, -1).join(' ');
      }
    }
  }
  
  // Clean up extracted names - remove numbers and excess whitespace
  if (surname) surname = surname.replace(/[^A-ZÅÄÖ\s-]/gi, '').replace(/\s+/g, ' ').trim();
  if (givenNames) givenNames = givenNames.replace(/[^A-ZÅÄÖ\s-]/gi, '').replace(/\s+/g, ' ').trim();
  
  // Filter out obviously wrong matches
  if (surname && surname.length < 2) surname = null;
  if (givenNames && givenNames.length < 2) givenNames = null;
  
  if (surname || givenNames) {
    const result = {
      surname: surname || '',
      givenNames: givenNames || '',
      fullName: `${givenNames || ''} ${surname || ''}`.trim()
    };
    console.log('📝 Swedish ID name extracted:', result);
    return result;
  }
  
  console.log('❌ Could not extract name from document');
  return null;
}

/**
 * Parse MRZ (Machine Readable Zone) from OCR text
 * MRZ contains birth date in YYMMDD format
 */
function parseMRZ(text) {
  console.log('🔍 ===== parseMRZ called =====');
  
  // Clean text - MRZ uses specific characters
  const cleaned = text.toUpperCase().replace(/[^A-Z0-9<\n\-]/g, '');
  const rawText = text.toUpperCase();
  const lines = cleaned.split(/\n/).filter(l => l.length > 10);
  
  console.log(' MRZ candidates:', lines);
  
  // Try to extract name from MRZ (usually in first line)
  let extractedName = null;
  for (const line of lines) {
    // MRZ name format: SURNAME<<GIVENNAME<MIDDLE<
    const nameMatch = line.match(/([A-Z]+)<<([A-Z<]+)/);
    if (nameMatch) {
      const surname = nameMatch[1];
      const givenNames = nameMatch[2].replace(/<+/g, ' ').trim();
      extractedName = {
        surname: surname,
        givenNames: givenNames,
        fullName: `${givenNames} ${surname}`.trim()
      };
      console.log(' MRZ name extracted:', extractedName);
      break;
    }
  }
  
  // If no MRZ name found, try Swedish ID format
  // Swedish driver's license/ID has name fields like "EFTERNAMN/SURNAME" and "FÖRNAMN/GIVEN NAMES"
  if (!extractedName) {
    console.log('🔍 No MRZ name, trying Swedish ID extraction...');
    extractedName = extractSwedishIDName(text);
  } else {
    console.log('🔍 MRZ name found:', extractedName);
  }
  
  // SWEDISH PERSONNUMMER - most reliable for Swedish IDs
  // Format: YYMMDD-XXXX or YYYYMMDD-XXXX
  const personnummerMatch = rawText.match(/(\d{2})(\d{2})(\d{2})[-\s]?(\d{4})/g);
  
  if (personnummerMatch) {
    for (const pnr of personnummerMatch) {
      const digits = pnr.replace(/[-\s]/g, '');
      const yy = digits.substring(0, 2);
      const mm = digits.substring(2, 4);
      const dd = digits.substring(4, 6);
      const lastFour = digits.substring(6, 10);
      
      // Validate month and day
      if (parseInt(mm) >= 1 && parseInt(mm) <= 12 && parseInt(dd) >= 1 && parseInt(dd) <= 31) {
        // Swedish personnummer: if > current year short, it's 1900s
        const currentYearShort = new Date().getFullYear() % 100;
        const year = parseInt(yy) > currentYearShort ? '19' + yy : '20' + yy;
        
        // But if year would make person < 16, assume 1900s (for adult IDs)
        const birthYear = parseInt(year);
        const age = new Date().getFullYear() - birthYear;
        const finalYear = age < 16 ? '19' + yy : year;
        
        const dateStr = `${finalYear}-${mm}-${dd}`;
        const testDate = new Date(dateStr);
        
        // Format personnummer as YYMMDD-XXXX
        const formattedPnr = `${yy}${mm}${dd}-${lastFour}`;
        
        if (!isNaN(testDate.getTime()) && testDate < new Date()) {
          console.log('✅ Swedish personnummer found:', formattedPnr, '→ birth date:', dateStr);
          return { 
            date: dateStr, 
            confidence: 0.98, 
            source: 'personnummer',
            personnummer: formattedPnr,
            name: extractedName
          };
        }
      }
    }
  }
  
  // Look for MRZ patterns (fallback for non-Swedish documents)
  // TD1 (ID cards): 3 lines of 30 chars
  // TD2 (some IDs): 2 lines of 36 chars  
  // TD3 (passports): 2 lines of 44 chars
  
  for (const line of lines) {
    // Birth date pattern in MRZ: YYMMDD followed by check digit
    const mrzDateMatch = line.match(/([0-9]{2})(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])([0-9MF<])/g);
    
    if (mrzDateMatch) {
      for (const match of mrzDateMatch) {
        const yy = match.substring(0, 2);
        const mm = match.substring(2, 4);
        const dd = match.substring(4, 6);
        
        // Convert YY to YYYY - assume adult (> 16 years old)
        const currentYearShort = new Date().getFullYear() % 100;
        let year = parseInt(yy) > currentYearShort ? '19' + yy : '20' + yy;
        const age = new Date().getFullYear() - parseInt(year);
        if (age < 16) year = '19' + yy;
        
        const dateStr = `${year}-${mm}-${dd}`;
        
        // Validate it's a real date and person is at least 16
        const testDate = new Date(dateStr);
        const personAge = (new Date().getFullYear() - testDate.getFullYear());
        
        if (!isNaN(testDate.getTime()) && testDate < new Date() && personAge >= 16) {
          console.log('✅ MRZ birth date found:', dateStr);
          return { date: dateStr, confidence: 0.95, source: 'MRZ', name: extractedName };
        }
      }
    }
  }
  
  return null;
}

/**
 * Parse birth date from OCR text
 * Handles multiple formats:
 * - European: DD.MM.YYYY, DD/MM/YYYY, DD-MM-YYYY
 * - Swedish: YYYYMMDD, YYMMDD (personnummer)
 * - ISO: YYYY-MM-DD
 * - Written: "Born: January 15, 1990"
 * - Dutch/German license: field 3 is birth date
 */
function parseBirthDate(text) {
  const results = [];
  
  // Clean text - keep original for debugging
  const cleanText = text.replace(/\s+/g, ' ').trim();
  console.log('📝 OCR Raw text:', text);
  console.log('📝 OCR Clean text:', cleanText);
  
  // Pattern 1: Swedish personnummer YYYYMMDD-XXXX or YYMMDD-XXXX
  const personnummerFull = /\b(19|20)(\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])[-\s]?\d{4}\b/g;
  let match;
  while ((match = personnummerFull.exec(cleanText)) !== null) {
    const year = parseInt(match[1] + match[2]);
    const month = parseInt(match[3]);
    const day = parseInt(match[4]);
    if (isValidDate(year, month, day)) {
      results.push({
        date: `${year}-${pad(month)}-${pad(day)}`,
        confidence: 0.95,
        source: 'personnummer'
      });
    }
  }
  
  // Pattern 2: YYYYMMDD without separator
  const yyyymmdd = /\b(19|20)(\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\b/g;
  while ((match = yyyymmdd.exec(cleanText)) !== null) {
    const year = parseInt(match[1] + match[2]);
    const month = parseInt(match[3]);
    const day = parseInt(match[4]);
    if (isValidDate(year, month, day) && !results.find(r => r.date === `${year}-${pad(month)}-${pad(day)}`)) {
      results.push({
        date: `${year}-${pad(month)}-${pad(day)}`,
        confidence: 0.85,
        source: 'yyyymmdd'
      });
    }
  }
  
  // Pattern 3: ISO format YYYY-MM-DD
  const isoDate = /\b(19|20)(\d{2})[-/.](0[1-9]|1[0-2])[-/.](0[1-9]|[12]\d|3[01])\b/g;
  while ((match = isoDate.exec(cleanText)) !== null) {
    const year = parseInt(match[1] + match[2]);
    const month = parseInt(match[3]);
    const day = parseInt(match[4]);
    if (isValidDate(year, month, day)) {
      results.push({
        date: `${year}-${pad(month)}-${pad(day)}`,
        confidence: 0.9,
        source: 'iso'
      });
    }
  }
  
  // Pattern 4: European DD.MM.YYYY or DD/MM/YYYY or DD-MM-YYYY
  const euroDate = /\b(0?[1-9]|[12]\d|3[01])[-/.\s](0?[1-9]|1[0-2])[-/.\s](19|20)?(\d{2})\b/g;
  while ((match = euroDate.exec(cleanText)) !== null) {
    const day = parseInt(match[1]);
    const month = parseInt(match[2]);
    let year = parseInt(match[4]);
    // Handle 2-digit years
    if (!match[3]) {
      year = year > 50 ? 1900 + year : 2000 + year;
    } else {
      year = parseInt(match[3] + match[4]);
    }
    if (isValidDate(year, month, day)) {
      results.push({
        date: `${year}-${pad(month)}-${pad(day)}`,
        confidence: 0.85,
        source: 'european'
      });
    }
  }
  
  // Pattern 5: Any date-like sequence DD MM YYYY with various separators
  const anyDate = /(\d{1,2})[.\-\/\s]+(\d{1,2})[.\-\/\s]+(\d{2,4})/g;
  while ((match = anyDate.exec(cleanText)) !== null) {
    let day = parseInt(match[1]);
    let month = parseInt(match[2]);
    let year = parseInt(match[3]);
    
    // Handle 2-digit years
    if (year < 100) {
      year = year > 50 ? 1900 + year : 2000 + year;
    }
    
    // Could be MM/DD/YYYY or DD/MM/YYYY - try both if ambiguous
    if (isValidDate(year, month, day) && year >= 1920 && year <= 2010) {
      results.push({
        date: `${year}-${pad(month)}-${pad(day)}`,
        confidence: 0.7,
        source: 'any_date'
      });
    }
    // Try swapped (US format)
    if (day <= 12 && month <= 31 && isValidDate(year, day, month) && year >= 1920 && year <= 2010) {
      results.push({
        date: `${year}-${pad(day)}-${pad(month)}`,
        confidence: 0.6,
        source: 'any_date_swapped'
      });
    }
  }
  
  // Pattern 6: Look for keywords like "Birth", "DOB", "Född", "Geboren", "Geboortedatum"
  const birthKeywords = /(?:birth|dob|born|född|geboren|geboortedatum|naissance|nascimento|date\s*of\s*birth|3\.?)[:\s]*(\d{1,2}[.\-\/\s]+\d{1,2}[.\-\/\s]+\d{2,4})/gi;
  while ((match = birthKeywords.exec(cleanText)) !== null) {
    const dateStr = match[1].trim();
    const parsed = parseLooseDateString(dateStr);
    if (parsed) {
      results.push({
        date: parsed,
        confidence: 0.95,
        source: 'keyword'
      });
    }
  }
  
  // Sort by confidence and return best match
  results.sort((a, b) => b.confidence - a.confidence);
  
  // Remove duplicates
  const unique = [];
  const seen = new Set();
  for (const r of results) {
    if (!seen.has(r.date)) {
      seen.add(r.date);
      unique.push(r);
    }
  }
  
  return unique;
}

/**
 * Parse income amount from OCR text
 * Handles multiple formats and currencies
 */
function parseIncomeAmount(text) {
  const results = [];
  
  // Clean text
  const cleanText = text.replace(/\n/g, ' ').replace(/\s+/g, ' ');
  
  // Keywords that indicate income
  const incomeKeywords = [
    'total income', 'gross income', 'annual salary', 'yearly salary',
    'bruttolön', 'årsinkomst', 'totalt', 'summa inkomster',
    'taxerad förvärvsinkomst', 'fastställd förvärvsinkomst',
    'einkommen', 'jahresgehalt', 'bruttoeinkommen',
    'revenu', 'salaire annuel',
    'salary', 'wages', 'earnings', 'compensation'
  ];
  
  // Pattern 1: Currency symbol followed by number
  // $50,000 or $50.000 or $50 000
  const currencyPattern = /[$€£¥kr]\s?([\d\s,.]+)/gi;
  let match;
  while ((match = currencyPattern.exec(cleanText)) !== null) {
    const amount = parseNumber(match[1]);
    if (amount > 1000 && amount < 100000000) {
      results.push({
        amount,
        confidence: 0.7,
        source: 'currency_symbol'
      });
    }
  }
  
  // Pattern 2: Number followed by currency
  const numberCurrencyPattern = /([\d\s,.]+)\s?(kr|sek|usd|eur|gbp|dollars?|kronor)/gi;
  while ((match = numberCurrencyPattern.exec(cleanText)) !== null) {
    const amount = parseNumber(match[1]);
    if (amount > 1000 && amount < 100000000) {
      results.push({
        amount,
        confidence: 0.75,
        source: 'number_currency'
      });
    }
  }
  
  // Pattern 3: Look for income keywords near numbers
  for (const keyword of incomeKeywords) {
    const keywordRegex = new RegExp(keyword + '[:\\s]*([$€£kr]?[\\d\\s,.]+)', 'gi');
    while ((match = keywordRegex.exec(cleanText)) !== null) {
      const amount = parseNumber(match[1]);
      if (amount > 1000 && amount < 100000000) {
        results.push({
          amount,
          confidence: 0.9,
          source: 'keyword_' + keyword.substring(0, 10)
        });
      }
    }
  }
  
  // Pattern 4: Large numbers that look like salaries (5-7 digits)
  const largeNumbers = /\b([\d]{1,3}[\s,.]?[\d]{3}[\s,.]?[\d]{0,3})\b/g;
  while ((match = largeNumbers.exec(cleanText)) !== null) {
    const amount = parseNumber(match[1]);
    if (amount >= 10000 && amount <= 10000000) {
      // Check if it's not a date or ID number
      const context = cleanText.substring(Math.max(0, match.index - 20), match.index + match[0].length + 20);
      if (!context.match(/\b(19|20)\d{2}\b/) && !context.match(/id|nummer|number/i)) {
        results.push({
          amount,
          confidence: 0.5,
          source: 'large_number'
        });
      }
    }
  }
  
  // Sort by confidence and remove duplicates
  results.sort((a, b) => b.confidence - a.confidence);
  
  const unique = [];
  const seen = new Set();
  for (const r of results) {
    if (!seen.has(r.amount)) {
      seen.add(r.amount);
      unique.push(r);
    }
  }
  
  return unique;
}

/**
 * Helper: Parse a number from various formats
 */
function parseNumber(str) {
  // Remove currency symbols and extra spaces
  let clean = str.replace(/[$€£¥kr]/gi, '').trim();
  
  // Determine decimal separator
  // If there's a comma followed by exactly 2 digits at the end, it's a decimal
  // Otherwise, commas and periods are thousand separators
  if (/,\d{2}$/.test(clean)) {
    // European format: 50.000,00
    clean = clean.replace(/\./g, '').replace(',', '.');
  } else if (/\.\d{2}$/.test(clean)) {
    // US format: 50,000.00
    clean = clean.replace(/,/g, '');
  } else {
    // No decimals, just remove separators
    clean = clean.replace(/[\s,.]/g, '');
  }
  
  return parseInt(clean) || 0;
}

/**
 * Helper: Parse a loose date string
 */
function parseLooseDateString(str) {
  // Try various date formats
  const formats = [
    // YYYY-MM-DD
    /(\d{4})[-/.](0?[1-9]|1[0-2])[-/.](0?[1-9]|[12]\d|3[01])/,
    // DD-MM-YYYY
    /(0?[1-9]|[12]\d|3[01])[-/.](0?[1-9]|1[0-2])[-/.](\d{4})/,
    // Month DD, YYYY
    /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})/i,
    // DD Month YYYY
    /(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{4})/i
  ];
  
  for (const fmt of formats) {
    const match = str.match(fmt);
    if (match) {
      let year, month, day;
      
      if (fmt === formats[0]) {
        year = parseInt(match[1]);
        month = parseInt(match[2]);
        day = parseInt(match[3]);
      } else if (fmt === formats[1]) {
        day = parseInt(match[1]);
        month = parseInt(match[2]);
        year = parseInt(match[3]);
      } else if (fmt === formats[2]) {
        month = monthNameToNumber(match[1]);
        day = parseInt(match[2]);
        year = parseInt(match[3]);
      } else if (fmt === formats[3]) {
        day = parseInt(match[1]);
        month = monthNameToNumber(match[2]);
        year = parseInt(match[3]);
      }
      
      if (isValidDate(year, month, day)) {
        return `${year}-${pad(month)}-${pad(day)}`;
      }
    }
  }
  
  return null;
}

/**
 * Helper: Convert month name to number
 */
function monthNameToNumber(name) {
  const months = {
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
    jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12
  };
  return months[name.toLowerCase().substring(0, 3)] || 0;
}

/**
 * Helper: Pad number to 2 digits
 */
function pad(n) {
  return n.toString().padStart(2, '0');
}

/**
 * Helper: Validate a date
 */
function isValidDate(year, month, day) {
  if (year < 1900 || year > new Date().getFullYear()) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && 
         date.getMonth() === month - 1 && 
         date.getDate() === day;
}

/**
 * Calculate SHA-256 hash of a file
 * Used to prove document existed without storing it
 */
async function hashFile(file) {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Validate that uploaded image is an actual ID document
 * Returns validation result with confidence and reasons
 */
function validateIDDocument(ocrText, mrzResult, dates, hasFaceOnDocument = false) {
  const reasons = [];
  let confidence = 0;
  let isValid = false;
  
  const textLower = ocrText.toLowerCase();
  
  // Check 1: MRZ found (very strong indicator)
  if (mrzResult && mrzResult.confidence >= ID_VALIDATION.MIN_MRZ_CONFIDENCE) {
    confidence += 0.5;
    reasons.push('MRZ zone detected');
  }
  
  // Check 2: Birth date found with good confidence
  if (dates.length > 0) {
    const bestDate = dates[0];
    if (bestDate.confidence >= ID_VALIDATION.MIN_DATE_CONFIDENCE) {
      confidence += 0.3;
      reasons.push(`Birth date found (${Math.round(bestDate.confidence * 100)}% confidence)`);
    } else if (bestDate.confidence >= 0.6) {
      confidence += 0.15;
      reasons.push(`Birth date found (low confidence: ${Math.round(bestDate.confidence * 100)}%)`);
    }
  }
  
  // Check 3: Face detected on document
  if (hasFaceOnDocument) {
    confidence += 0.2;
    reasons.push('Face photo detected on document');
  }
  
  // Check 4: ID-related keywords
  let keywordCount = 0;
  const foundKeywords = [];
  for (const keyword of ID_KEYWORDS) {
    if (textLower.includes(keyword.toLowerCase())) {
      keywordCount++;
      if (foundKeywords.length < 5) foundKeywords.push(keyword);
    }
  }
  
  if (keywordCount >= ID_VALIDATION.MIN_ID_KEYWORDS) {
    confidence += 0.1 * Math.min(keywordCount, 5) / 5; // Max 0.1 for keywords
    reasons.push(`ID keywords found: ${foundKeywords.join(', ')}`);
  }
  
  // Check 5: Document structure indicators
  // MRZ lines (<<<) or chevrons
  if (textLower.includes('<<<') || textLower.match(/<{3,}/)) {
    confidence += 0.1;
    reasons.push('MRZ character pattern detected');
  }
  
  // Check 6: Personnummer (Swedish ID - very reliable)
  if (dates.some(d => d.source === 'personnummer' || d.personnummer)) {
    confidence += 0.2;
    reasons.push('Swedish personnummer detected');
  }
  
  // Determine validity based on combined signals
  // Need at least one strong signal or multiple weak signals
  const hasMRZ = mrzResult && mrzResult.confidence >= ID_VALIDATION.MIN_MRZ_CONFIDENCE;
  const hasGoodDate = dates.length > 0 && dates[0].confidence >= ID_VALIDATION.MIN_DATE_CONFIDENCE;
  const hasPersonnummer = dates.some(d => d.source === 'personnummer' || d.personnummer);
  const hasEnoughKeywords = keywordCount >= ID_VALIDATION.MIN_ID_KEYWORDS;
  
  // Valid if: MRZ found, or (date + face), or (date + keywords), or personnummer
  if (hasMRZ) {
    isValid = true;
    reasons.unshift('Valid ID: MRZ zone confirmed');
  } else if (hasPersonnummer) {
    isValid = true;
    reasons.unshift('Valid ID: Swedish personnummer confirmed');
  } else if (hasGoodDate && hasFaceOnDocument) {
    isValid = true;
    reasons.unshift('Valid ID: Birth date + face photo detected');
  } else if (hasGoodDate && hasEnoughKeywords) {
    isValid = true;
    reasons.unshift('Valid ID: Birth date + ID keywords detected');
  } else if (confidence >= 0.5) {
    isValid = true;
    reasons.unshift('Likely ID document (medium confidence)');
  } else {
    isValid = false;
    reasons.unshift('Could not verify as ID document');
    
    // Add helpful feedback
    if (!hasGoodDate) {
      reasons.push('Tip: Ensure the full ID card/passport is visible with good lighting');
    }
    if (!hasFaceOnDocument && ID_VALIDATION.REQUIRE_FACE_ON_ID) {
      reasons.push('Tip: Make sure the photo on the ID is clearly visible');
    }
  }
  
  return {
    isValid,
    confidence: Math.min(confidence, 1.0),
    reasons,
    details: {
      hasMRZ,
      hasGoodDate,
      hasPersonnummer,
      hasFaceOnDocument,
      keywordCount,
      foundKeywords
    }
  };
}

/**
 * Main function: Extract birth date from ID document
 */
async function extractBirthDate(imageFile, onProgress) {
  const startTime = Date.now();
  
  // Hash the document first
  const docHash = await hashFile(imageFile);
  
  // Progress callback
  if (onProgress) onProgress({ stage: 'ocr', progress: 0 });
  
  // Perform OCR with MRZ priority
  const { text, mrzResult } = await performOCR(imageFile, true);
  
  if (onProgress) onProgress({ stage: 'parsing', progress: 100 });
  
  // If MRZ parsing found a date, use it directly
  if (mrzResult) {
    console.log('✅ Using MRZ result:', mrzResult);
    
    // If no name from MRZ, try to extract from full text
    if (!mrzResult.name) {
      mrzResult.name = extractSwedishIDName(text);
    }
    
    const duration = Date.now() - startTime;
    return {
      dates: [mrzResult], // mrzResult includes personnummer if found
      rawText: text,
      documentHash: docHash,
      processingTime: duration,
      source: 'MRZ',
      personnummer: mrzResult.personnummer || null,
      name: mrzResult.name || null
    };
  }
  
  // Fall back to general date parsing
  const dates = parseBirthDate(text);
  
  // Try to extract name from full text
  const extractedName = extractSwedishIDName(text);
  
  // Add name to first date result if found
  if (dates.length > 0 && extractedName && !dates[0].name) {
    dates[0].name = extractedName;
  }
  
  const duration = Date.now() - startTime;
  console.log(`OCR completed in ${duration}ms, found ${dates.length} dates`);
  
  // Check if any date has personnummer
  const pnrDate = dates.find(d => d.personnummer);
  
  return {
    dates,
    rawText: text,
    documentHash: docHash,
    processingTime: duration,
    source: 'text',
    personnummer: pnrDate?.personnummer || null,
    name: extractedName || (dates[0]?.name || null)
  };
}

/**
 * Main function: Extract income from financial document
 */
async function extractIncome(imageFile, onProgress) {
  const startTime = Date.now();
  
  // Hash the document first
  const docHash = await hashFile(imageFile);
  
  if (onProgress) onProgress({ stage: 'ocr', progress: 0 });
  
  // Perform OCR
  const text = await performOCR(imageFile);
  
  if (onProgress) onProgress({ stage: 'parsing', progress: 100 });
  
  // Parse income
  const amounts = parseIncomeAmount(text);
  
  const duration = Date.now() - startTime;
  console.log(`OCR completed in ${duration}ms, found ${amounts.length} amounts`);
  
  return {
    amounts,
    rawText: text,
    documentHash: docHash,
    processingTime: duration
  };
}

// Export for global use
window.DocumentOCR = {
  loadTesseract,
  extractBirthDate,
  extractIncome,
  hashFile,
  parseBirthDate,
  parseIncomeAmount,
  validateIDDocument,
  ID_VALIDATION  // Export settings for customization
};

console.log('✅ document-ocr.js loaded');
