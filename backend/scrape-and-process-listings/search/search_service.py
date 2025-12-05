import os
import datetime
import statistics
from typing import List, Dict, Any, Optional

import numpy as np
import firebase_admin
from dotenv import load_dotenv
from firebase_admin import credentials, firestore
import vertexai
from vertexai.language_models import TextEmbeddingModel


def log_timestamp(message):
    print(f"[{datetime.datetime.now()}] {message}", flush=True)


def compute_published_cutoff(published_within_days: int) -> Optional[datetime.datetime]:
    """Return a cutoff datetime for listings published within N calendar days.

    Uses calendar days including today. For example:
    - 1 => start of yesterday (today + yesterday = 2 calendar days)
    - 3 => start of 3 days ago (today + 3 previous days = 4 calendar days)
    """
    try:
        if not published_within_days or published_within_days <= 0:
            return None

        # Use local Europe/Amsterdam-like time (UTC+1 approximation) for day boundaries.
        tz = datetime.timezone(datetime.timedelta(hours=1))
        now = datetime.datetime.now(tz)
        start_of_today = datetime.datetime(now.year, now.month, now.day, tzinfo=tz)
        cutoff = start_of_today - datetime.timedelta(days=published_within_days)
        return cutoff
    except Exception as e:
        log_timestamp(f"❗️ Error computing published cutoff: {e}")
        return None


def listing_passes_published_date_filter(listing_data: Dict[str, Any], filters: Dict[str, Any]) -> bool:
    """Check if a listing passes the publishedWithinDays filter, if present."""
    try:
        published_within = filters.get("publishedWithinDays")
        if not published_within:
            return True

        try:
            published_within_int = int(published_within)
        except (TypeError, ValueError):
            return True

        cutoff = compute_published_cutoff(published_within_int)
        if not cutoff:
            return True

        published_at = listing_data.get("publishedAt")

        # Backwards compatibility: fall back to publishDate string if needed
        if not published_at:
            publish_str = listing_data.get("publishDate")
            if isinstance(publish_str, str) and publish_str:
                try:
                    published_at = datetime.datetime.fromisoformat(publish_str)
                except ValueError:
                    try:
                        tz_sep_index = max(publish_str.rfind("+"), publish_str.rfind("-"))
                        if tz_sep_index == -1:
                            core = publish_str
                            tz_part = ""
                        else:
                            core = publish_str[:tz_sep_index]
                            tz_part = publish_str[tz_sep_index:]

                        if "." in core:
                            date_part, frac = core.split(".", 1)
                            frac_digits = "".join(ch for ch in frac if ch.isdigit())
                            if len(frac_digits) > 6:
                                frac_digits = frac_digits[:6]
                            core_fixed = f"{date_part}.{frac_digits}"
                        else:
                            core_fixed = core

                        fixed_str = f"{core_fixed}{tz_part}"
                        published_at = datetime.datetime.fromisoformat(fixed_str)
                    except Exception:
                        published_at = None

        if not isinstance(published_at, datetime.datetime):
            return True  # If we can't determine it, don't exclude the listing

        # Ensure both sides are comparable (timezone-aware). If published_at is naive, make
        # it use the same timezone as cutoff.
        if published_at.tzinfo is None and cutoff.tzinfo is not None:
            published_at = published_at.replace(tzinfo=cutoff.tzinfo)

        return published_at >= cutoff
    except Exception as e:
        log_timestamp(f"❗️ Error checking published date filter: {e}")
        return True

def is_address_query(query: str) -> bool:
    """
    Detect if a query looks like an address.
    An address query typically contains:
    - A street name (one or more words)
    - Optionally a street number (digits with optional suffix like "-K", "-A", etc.)
    """
    try:
        if not query or not query.strip():
            return False
        
        query_lower = query.strip().lower()
        
        # Pattern: street name (1-4 words) + optional number (digits with optional suffix)
        # Examples: "Raamstraat 33-K", "Prinsengracht 123", "Jordaan 42"
        import re
        
        # Match patterns like "word(s) number" or "word(s) number-suffix"
        # e.g., "raamstraat 33-k", "prinsengracht 123", "jordaan 42"
        # Updated pattern to better handle addresses: [street name] + space + [number with optional suffix]
        address_pattern = r'^[a-z]+(?:\s+[a-z]+){0,3}\s+\d+[-a-z]*$'
        
        # Also match if it's just a street name (common street names in Amsterdam)
        # Common street suffixes: straat, weg, plein, gracht, singel, dijk, etc.
        street_suffixes = ['straat', 'weg', 'plein', 'gracht', 'singel', 'dijk', 'laan', 'kade', 'dreef', 'hof', 'park', 'tuin']
        has_street_suffix = any(query_lower.endswith(f' {suffix}') or query_lower.endswith(suffix) for suffix in street_suffixes)
        
        # Check if it matches the address pattern
        pattern_match = re.match(address_pattern, query_lower)
        if pattern_match:
            return True
        
        # Check if it looks like a street name with number but in different format
        # e.g., "raamstraat33k", "33-k raamstraat", "rozenstraat 111-h"
        # Look for: at least one digit, and either a street suffix or multiple words
        has_digits = bool(re.search(r'\d+[-a-z]*', query_lower))
        has_multiple_words = len(query_lower.split()) >= 2
        if has_digits and (has_street_suffix or has_multiple_words):
            return True
        
        return False
    except Exception as e:
        print(f"[DEBUG is_address_query] ERROR: {e}", flush=True)
        import traceback
        traceback.print_exc()
        return False

def normalize_address_number(number_str: str) -> str:
    """
    Normalize address numbers to handle different formats.
    Examples: "111-H" -> "111h", "111 H" -> "111h", "111H" -> "111h"
    """
    if not number_str:
        return ""
    import re
    # Remove spaces and hyphens, convert to lowercase
    normalized = re.sub(r'[-\s]+', '', number_str.lower())
    return normalized

