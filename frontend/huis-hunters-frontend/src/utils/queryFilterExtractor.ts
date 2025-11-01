/**
 * Utility to extract filter terms from search queries
 * Examples:
 * - "with a garden" → { outdoor: ['garden'] }
 * - "2 bedroom apartment" → { bedrooms: '2' }
 * - "ground floor" → { floor: 'ground' }
 */

export interface ExtractedFilters {
  bedrooms?: string;
  floor?: string;
  outdoor?: string[];
  minSize?: string;
  areas?: string[];
  // Remaining query text after removing filter terms
  cleanedQuery: string;
}

export function extractFiltersFromQuery(query: string, availableNeighborhoods: string[] = []): ExtractedFilters {
  const result: ExtractedFilters = {
    cleanedQuery: query,
    outdoor: []
  };

  if (!query || !query.trim()) {
    return result;
  }

  const lowerQuery = query.toLowerCase().trim();
  let cleanedQuery = query;

  // Extract bedroom filters
  // Match patterns like "2 bedroom", "2 bedrooms", "3-bedroom", "three bedroom"
  const bedroomPatterns = [
    /(\d+)\s*[-]?\s*bedroom/i,
    /(\d+)\s*[-]?\s*bed/i,
    /one\s+bedroom/i,
    /two\s+bedroom/i,
    /three\s+bedroom/i,
    /four\s+bedroom/i,
    /five\s+bedroom/i
  ];

  for (const pattern of bedroomPatterns) {
    const match = lowerQuery.match(pattern);
    if (match) {
      let bedroomValue = match[1];
      if (!bedroomValue) {
        // Handle word-based numbers
        if (pattern.toString().includes('one')) bedroomValue = '1';
        if (pattern.toString().includes('two')) bedroomValue = '2';
        if (pattern.toString().includes('three')) bedroomValue = '3';
        if (pattern.toString().includes('four')) bedroomValue = '4';
        if (pattern.toString().includes('five')) bedroomValue = '5';
      }
      if (bedroomValue) {
        result.bedrooms = bedroomValue;
        // Remove the bedroom term from query
        cleanedQuery = cleanedQuery.replace(pattern, '').trim();
        break;
      }
    }
  }

  // Extract floor filters
  // Match patterns like "ground floor", "top floor", "ground-floor", etc.
  const floorPatterns = [
    /\bground\s+floor\b/i,
    /\bground[-]floor\b/i,
    /\bground\b/i, // Just "ground" if context suggests floor
    /\btop\s+floor\b/i,
    /\btop[-]floor\b/i,
    /\bhigh\s+floor\b/i,
    /\bhigh[-]floor\b/i
  ];

  // Check if "ground" or "top" is part of a floor phrase
  if (/\bground\s+floor\b/i.test(lowerQuery) || /\bground[-]floor\b/i.test(lowerQuery)) {
    result.floor = 'ground';
    cleanedQuery = cleanedQuery.replace(/\bground\s*[-]?\s*floor\b/gi, '').trim();
  } else if (/\btop\s+floor\b/i.test(lowerQuery) || /\btop[-]floor\b/i.test(lowerQuery)) {
    result.floor = 'top';
    cleanedQuery = cleanedQuery.replace(/\btop\s*[-]?\s*floor\b/gi, '').trim();
  } else if (/\bhigh\s+floor\b/i.test(lowerQuery) || /\bhigh[-]floor\b/i.test(lowerQuery)) {
    result.floor = 'top'; // Treat "high floor" as top floor
    cleanedQuery = cleanedQuery.replace(/\bhigh\s*[-]?\s*floor\b/gi, '').trim();
  }

  // Extract outdoor space filters
  // Match patterns like "with a garden", "with garden", "garden", "rooftop", "balcony", etc.
  const outdoorTerms: { [key: string]: string } = {
    'garden': 'garden',
    'gardens': 'garden',
    'rooftop': 'rooftop',
    'rooftops': 'rooftop',
    'roof\s+terrace': 'rooftop',
    'roof[-]terrace': 'rooftop',
    'terrace': 'rooftop', // Default terrace to rooftop unless specified otherwise
    'balcony': 'balcony',
    'balconies': 'balcony',
    'outdoor\s+space': 'garden', // Generic outdoor space
    'patio': 'garden'
  };

  const outdoorValues: string[] = [];

  // Check for "with" phrases first (more specific)
  if (/\bwith\s+a\s+garden\b/i.test(lowerQuery) || /\bwith\s+garden\b/i.test(lowerQuery)) {
    outdoorValues.push('garden');
    cleanedQuery = cleanedQuery.replace(/\bwith\s+a?\s+garden\b/gi, '').trim();
  }

  // Check for other "with" phrases
  for (const [term, value] of Object.entries(outdoorTerms)) {
    if (outdoorValues.includes(value)) continue; // Already added
    
    const pattern = new RegExp(`\\bwith\\s+a?\\s+${term}\\b`, 'i');
    if (pattern.test(lowerQuery)) {
      outdoorValues.push(value);
      cleanedQuery = cleanedQuery.replace(pattern, '').trim();
    }
  }

  // If no "with" phrases found, check for standalone terms
  if (outdoorValues.length === 0) {
    for (const [term, value] of Object.entries(outdoorTerms)) {
      if (outdoorValues.includes(value)) continue;
      
      const pattern = new RegExp(`\\b${term}\\b`, 'i');
      if (pattern.test(lowerQuery)) {
        outdoorValues.push(value);
        cleanedQuery = cleanedQuery.replace(pattern, '').trim();
      }
    }
  }

  // Remove duplicates
  result.outdoor = Array.from(new Set(outdoorValues));

  // Extract neighborhood/area filters
  // Match patterns like "in de pijp", "in Jordaan", "de pijp", etc.
  // Sort neighborhoods by length (longest first) to match multi-word names before single words
  if (availableNeighborhoods.length > 0) {
    const extractedAreas: string[] = [];
    
    // Common prepositions that indicate location
    const locationPrepositions = ['in', 'at', 'near', 'around', 'close to'];
    
    // Sort neighborhoods by length (longest first) to match "De Pijp" before just "Pijp"
    const sortedNeighborhoods = [...availableNeighborhoods].sort((a, b) => b.length - a.length);
    
    // Try to match neighborhoods from the query
    for (const neighborhood of sortedNeighborhoods) {
      // Skip if already extracted (avoid duplicates)
      if (extractedAreas.includes(neighborhood)) {
        continue;
      }
      
      const neighborhoodLower = neighborhood.toLowerCase();
      // Escape special regex characters in neighborhood name
      const escapedNeighborhood = neighborhoodLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      
      // Try matching with preposition first (e.g., "in de pijp")
      for (const prep of locationPrepositions) {
        const pattern1 = new RegExp(`\\b${prep}\\s+${escapedNeighborhood}\\b`, 'i');
        if (pattern1.test(lowerQuery)) {
          extractedAreas.push(neighborhood);
          cleanedQuery = cleanedQuery.replace(pattern1, '').trim();
          break;
        }
      }
      
      // If not found with preposition, try standalone neighborhood name
      if (!extractedAreas.includes(neighborhood)) {
        // Match neighborhood as a whole phrase (case-insensitive)
        // Use word boundaries to ensure we match complete neighborhood names
        const pattern2 = new RegExp(`\\b${escapedNeighborhood}\\b`, 'i');
        if (pattern2.test(lowerQuery)) {
          extractedAreas.push(neighborhood);
          cleanedQuery = cleanedQuery.replace(pattern2, '').trim();
        }
      }
    }
    
    if (extractedAreas.length > 0) {
      result.areas = extractedAreas;
    }
  }

  // Clean up extra whitespace, commas, and common words that might be left
  // Handle commas and spaces that remain after removing filter terms
  // Common words that don't add search value (like "apartment" which appears everywhere)
  const commonSearchWords = new Set(['apartment', 'apartments', 'flat', 'flats', 'house', 'houses', 'property', 'properties', 'listing', 'listings', 'home', 'homes', 'place', 'places']);
  
  cleanedQuery = cleanedQuery
    .replace(/,\s*,/g, ',') // Multiple commas to single comma
    .replace(/\s*,\s*,/g, ',') // Commas with spaces between them
    .replace(/,\s*,\s*/g, ',') // Multiple commas with spaces
    .replace(/^\s*,+\s*/g, '') // Remove leading commas (with optional spaces)
    .replace(/\s*,+\s*$/g, '') // Remove trailing commas (with optional spaces)
    .replace(/,\s*,\s*/g, '') // Remove double commas with spaces (like ", ,")
    .replace(/\s+/g, ' ') // Multiple spaces to single space
    .replace(/^\s*(with|a|an|the|and|or|but|in|on|at|to|for|of|is|are)\s+/i, '') // Remove leading stop words
    .replace(/\s+(with|a|an|the|and|or|but|in|on|at|to|for|of|is|are)\s+$/i, ' ') // Remove trailing stop words
    .replace(/^\s*,+\s*/g, '') // Remove leading commas again after other cleanup
    .replace(/\s*,+\s*$/g, '') // Remove trailing commas again after other cleanup
    .trim();
  
  // Remove common words that don't add search value
  // Split query into words and filter out common words
  const queryWords = cleanedQuery.split(/\s+/).filter(word => {
    const wordLower = word.toLowerCase().replace(/[.,;:!?()]/g, ''); // Remove punctuation
    return wordLower.length > 0 && !commonSearchWords.has(wordLower);
  });
  
  cleanedQuery = queryWords.join(' ').trim();

  // If cleaned query is empty or just whitespace, but we extracted filters, keep the original query
  // This allows users to search for just filter terms
  if (!cleanedQuery && (result.bedrooms || result.floor || result.outdoor?.length)) {
    cleanedQuery = '';
  }

  result.cleanedQuery = cleanedQuery;

  return result;
}

