import os
import numpy as np
import firebase_admin
from dotenv import load_dotenv
from firebase_admin import credentials, firestore
import vertexai
from vertexai.language_models import TextEmbeddingModel
import datetime
from typing import List, Dict, Any, Optional

def log_timestamp(message):
    print(f"[{datetime.datetime.now()}] {message}")

# Load environment variables
load_dotenv()

# Initialize Firebase (reuse existing app if already initialized)
try:
    if not firebase_admin._apps:
        firebase_admin.initialize_app()
    db = firestore.client()
    log_timestamp("✅ Firebase initialized for search service.")
except Exception as e:
    log_timestamp(f"❗️ Error initializing Firebase: {e}")
    # Don't exit, just log the error and continue

# Initialize Vertex AI
embedding_model = None
try:
    log_timestamp("Initializing Vertex AI for search service...")
    project_id = os.getenv("GCP_PROJECT_ID") or os.getenv("GOOGLE_CLOUD_PROJECT") or "house-hunters-amsterdam"
    if not project_id:
        raise ValueError("GCP_PROJECT_ID not found in environment")
    vertexai.init(project=project_id)
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
    # Analyze query complexity
    query_analysis = analyze_query_complexity(query)
    
    # Enhance query for better results
    enhanced_query = enhance_query_for_move_in_ready(query)
    log_timestamp(f"Starting semantic search for query: '{query}' (enhanced: '{enhanced_query}')")
    log_timestamp(f"Query analysis: {query_analysis['requirements']} (complexity: {query_analysis['complexity']})")
    
    # Generate embedding for the enhanced search query
    query_embedding = generate_query_embedding(enhanced_query)
    if not query_embedding:
        log_timestamp("❗️ Could not generate query embedding")
        return []
    
    # Fetch all processed listings from Firestore
    try:
        listings_ref = db.collection('listings')
        
        # Only apply status filter at database level to avoid composite index requirements
        # All other filters will be applied in memory
        listings_ref = listings_ref.where('status', '==', 'processed')
        
        log_timestamp(f"Fetching listings with filters: {filters}")
        docs = listings_ref.stream()
        
        # Calculate similarities and prepare results
        results = []
        doc_count = 0
        for doc in docs:
            doc_count += 1
            listing_data = doc.to_dict()
            listing_id = doc.id
            
            # Get the listing embedding
            listing_embedding = listing_data.get('listingEmbedding')
            if not listing_embedding:
                continue
            
            # Calculate similarity score
            similarity_score = cosine_similarity(query_embedding, listing_embedding)
            
            # Only include results above a minimum similarity threshold
            if similarity_score < 0.40:  # Only include results with at least 40% similarity
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
            result = {
                'id': listing_id,
                'similarity_score': similarity_score,
                **listing_data
            }
            results.append(result)
        
        log_timestamp(f"Processed {doc_count} documents from Firestore")
        
        # Sort by similarity score (highest first)
        results.sort(key=lambda x: x['similarity_score'], reverse=True)
        
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
            
            if floor_filter == 'ground' and apartment_floor != 'Ground':
                return False
            elif floor_filter == 'top' and apartment_floor not in ['Upper', 'Top floor', 'Upper floor']:
                return False
        
        # Outdoor space
        if 'outdoor' in filters and filters['outdoor'] != 'any':
            outdoor_filter = filters['outdoor']
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
        
        
        return True
        
    except Exception as e:
        log_timestamp(f"❗️ Error checking filters: {e}")
        return True  # Default to including the listing if filter check fails

def text_based_search(query: str, limit: int = 50, filters: Optional[Dict] = None) -> List[Dict]:
    """Fallback text-based search when embeddings aren't available"""
    try:
        log_timestamp(f"Starting text-based search for query: '{query}'")
        
        # Fetch listings from Firestore
        listings_ref = db.collection('listings')
        
        # Only apply status filter at database level to avoid composite index requirements
        # All other filters will be applied in memory
        listings_ref = listings_ref.where('status', '==', 'processed')
        
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
            # - For 1-2 words: require 100% match (all words)
            # - For 3-4 words: require 75% match (3 out of 4)
            # - For 5+ words: require 60% match (3 out of 5)
            min_word_coverage = 1.0 if len(query_words) <= 2 else (0.75 if len(query_words) <= 4 else 0.6)
            min_word_matches = max(2, int(len(query_words) * min_word_coverage))  # At least 2 words must match
            
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
    try:
        log_timestamp(f"Starting filtered AI search for query: '{query}' with filters: {filters}, limit: {limit}")
        
        # First, get all listings that match the structured filters
        filtered_listings = []
        
        # Build Firestore query with structured filters
        listings_ref = db.collection('listings')
        
        # Only apply status filter at database level to avoid composite index requirements
        # All other filters will be applied in memory
        listings_ref = listings_ref.where('status', '==', 'processed')
        
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
                
                # Apply floor filter
                if 'floor' in filters and filters['floor'] != 'any':
                    if filters['floor'] == 'ground':
                        floor = str(listing_data.get('apartmentFloor', '')).lower()
                        if 'ground' not in floor and '0' not in floor and 'begane grond' not in floor:
                            continue
                    elif filters['floor'] == 'top':
                        floor = str(listing_data.get('apartmentFloor', '')).lower()
                        if 'top' not in floor and 'upper' not in floor:
                            continue
                
                # Apply outdoor space filter
                if 'outdoor' in filters and filters['outdoor'] != 'any':
                    has_garden = listing_data.get('hasGarden', False)
                    has_rooftop = listing_data.get('hasRooftopTerrace', False)
                    has_balcony = listing_data.get('hasBalcony', False)
                    if filters['outdoor'] == 'garden':
                        if not has_garden:
                            continue
                    elif filters['outdoor'] == 'rooftop':
                        if not has_rooftop:
                            continue
                    elif filters['outdoor'] == 'balcony':
                        if not has_balcony:
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
                
            
            filtered_listings.append({
                'id': listing_id,
                **listing_data
            })
        
        log_timestamp(f"Found {len(filtered_listings)} listings after applying structured filters")
        
        # Now run AI search only on these filtered listings
        if not filtered_listings:
            log_timestamp(f"❌ No listings passed structured filters, returning empty results")
            return []
        
        # Generate query embedding
        query_embedding = generate_query_embedding(query)
        if not query_embedding:
            log_timestamp(f"❗️ Could not generate query embedding for filtered search, returning empty results")
            return []
        
        # Calculate similarities for filtered listings only
        results = []
        listings_with_embeddings = 0
        for listing in filtered_listings:
            listing_embedding = listing.get('listingEmbedding')
            if not listing_embedding:
                continue
            listings_with_embeddings += 1
            
            similarity_score = cosine_similarity(query_embedding, listing_embedding)
            
            # Apply dynamic similarity threshold based on query length
            min_threshold = 0.40 if len(query.split()) <= 2 else 0.45
            if similarity_score < min_threshold:
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
        
        # Limit results
        results = results[:limit]
        
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