def address_matches(query: str, address: str) -> Dict[str, Any]:
    """
    Check if a listing's address matches the query.
    Returns a dict with:
    - match: bool (if there's any match)
    - exact_match: bool (if there's an exact match)
    - partial_match: bool (if there's a partial match)
    - match_score: float (0.0 to 1.0, higher is better)
    """
    if not query or not address:
        return {'match': False, 'exact_match': False, 'partial_match': False, 'match_score': 0.0}
    
    query_lower = query.strip().lower()
    address_lower = address.strip().lower()
    
    # Exact match (case-insensitive)
    if query_lower == address_lower:
        return {'match': True, 'exact_match': True, 'partial_match': False, 'match_score': 1.0}
    
    # Normalize both query and address for comparison (handle spaces, hyphens, etc.)
    # Remove punctuation and normalize spacing
    import re
    query_normalized = re.sub(r'[^\w\s]', '', query_lower).strip()
    address_normalized = re.sub(r'[^\w\s]', '', address_lower).strip()
    
    # Check if normalized query matches normalized address
    if query_normalized == address_normalized:
        return {'match': True, 'exact_match': True, 'partial_match': False, 'match_score': 1.0}
    
    # Check if query is contained in address (normalized)
    if query_normalized in address_normalized:
        # Calculate score based on how much of the address matches
        match_ratio = len(query_normalized) / len(address_normalized) if address_normalized else 0
        return {'match': True, 'exact_match': False, 'partial_match': True, 'match_score': 0.8 + (match_ratio * 0.2)}
    
    # Extract words and numbers from query and address
    query_words = re.findall(r'[a-z]+', query_lower)
    query_numbers = re.findall(r'\d+[-\w]*', query_lower)
    
    address_words = re.findall(r'[a-z]+', address_lower)
    address_numbers = re.findall(r'\d+[-\w]*', address_lower)
    
    # Normalize numbers for comparison (handle "111-H" vs "111 H" vs "111H")
    query_numbers_normalized = [normalize_address_number(n) for n in query_numbers]
    address_numbers_normalized = [normalize_address_number(n) for n in address_numbers]
    
    # Check word matches
    matching_words = set(query_words) & set(address_words)
    matching_numbers = set(query_numbers_normalized) & set(address_numbers_normalized)
    
    if matching_words or matching_numbers:
        # Calculate match score
        word_score = len(matching_words) / len(query_words) if query_words else 0
        number_score = len(matching_numbers) / len(query_numbers_normalized) if query_numbers_normalized else 0
        
        # If we have both words and numbers, prefer matches with both
        if matching_words and matching_numbers:
            match_score = 0.9 * word_score + 0.1 * number_score
            # If both street name AND number match, this is a strong match
            if word_score >= 0.8 and number_score >= 0.8:
                return {'match': True, 'exact_match': False, 'partial_match': True, 'match_score': 0.95}
        elif matching_words:
            match_score = 0.7 * word_score
        else:
            match_score = 0.5 * number_score
        
        return {'match': True, 'exact_match': False, 'partial_match': True, 'match_score': min(match_score, 0.95)}
    
    return {'match': False, 'exact_match': False, 'partial_match': False, 'match_score': 0.0}

# Load environment variables
load_dotenv()

# Set GOOGLE_APPLICATION_CREDENTIALS if not already set
if not os.environ.get('GOOGLE_APPLICATION_CREDENTIALS'):
    # Try to find firebase-credentials.json relative to this file
    # From search/ directory, go up 3 levels to reach project root: search/ -> scrape-and-process-listings/ -> backend/ -> root
    current_dir = os.path.dirname(os.path.abspath(__file__))
    # From search/ directory: go up 3 levels to reach project root
    root_dir = os.path.dirname(os.path.dirname(os.path.dirname(current_dir)))
    creds_path = os.path.join(root_dir, "firebase-credentials.json")
    
    if os.path.exists(creds_path):
        os.environ['GOOGLE_APPLICATION_CREDENTIALS'] = creds_path
        log_timestamp(f"Set GOOGLE_APPLICATION_CREDENTIALS to: {creds_path}")
    else:
        log_timestamp(f"⚠️ Could not find firebase-credentials.json at: {creds_path}")
        log_timestamp(f"Current directory: {current_dir}")
        log_timestamp(f"Calculated root directory: {root_dir}")

# Initialize Firebase (reuse existing app if already initialized)
db = None
try:
    # Check if credentials path is set and valid
    creds_path = os.environ.get('GOOGLE_APPLICATION_CREDENTIALS')
    if creds_path and not os.path.exists(creds_path):
        log_timestamp(f"⚠️ Warning: GOOGLE_APPLICATION_CREDENTIALS points to non-existent file: {creds_path}")
        log_timestamp(f"   Trying to find credentials file automatically...")
        # Try to find it at the calculated root
        if not db:  # Only if db not already initialized
            root_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
            alt_creds_path = os.path.join(root_dir, "firebase-credentials.json")
            if os.path.exists(alt_creds_path):
                os.environ['GOOGLE_APPLICATION_CREDENTIALS'] = alt_creds_path
                log_timestamp(f"   Found credentials at: {alt_creds_path}")
    
    if not firebase_admin._apps:
        firebase_admin.initialize_app()
    db = firestore.client()
    log_timestamp("✅ Firebase initialized for search service.")
except Exception as e:
    log_timestamp(f"❗️ Error initializing Firebase: {e}")
    log_timestamp(f"   GOOGLE_APPLICATION_CREDENTIALS: {os.environ.get('GOOGLE_APPLICATION_CREDENTIALS', 'NOT SET')}")
    db = None
    # Don't exit, just log the error and continue

# Initialize Vertex AI
embedding_model = None
try:
    log_timestamp("Initializing Vertex AI for search service...")
    project_id = os.getenv("GCP_PROJECT_ID") or os.getenv("GOOGLE_CLOUD_PROJECT") or "house-hunters-amsterdam"
    
    # Get credentials file path - prefer explicit path, then environment variable, then default
    creds_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
    if not creds_path:
        # Try to find firebase-credentials.json in common locations
        if os.path.exists("../firebase-credentials.json"):
            creds_path = "../firebase-credentials.json"
        elif os.path.exists("firebase-credentials.json"):
            creds_path = "firebase-credentials.json"
        elif os.path.exists(os.path.join(os.path.dirname(__file__), "..", "..", "firebase-credentials.json")):
            creds_path = os.path.join(os.path.dirname(__file__), "..", "..", "firebase-credentials.json")
    
    log_timestamp(f"Using GCP Project ID: {project_id}")
    if creds_path:
        log_timestamp(f"Using credentials from: {creds_path}")
    else:
        log_timestamp("Using application default credentials")
    
    if not project_id:
        raise ValueError("GCP_PROJECT_ID not found in environment")
    
    # Initialize Vertex AI with explicit project
    vertexai.init(project=project_id, location="europe-west4")
    embedding_model = TextEmbeddingModel.from_pretrained("text-embedding-004")
    log_timestamp("✅ Vertex AI initialized successfully for search service.")
except Exception as e:
    log_timestamp(f"❗️ Error initializing Vertex AI: {e}")
    embedding_model = None
    # Don't exit, just log the error and continue

def generate_query_embedding(query: str) -> Optional[List[float]]:
    """Generate embedding for a search query."""
    if not embedding_model or not query:
        return None
    try:
        embeddings = embedding_model.get_embeddings([query])
        return embeddings[0].values
    except Exception as e:
        log_timestamp(f"❗️ Could not generate query embedding: {e}")
        return None

def cosine_similarity(vec1: List[float], vec2: List[float]) -> float:
    """Calculate cosine similarity between two vectors."""
    try:
        vec1_np = np.array(vec1)
        vec2_np = np.array(vec2)
        
        # Ensure vectors are normalized
        norm1 = np.linalg.norm(vec1_np)
        norm2 = np.linalg.norm(vec2_np)
        
        if norm1 == 0 or norm2 == 0:
            return 0.0
        
        similarity = np.dot(vec1_np, vec2_np) / (norm1 * norm2)
        return float(similarity)
    except Exception as e:
        log_timestamp(f"❗️ Error calculating cosine similarity: {e}")
        return 0.0

def enhance_query_for_move_in_ready(query: str) -> str:
    """Enhance query to be more specific about move-in ready properties"""
    query_lower = query.lower()
    if 'move in ready' in query_lower or 'move-in ready' in query_lower:
        # Make the query more specific to avoid matching "ready for primary resident" etc.
        return "turnkey apartment move in ready immediately renovated furnished"
    return query

def analyze_query_complexity(query: str) -> dict:
    """Analyze query complexity and requirements"""
    query_lower = query.lower()
    
    # Count specific requirements
    requirements = []
    if 'shed' in query_lower:
        requirements.append('shed')
    if 'garden' in query_lower:
        requirements.append('garden')
    if 'balcony' in query_lower:
        requirements.append('balcony')
    if 'canal' in query_lower or 'canal view' in query_lower:
        requirements.append('canal')
    if 'ground floor' in query_lower:
        requirements.append('ground_floor')
    if 'top floor' in query_lower:
        requirements.append('top_floor')
    if 'renovated' in query_lower or 'renovation' in query_lower:
        requirements.append('renovated')
    if 'move in ready' in query_lower or 'move-in ready' in query_lower:
        requirements.append('move_in_ready')
    
    return {
        'requirements': requirements,
        'complexity': len(requirements),
        'is_complex': len(requirements) >= 3
    }

def listing_meets_requirements(listing_data: dict, requirements: list) -> bool:
    """Check if a listing meets specific requirements using structured data and text matching"""
    
    # Use structured data for specific fields (most accurate)
    if 'garden' in requirements and not listing_data.get('hasGarden', False):
        return False
    if 'balcony' in requirements and not listing_data.get('hasBalcony', False):
        return False
    
    # For other requirements, use text-based matching
    description = listing_data.get('description', '').lower() + ' ' + listing_data.get('embeddingText', '').lower()
    
    for req in requirements:
        if req == 'shed':
            # Look for shed mentions with context
            shed_patterns = [
                ' shed ', 'sheds ', 'shed.', 'shed,', 'shed:', 'shed;',
                'storage shed', 'garden shed', 'bike shed', 'tool shed',
                'shed in', 'shed with', 'shed for', 'shed at',
                ' schuur ', 'schuurtje '  # Dutch for shed
            ]
            
            has_shed = any(pattern in description for pattern in shed_patterns)
            
            # Also check for garden storage rooms
            storage_patterns = [
                'storage room in the garden', 'garden storage room', 
                'storage room for tools', 'tool storage room',
                'berging in de tuin', 'tuinberging'
            ]
            
            has_garden_storage = any(pattern in description for pattern in storage_patterns)
            
            if not has_shed and not has_garden_storage:
                return False
                
        elif req == 'renovated':
            if 'renovated' not in description and 'renovation' not in description:
                return False
                
        elif req == 'ground_floor':
            floor = str(listing_data.get('apartmentFloor', '')).lower()
            # In Netherlands: ground floor is 0 or "ground floor", not 1
            if 'ground' not in floor and '0' not in floor and 'begane grond' not in floor:
                return False
                
        elif req == 'canal':
            address = listing_data.get('address', '').lower()
            if 'canal' not in address and 'gracht' not in address and 'canal' not in description:
                return False
                
        elif req == 'move_in_ready':
            if 'move in ready' not in description and 'turnkey' not in description:
                return False
    
    return True

def check_floor_match(listing_floor: Any, filter_floor: str) -> bool:
    """
    Check if a listing's floor matches the filter floor requirement.
    Handles None/empty values, case variations, and string variations.
    
    Args:
        listing_floor: The apartment floor value from listing (can be string, None, etc.)
        filter_floor: The filter value ('ground' or 'top')
    
    Returns:
        True if the listing matches the floor filter, False otherwise
    """
    if not listing_floor:
        return False
    
    floor_str = str(listing_floor).lower()
    
    if filter_floor == 'ground':
        # Check for ground floor variations
        return ('ground' in floor_str or 
                '0' in floor_str or 
                'begane grond' in floor_str)
    elif filter_floor == 'top':
        # Check for top floor variations
        return ('top' in floor_str or 
                'upper' in floor_str or
                floor_str in ['upper', 'top floor', 'upper floor'])
    
    return False

def search_listings_by_similarity(
    query: str,
    limit: int = 50,
    filters: Optional[Dict[str, Any]] = None
) -> List[Dict[str, Any]]:
    """
    Search listings using semantic similarity to the query.
    
    Args:
        query: Natural language search query
        limit: Maximum number of results to return
        filters: Optional filters to apply (price range, bedrooms, etc.)
    
    Returns:
        List of listings ranked by similarity score
    """
    if not db:
        log_timestamp("❗️ Firebase not initialized, falling back to text-based search")
        return text_based_search(query, limit, filters)
    
    # Analyze query complexity
    query_analysis = analyze_query_complexity(query)
    
    # Enhance query for better results
    enhanced_query = enhance_query_for_move_in_ready(query)
    log_timestamp(f"Starting semantic search for query: '{query}' (enhanced: '{enhanced_query}')")
    log_timestamp(f"Query analysis: {query_analysis['requirements']} (complexity: {query_analysis['complexity']})")
    
    # Check if query is detected as address query (cache result since we call it multiple times)
    is_address = is_address_query(query)
    if is_address:
        log_timestamp(f"✅ Query '{query}' detected as ADDRESS QUERY - will prioritize address matches")
    
    # Generate embedding for the enhanced search query
    query_embedding = generate_query_embedding(enhanced_query)
    if not query_embedding:
        log_timestamp("❗️ Could not generate query embedding, falling back to text-based search")
        # Fall back to text-based search when embeddings aren't available
        return text_based_search(query, limit, filters)
    
    # Fetch all processed listings from Firestore
    try:
        listings_ref = db.collection('listings')
        
        # Apply status and available filters at database level
        # All other filters will be applied in memory
        listings_ref = listings_ref.where('status', '==', 'processed')
        listings_ref = listings_ref.where('available', '==', True)
        
        log_timestamp(f"Fetching listings with filters: {filters}")
        docs = listings_ref.stream()
        
        # Calculate similarities and prepare results
        results = []
        doc_count = 0
        address_match_count = 0
        exact_address_match_count = 0
        exact_match_ids = set()  # Track IDs of exact address matches
        for doc in docs:
            doc_count += 1
            listing_data = doc.to_dict()
            listing_id = doc.id
            listing_address = listing_data.get('address', '')
            
            # Debug: log first few addresses when searching for addresses
            if is_address and doc_count <= 5:
                log_timestamp(f"  Checking listing {doc_count}: address='{listing_address}'")
            
            # Get the listing embedding
            listing_embedding = listing_data.get('listingEmbedding')
            if not listing_embedding:
                continue
            
            # Calculate similarity score
            similarity_score = cosine_similarity(query_embedding, listing_embedding)
            
            # Check for address matches and boost accordingly (before threshold checks)
            address_boost = 0.0
            is_address_match = False
            if is_address:
                listing_address = listing_data.get('address', '')
                if listing_address:
                    address_match_info = address_matches(query, listing_address)
                    if address_match_info['match']:
                        is_address_match = True
                        if address_match_info['exact_match']:
                            # Exact address match gets a huge boost to ensure it's at the top
                            address_boost = 0.5
                            exact_address_match_count += 1
                            exact_match_ids.add(listing_id)
                            log_timestamp(f"🎯 Exact address match: query='{query}' matches address='{listing_address}' (boost: +{address_boost})")
                        elif address_match_info['partial_match']:
                            # Partial match gets a significant boost based on match quality
                            address_boost = 0.3 * address_match_info['match_score']
                            log_timestamp(f"📍 Partial address match: query='{query}' matches address='{listing_address}' (score: {address_match_info['match_score']:.2f}, boost: +{address_boost:.2f})")
                        similarity_score += address_boost
                        address_match_count += 1
            
            # For address matches, bypass similarity threshold entirely - always include them
            if not is_address_match:
                # Apply dynamic similarity threshold based on query length
                # Short queries (1-2 words) need lower threshold to return results
                # Longer, more specific queries can use higher threshold for better relevance
                query_word_count = len(query.split())
                if query_word_count <= 1:
                    min_threshold = 0.30  # Single word queries: very low threshold
                elif query_word_count <= 2:
                    min_threshold = 0.35  # Two word queries: low threshold
                elif query_word_count <= 4:
                    min_threshold = 0.40  # Medium queries (3-4 words): standard threshold
                else:
                    min_threshold = 0.45  # Longer, specific queries (5+ words): higher threshold for relevance
                
                if similarity_score < min_threshold:
                    continue
            
            # For queries with specific requirements, check if listing meets them
            if query_analysis['requirements'] and not listing_meets_requirements(listing_data, query_analysis['requirements']):
                continue
            
            # Apply additional filters if provided
            if filters and not passes_filters(listing_data, filters):
                continue
            
            # Boost similarity score for listings that meet specific requirements
            if query_analysis['requirements']:
                requirements_met = 0
                for req in query_analysis['requirements']:
                    if req == 'garden' and listing_data.get('hasGarden'):
                        requirements_met += 1
                    elif req == 'balcony' and listing_data.get('hasBalcony'):
                        requirements_met += 1
                    elif req == 'ground_floor':
                        floor = str(listing_data.get('apartmentFloor', '')).lower()
                        # In Netherlands: ground floor is 0 or "ground floor", not 1
                        if 'ground' in floor or '0' in floor or 'begane grond' in floor:
                            requirements_met += 1
                    elif req == 'renovated':
                        description = listing_data.get('description', '').lower() + ' ' + listing_data.get('embeddingText', '').lower()
                        if 'renovated' in description or 'renovation' in description:
                            requirements_met += 1
                    # Add more requirement checks as needed
                
                # Boost score by 0.1 for each requirement met (up to 0.3 max boost)
                requirement_boost = min(0.3, requirements_met * 0.1)
                similarity_score += requirement_boost
            
            # Add listing data with boosted similarity score
            # Address boost was already applied before threshold checks
            result = {
                'id': listing_id,
                'similarity_score': similarity_score,
                **listing_data
            }
            results.append(result)
        
        log_timestamp(f"Processed {doc_count} documents from Firestore")
        if is_address:
            log_timestamp(f"📊 Address search stats: {exact_address_match_count} exact matches, {address_match_count} total address matches")
        
        # Sort by similarity score (highest first)
        results.sort(key=lambda x: x['similarity_score'], reverse=True)
        
        # For exact address matches, limit results to only matching listings (or top 5 if multiple exact matches)
        # This provides a better UX when searching for a specific address
        if is_address and exact_address_match_count > 0:
            # Filter to only exact address matches
            exact_matches = [r for r in results if r.get('id') in exact_match_ids]
            if exact_matches:
                log_timestamp(f"🎯 Limiting results to {len(exact_matches)} exact address match(es) (out of {len(results)} total)")
                results = exact_matches[:5]  # Max 5 exact matches (in case of duplicate addresses)
        
        # For very short single-word queries, supplement with text-based matching if results are sparse
        query_word_count = len(query.split())
        if query_word_count == 1 and len(results) < 10:
            log_timestamp(f"Single-word query with sparse results ({len(results)}), supplementing with text-based matches")
            
            # Get text-based matches for the same query
            text_results = text_based_search(query, limit=limit, filters=filters)
            
            # Merge text results with semantic results
            # Create a set of already-seen listing IDs
            seen_ids = {result['id'] for result in results}
            
            # Add text results that aren't already in semantic results
            for text_result in text_results:
                if text_result['id'] not in seen_ids:
                    # Convert text_score to similarity_score format for consistency
                    text_result['similarity_score'] = text_result.get('text_score', 0) * 0.5  # Scale down text scores
                    results.append(text_result)
                    seen_ids.add(text_result['id'])
            
            # Re-sort by similarity score
            results.sort(key=lambda x: x['similarity_score'], reverse=True)
            log_timestamp(f"After text-based supplementation: {len(results)} total results")
        
        # Limit results
        results = results[:limit]
        
        log_timestamp(f"✅ Found {len(results)} results for query: '{query}'")
        return results
        
    except Exception as e:
        log_timestamp(f"❗️ Error during search: {e}")
        return []

def passes_filters(listing_data: Dict[str, Any], filters: Dict[str, Any]) -> bool:
    """Check if a listing passes the given filters."""
    try:
        # Price range
        if 'minPrice' in filters and listing_data.get('price', 0) < filters['minPrice']:
            return False
        if 'maxPrice' in filters and listing_data.get('price', 0) > filters['maxPrice']:
            return False
        
        # Bedrooms
        if 'bedrooms' in filters and filters['bedrooms'] != 'any':
            if listing_data.get('bedrooms', 0) < int(filters['bedrooms']):
                return False
        
        # Floor level
        if 'floor' in filters and filters['floor'] != 'any':
            apartment_floor = listing_data.get('apartmentFloor')
            floor_filter = filters['floor']
            
            if not check_floor_match(apartment_floor, floor_filter):
                return False
        
        # Outdoor space - handle both array and single string formats
        if 'outdoor' in filters and filters['outdoor'] != 'any':
            outdoor_filter = filters['outdoor']
            
            # Handle array format (OR logic: any selected outdoor space matches)
            if isinstance(outdoor_filter, list) and len(outdoor_filter) > 0:
                has_garden = listing_data.get('hasGarden', False)
                has_rooftop = listing_data.get('hasRooftopTerrace', False)
                has_balcony = listing_data.get('hasBalcony', False)
                
                # Check if ANY selected outdoor space matches (OR logic)
                matches = False
                if 'garden' in outdoor_filter and has_garden:
                    matches = True
                if 'rooftop' in outdoor_filter and has_rooftop:
                    matches = True
                if 'balcony' in outdoor_filter and has_balcony:
                    matches = True
                
                if not matches:
                    return False
            # Handle single string format (backward compatibility)
            else:
                if outdoor_filter == 'garden' and not listing_data.get('hasGarden'):
                    return False
                elif outdoor_filter == 'rooftop' and not listing_data.get('hasRooftopTerrace'):
                    return False
                elif outdoor_filter == 'balcony' and not listing_data.get('hasBalcony'):
                    return False
        
        # Minimum size
        if 'minSize' in filters and filters['minSize']:
            if listing_data.get('livingArea', 0) < int(filters['minSize']):
                return False
        
        # Areas
        if 'areas' in filters and filters['areas']:
            if listing_data.get('area') not in filters['areas']:
                return False

        # Published date (relative days)
        if not listing_passes_published_date_filter(listing_data, filters):
            return False

        return True
        
    except Exception as e:
        log_timestamp(f"❗️ Error checking filters: {e}")
        return True  # Default to including the listing if filter check fails

def text_based_search(query: str, limit: int = 50, filters: Optional[Dict] = None) -> List[Dict]:
    """Fallback text-based search when embeddings aren't available"""
    if not db:
        log_timestamp("❗️ Firebase not initialized, cannot perform text-based search")
        return []
    
    try:
        log_timestamp(f"Starting text-based search for query: '{query}'")
        
        # Fetch listings from Firestore
        listings_ref = db.collection('listings')
        
        # Apply status and available filters at database level
        listings_ref = listings_ref.where('status', '==', 'processed')
        listings_ref = listings_ref.where('available', '==', True)
        
        log_timestamp(f"Fetching listings with filters: {filters}")
        docs = listings_ref.stream()
        
        # Simple text matching
        results = []
        query_lower = query.lower()
        
        for doc in docs:
            listing_data = doc.to_dict()
            listing_id = doc.id
            
            # Check if query matches any text fields
            text_to_search = [
                listing_data.get('address', ''),
                listing_data.get('description', ''),
                listing_data.get('embeddingText', ''),
                listing_data.get('area', ''),
                listing_data.get('energyLabel', '')
            ]
            
            # Filter out None values and convert to strings
            text_to_search = [str(text) for text in text_to_search if text is not None]
            combined_text = ' '.join(text_to_search).lower()
            
            # More sophisticated relevance scoring based on text matches
            relevance_score = 0
            
            # Split query into individual words
            query_words = query_lower.split()
            
            # Check for exact phrase match (higher score)
            if query_lower in combined_text:
                relevance_score += 0.5
            
            # Check for individual word matches
            word_matches = 0
            for word in query_words:
                if word in combined_text:
                    word_matches += 1
                    # Give extra weight to matches in address and embeddingText
                    if word in listing_data.get('address', '').lower():
                        relevance_score += 0.3
                    elif word in listing_data.get('embeddingText', '').lower():
                        relevance_score += 0.2
                    else:
                        relevance_score += 0.1
            
            # Require at least some relevance and word coverage
            word_coverage = word_matches / len(query_words) if query_words else 0
            
            # More intuitive matching logic:
            # - For 1 word: require 100% match (the 1 word)
            # - For 2 words: require 100% match (both words)
            # - For 3-4 words: require 75% match (3 out of 4)
            # - For 5+ words: require 60% match (3 out of 5)
            min_word_coverage = 1.0 if len(query_words) <= 2 else (0.75 if len(query_words) <= 4 else 0.6)
            min_word_matches = int(len(query_words) * min_word_coverage)
            # For single-word queries, allow 1 match; for multi-word, require at least the calculated minimum
            
            # Apply filters if provided (must pass both text matching AND filters)
            if filters and not passes_filters(listing_data, filters):
                continue
            
            if relevance_score > 0.1 and word_matches >= min_word_matches:
                result = {
                    'id': listing_id,
                    'text_score': relevance_score,
                    **listing_data
                }
                results.append(result)
        
        # Sort by text score (highest first)
        results.sort(key=lambda x: x['text_score'], reverse=True)
        
        # Limit results
        results = results[:limit]
        
        log_timestamp(f"✅ Found {len(results)} results for text-based search: '{query}'")
        return results
        
    except Exception as e:
        log_timestamp(f"❗️ Error during text-based search: {e}")
        return []

def apply_structured_filters_then_ai_search(query: str, limit: int = 50, filters: Optional[Dict] = None) -> List[Dict]:
    """Apply structured filters first, then run AI search on filtered results"""
    if not db:
        log_timestamp("❗️ Firebase not initialized, cannot perform filtered search")
        return []
    
    try:
        log_timestamp(f"Starting filtered AI search for query: '{query}' with filters: {filters}, limit: {limit}")
        log_timestamp(f"Filter details - floor: {filters.get('floor') if filters else None}, bedrooms: {filters.get('bedrooms') if filters else None}, price range: {filters.get('minPrice') if filters else None}-{filters.get('maxPrice') if filters else None}")
        
        # Check if query is detected as address query (cache result since we call it multiple times)
        is_address = is_address_query(query)
        if is_address:
            log_timestamp(f"✅ Query '{query}' detected as ADDRESS QUERY - will prioritize address matches")
        
        # First, get all listings that match the structured filters
        filtered_listings = []
        
        # Build Firestore query with structured filters
        listings_ref = db.collection('listings')
        
        # Apply status and available filters at database level
        # All other filters will be applied in memory
        listings_ref = listings_ref.where('status', '==', 'processed')
        listings_ref = listings_ref.where('available', '==', True)
        
        log_timestamp(f"Fetching listings with structured filters")
        docs = listings_ref.stream()
        
        # Count outdoor spaces for debugging
        garden_count = 0
        balcony_count = 0
        rooftop_count = 0
        total_count = 0
        
        # Apply additional filters that can't be done at database level
        for doc in docs:
            listing_data = doc.to_dict()
            listing_id = doc.id
            
            # Count outdoor spaces for debugging
            total_count += 1
            if listing_data.get('hasGarden', False):
                garden_count += 1
            if listing_data.get('hasBalcony', False):
                balcony_count += 1
            if listing_data.get('hasRooftopTerrace', False):
                rooftop_count += 1
            
            # Apply all filters in memory to avoid Firestore index requirements
            if filters:
                # Apply price range filter
                if 'minPrice' in filters and listing_data.get('price', 0) < filters['minPrice']:
                    continue
                if 'maxPrice' in filters and listing_data.get('price', 0) > filters['maxPrice']:
                    continue
                
                # Apply bedroom filter
                if 'bedrooms' in filters and filters['bedrooms'] != 'any':
                    listing_bedrooms = listing_data.get('bedrooms', 0)
                    if listing_bedrooms < int(filters['bedrooms']):
                        continue
                
                # Apply floor filter using helper function for consistency
                if 'floor' in filters and filters['floor'] != 'any':
                    apartment_floor = listing_data.get('apartmentFloor')
                    if not check_floor_match(apartment_floor, filters['floor']):
                        continue
                
                # Apply outdoor space filter - handle both array and single string formats
                if 'outdoor' in filters and filters['outdoor'] != 'any':
                    outdoor_filter = filters['outdoor']
                    has_garden = listing_data.get('hasGarden', False)
                    has_rooftop = listing_data.get('hasRooftopTerrace', False)
                    has_balcony = listing_data.get('hasBalcony', False)
                    
                    # Handle array format (OR logic: any selected outdoor space matches)
                    if isinstance(outdoor_filter, list) and len(outdoor_filter) > 0:
                        matches = False
                        if 'garden' in outdoor_filter and has_garden:
                            matches = True
                        if 'rooftop' in outdoor_filter and has_rooftop:
                            matches = True
                        if 'balcony' in outdoor_filter and has_balcony:
                            matches = True
                        
                        if not matches:
                            continue
                    # Handle single string format (backward compatibility)
                    elif isinstance(outdoor_filter, str):
                        if outdoor_filter == 'garden' and not has_garden:
                            continue
                        elif outdoor_filter == 'rooftop' and not has_rooftop:
                            continue
                        elif outdoor_filter == 'balcony' and not has_balcony:
                            continue
                
                # Apply minimum size filter
                if 'minSize' in filters and filters['minSize']:
                    listing_size = listing_data.get('livingArea', 0)
                    if listing_size < float(filters['minSize']):
                        continue
                
                # Apply areas filter
                if 'areas' in filters and filters['areas']:
                    listing_area = listing_data.get('area', '')
                    if not any(area in listing_area for area in filters['areas']):
                        continue

                # Apply published date filter (relative days)
                if not listing_passes_published_date_filter(listing_data, filters):
                    continue
                
            
            filtered_listings.append({
                'id': listing_id,
                **listing_data
            })
        
        log_timestamp(f"Found {len(filtered_listings)} listings after applying structured filters")
        
        # Now run AI search only on these filtered listings
        if not filtered_listings:
            log_timestamp(f"❌ No listings passed structured filters, returning empty results")
            return []
        
        # If query is empty or only whitespace, just return filtered listings without semantic search
        if not query or not query.strip():
            log_timestamp(f"Query is empty, returning {len(filtered_listings)} filtered listings without semantic search")
            # Return filtered listings (sorted by date or whatever default sorting)
            return filtered_listings[:limit]
        
        # Generate query embedding
        query_embedding = generate_query_embedding(query)
        if not query_embedding:
            log_timestamp(f"❗️ Could not generate query embedding for filtered search, falling back to text-based search")
            # Fall back to text-based search on filtered listings
            # We already have filtered_listings, so we'll do text matching on those
            results = []
            query_lower = query.lower()
            query_words = query_lower.split()
            query_word_count = len(query_words)
            
            # Extract meaningful words (skip common stop words)
            stop_words = {'with', 'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'is', 'are'}
            meaningful_words = [w for w in query_words if w not in stop_words and len(w) > 2]
            
            # For longer queries, require keyword matching
            # For shorter queries, still require at least 1 meaningful word match
            min_keyword_matches = 0
            if query_word_count >= 5:
                min_keyword_matches = max(1, int(len(meaningful_words) * 0.3))
            elif query_word_count >= 1 and len(meaningful_words) > 0:
                # For single-word queries with meaningful words, require at least 1 match
                min_keyword_matches = 1
            
            log_timestamp(f"Text-based fallback: checking {len(filtered_listings)} filtered listings, requiring {min_keyword_matches} keyword matches")
            
            for listing in filtered_listings:
                # Check if query matches any text fields
                text_to_search = [
                    listing.get('address', ''),
                    listing.get('description', ''),
                    listing.get('embeddingText', ''),
                    listing.get('area', '')
                ]
                combined_text = ' '.join([str(text) for text in text_to_search if text]).lower()
                
                # Check keyword matches for meaningful words
                keyword_matches = sum(1 for word in meaningful_words if word in combined_text)
                
                # If we require keyword matches and not enough match, skip
                if min_keyword_matches > 0 and keyword_matches < min_keyword_matches:
                    continue
                
                # Calculate relevance score
                word_matches = sum(1 for word in query_words if word in combined_text)
                if word_matches > 0:
                    # Boost score for keyword matches
                    base_score = word_matches / len(query_words) if query_words else 0
                    keyword_boost = keyword_matches / len(meaningful_words) if meaningful_words else 0
                    relevance_score = base_score * 0.6 + keyword_boost * 0.4
                    listing['similarity_score'] = relevance_score
                    results.append(listing)
            
            results.sort(key=lambda x: x.get('similarity_score', 0), reverse=True)
            results = results[:limit]
            log_timestamp(f"✅ Text-based search on filtered listings found {len(results)} results (required {min_keyword_matches} keyword matches)")
            return results
        
        # Calculate similarities for filtered listings only
        results = []
        listings_with_embeddings = 0
        similarity_scores = []  # Track scores for debugging
        
        # Apply dynamic similarity threshold based on query length
        # For filtered searches on small sets, use relative ranking (take top N regardless of absolute threshold)
        # For larger sets or longer queries, use absolute thresholds
        query_word_count = len(query.split())
        use_relative_ranking = len(filtered_listings) <= 50  # For small filtered sets, use relative ranking
        
        if query_word_count <= 1:
            min_threshold = 0.25  # Single word queries: very low threshold (lowered from 0.30)
        elif query_word_count <= 2:
            min_threshold = 0.30  # Two word queries: low threshold (lowered from 0.35)
        elif query_word_count <= 4:
            min_threshold = 0.40  # Medium queries (3-4 words): standard threshold
        elif query_word_count <= 6:
            min_threshold = 0.45  # Longer queries (5-6 words): higher threshold
        else:
            min_threshold = 0.48  # Very specific queries (7+ words): very high threshold
        
        for listing in filtered_listings:
            listing_embedding = listing.get('listingEmbedding')
            if not listing_embedding:
                continue
            listings_with_embeddings += 1
            
            similarity_score = cosine_similarity(query_embedding, listing_embedding)
            
            # Check for address matches and boost accordingly (before threshold checks)
            address_boost = 0.0
            is_address_match = False
            if is_address:
                listing_address = listing.get('address', '')
                if listing_address:
                    address_match_info = address_matches(query, listing_address)
                    if address_match_info['match']:
                        is_address_match = True
                        if address_match_info['exact_match']:
                            # Exact address match gets a huge boost to ensure it's at the top
                            address_boost = 0.5
                            log_timestamp(f"🎯 Exact address match: query='{query}' matches address='{listing_address}' (boost: +{address_boost})")
                        elif address_match_info['partial_match']:
                            # Partial match gets a significant boost based on match quality
                            address_boost = 0.3 * address_match_info['match_score']
                            log_timestamp(f"📍 Partial address match: query='{query}' matches address='{listing_address}' (score: {address_match_info['match_score']:.2f}, boost: +{address_boost:.2f})")
                        similarity_score += address_boost
            
            similarity_scores.append(similarity_score)
            
            # For address matches, bypass similarity thresholds entirely - always include them
            if not is_address_match:
                # For small filtered sets with relative ranking, be very lenient initially
                # For simple queries, use a very low threshold to allow percentile filtering to work
                # For specific queries, use a slightly higher threshold
                if use_relative_ranking:
                    # With relative ranking, use very lenient initial threshold
                    # The percentile filtering later will do the actual filtering
                    absolute_min_threshold = 0.15 if query_word_count <= 2 else 0.20
                else:
                    # Without relative ranking, use normal thresholds
                    absolute_min_threshold = 0.20 if query_word_count <= 2 else 0.25
                if similarity_score < absolute_min_threshold:
                    continue
                
                # For non-relative ranking (larger sets), use the query-length-based threshold
                if not use_relative_ranking and similarity_score < min_threshold:
                    continue
            
            # For simple queries (1-2 words), require keyword matching - the word must appear in the listing
            # This ensures we don't return irrelevant results even if similarity is high
            # Skip common words that don't add value (like "apartment" which appears in almost all listings)
            # BUT: Skip keyword matching for address matches (they're already matched by address)
            if query_word_count <= 2 and not is_address_match:
                query_lower = query.lower().strip()
                listing_text = (
                    listing.get('description', '') + ' ' + 
                    listing.get('embeddingText', '') + ' ' +
                    listing.get('address', '')
                ).lower()
                
                # Common words that don't add value as filters (skip these)
                common_words = {'apartment', 'apartments', 'flat', 'flats', 'house', 'property', 'listing', 'home', 'place'}
                
                # Check if the query word(s) appear in the listing
                query_words = [w.strip() for w in query_lower.split() if len(w.strip()) > 0 and w.strip() not in common_words]
                
                # If all words were common words, don't apply keyword filtering
                if len(query_words) == 0:
                    # All words were common, don't filter by keywords
                    pass
                else:
                    matches = sum(1 for word in query_words if word in listing_text)
                    
                    # For single word queries, require the word to appear (if it's not a common word)
                    # For two word queries, require at least one meaningful word to appear
                    if query_word_count == 1 and matches == 0:
                        continue  # Skip listings that don't contain the meaningful word
                    elif query_word_count == 2 and matches == 0:
                        continue  # Skip listings that don't contain either meaningful word
            
            # For longer, specific queries, also require some keyword matching to ensure relevance
            # BUT: Skip keyword matching for address matches (they're already matched by address)
            if query_word_count >= 5 and not is_address_match:
                # Check if listing mentions at least some key terms from the query
                query_lower = query.lower()
                listing_text = (
                    listing.get('description', '') + ' ' + 
                    listing.get('embeddingText', '') + ' ' +
                    listing.get('address', '')
                ).lower()
                
                # Extract meaningful words (skip common words)
                stop_words = {'with', 'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'is', 'are'}
                query_words = [w for w in query_lower.split() if w not in stop_words and len(w) > 2]
                
                # Require at least 30% of meaningful query words to appear in listing
                matches = sum(1 for word in query_words if word in listing_text)
                min_matches = max(1, int(len(query_words) * 0.3))
                
                if matches < min_matches:
                    log_timestamp(f"Skipping listing {listing.get('id')[:8]}... - only {matches}/{len(query_words)} keywords matched (need {min_matches})")
                    continue
            
            # Add similarity score to result
            result = {
                'id': listing['id'],
                'similarity_score': similarity_score,
                **listing
            }
            results.append(result)
        
        # Sort by similarity score (highest first)
        results.sort(key=lambda x: x['similarity_score'], reverse=True)
        
        # Log similarity score statistics for debugging
        if similarity_scores:
            max_score = max(similarity_scores)
            min_score = min(similarity_scores)
            avg_score = sum(similarity_scores) / len(similarity_scores)
            log_timestamp(f"Similarity scores: min={min_score:.3f}, max={max_score:.3f}, avg={avg_score:.3f}, threshold={min_threshold:.3f}, listings_with_embeddings={listings_with_embeddings}")
        
        # For filtered searches with small result sets, use similarity score-based filtering
        # Adjust threshold based on query complexity and how well results match
        if use_relative_ranking and len(filtered_listings) <= 50 and results:
            max_result_score = results[0]['similarity_score'] if results else 0
            
            # Calculate scores for percentile analysis
            scores = [r['similarity_score'] for r in results]
            scores_sorted = sorted(scores, reverse=True)
            
            # Use percentile-based filtering: be more lenient for simple queries, stricter for specific ones
            # Simple queries like "quiet" should match more listings than specific queries
            if query_word_count >= 5:
                # Very specific queries: use top 40th percentile (stricter)
                percentile_idx = int(len(scores_sorted) * 0.6)  # 40th percentile (top 40%)
                percentile_idx = max(0, min(percentile_idx, len(scores_sorted) - 1))
                percentile_threshold = scores_sorted[percentile_idx] if percentile_idx < len(scores_sorted) else scores_sorted[-1]
            elif query_word_count >= 3:
                # Medium queries: use top 55th percentile
                percentile_idx = int(len(scores_sorted) * 0.45)  # 55th percentile (top 55%)
                percentile_idx = max(0, min(percentile_idx, len(scores_sorted) - 1))
                percentile_threshold = scores_sorted[percentile_idx] if percentile_idx < len(scores_sorted) else scores_sorted[-1]
            else:
                # Simple queries (1-2 words): use top 90th percentile (very lenient)
                # This allows many more results for general terms like "quiet"
                # For top 90%, we want to keep 90% of results (filter out bottom 10%)
                # Scores are sorted descending (highest first)
                # For 27 scores: keep 90% = keep 24.3 ≈ 24 results
                # To keep top 24 results, we need threshold at index 23 (0-indexed)
                # This keeps indices 0-23 (24 results) and filters indices 24-26 (3 results)
                keep_count = int(len(scores_sorted) * 0.9)  # For 27: keep_count = 24
                percentile_idx = keep_count - 1  # For 27: idx = 23 (0-indexed, so keeps 24 results)
                percentile_idx = max(0, min(percentile_idx, len(scores_sorted) - 1))
                percentile_threshold = scores_sorted[percentile_idx]
            
            # Also check if there's a natural gap in scores (standard deviation)
            # Only apply this for specific queries (not simple ones)
            if len(scores) > 2 and query_word_count >= 3:
                std_dev = statistics.stdev(scores) if len(scores) > 1 else 0
                mean_score = statistics.mean(scores)
                
                # For specific queries, if scores are tightly clustered, use a stricter threshold
                if std_dev > 0:
                    std_threshold = mean_score - (0.5 * std_dev)
                    percentile_threshold = max(percentile_threshold, std_threshold)
            
            # For longer queries, also require minimum score relative to max
            # This ensures very specific queries filter more aggressively
            # For simple queries, be very lenient - don't apply this threshold at all
            if query_word_count >= 5:
                max_based_threshold = max_result_score * 0.70  # 70% of max for specific queries
                percentile_threshold = max(percentile_threshold, max_based_threshold)
            elif query_word_count >= 3:
                max_based_threshold = max_result_score * 0.65  # 65% of max for medium queries
                percentile_threshold = max(percentile_threshold, max_based_threshold)
            # For simple queries, skip the max-based threshold entirely - only use percentile
            
            # For simple queries, use a balanced approach
            # Use percentile threshold but ensure it's not too strict (use median as fallback)
            # For specific queries, use the normal absolute minimum threshold
            if query_word_count <= 2:
                # Simple queries: use percentile threshold but be reasonable
                # Use the lower of percentile threshold and median score (whichever is lower)
                # This ensures we keep more results when scores are clustered
                median_score = scores_sorted[len(scores_sorted) // 2] if len(scores_sorted) > 1 else scores_sorted[0] if scores_sorted else 0
                # Use percentile or median, whichever is lower (more lenient)
                lenient_threshold = min(percentile_threshold, median_score)
                # But never go below the absolute minimum
                simple_absolute_min = 0.15
                effective_threshold = max(lenient_threshold, simple_absolute_min)
            else:
                # Specific queries: use the normal absolute minimum threshold
                effective_threshold = max(percentile_threshold, absolute_min_threshold)
            
            # Filter results to only those above effective threshold
            filtered_results = [r for r in results if r['similarity_score'] >= effective_threshold]
            
            median_score = scores_sorted[len(scores_sorted) // 2] if len(scores_sorted) > 1 else scores_sorted[0] if scores_sorted else 0
            log_timestamp(f"Filtered search: max_score={max_result_score:.3f}, median_score={median_score:.3f}, percentile_threshold={percentile_threshold:.3f}, effective_threshold={effective_threshold:.3f}, query_words={query_word_count}, filtering from {len(results)} to {len(filtered_results)} results")
            
            results = filtered_results
        
        # Limit results to requested limit
        results = results[:limit]
        
        # If no results from similarity search, fall back to text-based search on filtered listings
        if not results and listings_with_embeddings > 0:
            log_timestamp(f"No results above threshold {min_threshold}, falling back to text-based search on {len(filtered_listings)} filtered listings")
            # Use the same text-based fallback logic
            query_lower = query.lower()
            query_words = query_lower.split()
            query_word_count = len(query_words)
            
            stop_words = {'with', 'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'is', 'are'}
            meaningful_words = [w for w in query_words if w not in stop_words and len(w) > 2]
            
            min_keyword_matches = 0
            if query_word_count >= 5:
                min_keyword_matches = max(1, int(len(meaningful_words) * 0.3))
            elif query_word_count >= 1 and len(meaningful_words) > 0:
                min_keyword_matches = 1
            
            for listing in filtered_listings:
                text_to_search = [
                    listing.get('address', ''),
                    listing.get('description', ''),
                    listing.get('embeddingText', ''),
                    listing.get('area', '')
                ]
                combined_text = ' '.join([str(text) for text in text_to_search if text]).lower()
                
                keyword_matches = sum(1 for word in meaningful_words if word in combined_text)
                if min_keyword_matches > 0 and keyword_matches < min_keyword_matches:
                    continue
                
                word_matches = sum(1 for word in query_words if word in combined_text)
                if word_matches > 0:
                    base_score = word_matches / len(query_words) if query_words else 0
                    keyword_boost = keyword_matches / len(meaningful_words) if meaningful_words else 0
                    relevance_score = base_score * 0.6 + keyword_boost * 0.4
                    listing['similarity_score'] = relevance_score
                    results.append(listing)
            
            results.sort(key=lambda x: x.get('similarity_score', 0), reverse=True)
            results = results[:limit]
            log_timestamp(f"✅ Text-based fallback found {len(results)} results from {len(filtered_listings)} filtered listings")
        
        log_timestamp(f"✅ Filtered AI search found {len(results)} results for query: '{query}' (requested limit: {limit})")
        return results
        
    except Exception as e:
        log_timestamp(f"❗️ Error during filtered AI search: {e}")
        return []

def hybrid_search(
    query: str,
    limit: int = 50,
    filters: Optional[Dict[str, Any]] = None,
    similarity_weight: float = 0.7
) -> List[Dict[str, Any]]:
    """
    Perform hybrid search combining semantic similarity with structured filters.
    
    Args:
        query: Natural language search query
        limit: Maximum number of results
        filters: Structured filters to apply
        similarity_weight: Weight for similarity score (0.0 to 1.0)
    
    Returns:
        List of listings ranked by combined score
    """
    log_timestamp(f"Starting hybrid search for query: '{query}'")
    
    # Get semantic search results first (preferred method)
    semantic_results = search_listings_by_similarity(query, limit * 3, filters)
    
    # If semantic search returns no results, try text-based search
    if not semantic_results:
        log_timestamp("Semantic search returned no results, trying text-based search...")
        semantic_results = text_based_search(query, limit * 2, filters)
    
    if not semantic_results:
        return []
    
    # Calculate hybrid scores
    for result in semantic_results:
        # Handle different score field names from different search types
        similarity_score = result.get('similarity_score', result.get('text_score', 0))
        
        # You could add other scoring factors here, such as:
        # - Recency (newer listings get higher scores)
        # - Price competitiveness
        # - Popularity metrics
        
        # For now, we'll use similarity as the primary score
        hybrid_score = similarity_score * similarity_weight
        
        # Add any other scoring factors here
        # For example, boost recent listings slightly
        if 'scrapedAt' in result:
            try:
                scraped_date = result['scrapedAt'].to_date() if hasattr(result['scrapedAt'], 'to_date') else result['scrapedAt']
                days_old = (datetime.datetime.now() - scraped_date).days
                recency_boost = max(0, (30 - days_old) / 30) * 0.1  # Small boost for recent listings
                hybrid_score += recency_boost
            except:
                pass  # Ignore date parsing errors
        
        result['hybrid_score'] = hybrid_score
    
    # Sort by hybrid score
    semantic_results.sort(key=lambda x: x['hybrid_score'], reverse=True)
    
    # Return limited results
    return semantic_results[:limit]

