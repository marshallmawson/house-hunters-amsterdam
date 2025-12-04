from flask import Flask, request, jsonify
from flask_cors import CORS
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Ensure Firebase credentials are set
os.environ['GOOGLE_APPLICATION_CREDENTIALS'] = '/Users/marshallmawson/house-hunters-amsterdam/firebase-credentials.json'

import logging

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)  # Enable CORS for frontend requests

# Import search functions after Flask app creation
def get_search_functions():
    """Import search functions in request context"""
    from search_service import hybrid_search, search_listings_by_similarity, text_based_search, apply_structured_filters_then_ai_search
    return hybrid_search, search_listings_by_similarity, text_based_search, apply_structured_filters_then_ai_search

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint."""
    return jsonify({"status": "healthy", "service": "search-api"})

@app.route('/search', methods=['POST'])
def search_listings():
    """
    Search listings using natural language query and optional filters.
    
    Expected JSON payload:
    {
        "query": "modern apartment with garden",
        "limit": 50,
        "filters": {
            "minPrice": 300000,
            "maxPrice": 800000,
            "bedrooms": "2",
            "floor": "any",
            "outdoor": "any",
            "minSize": "60",
            "areas": ["Jordaan", "Centrum"]
        },
        "search_type": "hybrid"  # or "semantic"
    }
    """
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({"error": "No JSON data provided"}), 400
        
        query = data.get('query', '').strip()
        if not query:
            return jsonify({"error": "Query is required"}), 400
        
        limit = min(data.get('limit', 50), 100)  # Cap at 100 results
        filters = data.get('filters', {})
        search_type = data.get('search_type', 'hybrid')
        
        # Remove only truly default/empty filters that don't represent user intent
        if filters.get('bedrooms') == 'any':
            filters.pop('bedrooms', None)
        if filters.get('floor') == 'any':
            filters.pop('floor', None)
        if filters.get('outdoor') == 'any':
            filters.pop('outdoor', None)
        if filters.get('minSize') == '':
            filters.pop('minSize', None)
        if not filters.get('areas'):
            filters.pop('areas', None)
        
        logger.info(f"Search request - Query: '{query}', Type: {search_type}, Limit: {limit}, Filters: {filters}")
        
        # Perform search based on type
        try:
            hybrid_search, search_listings_by_similarity, text_based_search, apply_structured_filters_then_ai_search = get_search_functions()
            
            if search_type == 'semantic':
                results = search_listings_by_similarity(query, limit, filters)
            elif search_type == 'text':
                results = text_based_search(query, limit, filters)
            elif search_type == 'filtered':
                results = apply_structured_filters_then_ai_search(query, limit, filters)
            else:  # hybrid (default)
                results = hybrid_search(query, limit, filters)
            
            logger.info(f"Raw search results: {len(results)} found")
        except Exception as e:
            logger.error(f"Error during search: {str(e)}")
            results = []
        
        # Format results for frontend
        formatted_results = []
        logger.info(f"Processing {len(results)} results for formatting")
        for result in results:
            formatted_result = {
                'id': result['id'],
                'address': result.get('address', ''),
                'price': result.get('price', 0),
                'bedrooms': result.get('bedrooms', 0),
                'bathrooms': result.get('bathrooms', 0),
                'livingArea': result.get('livingArea', 0),
                'energyLabel': result.get('energyLabel', ''),
                'url': result.get('url', ''),
                'imageGallery': result.get('imageGallery', []),
                'embeddingText': result.get('embeddingText', ''),
                'cleanedDescription': result.get('cleanedDescription', ''),
                'area': result.get('area', ''),
                'neighborhood': result.get('neighborhood', ''),
                'hasGarden': result.get('hasGarden', False),
                'hasRooftopTerrace': result.get('hasRooftopTerrace', False),
                'hasBalcony': result.get('hasBalcony', False),
                'apartmentFloor': result.get('apartmentFloor', ''),
                'coordinates': result.get('coordinates', {}),
                # Prefer canonical publishedAt timestamp; fall back to legacy fields.
                'publishedDate': result.get('publishedAt') or result.get('publishDate') or result.get('publishedDate'),
                'scrapedAt': result.get('scrapedAt'),
                'searchScore': result.get('hybrid_score', result.get('similarity_score', result.get('text_score', 0)))
            }
            formatted_results.append(formatted_result)
        
        return jsonify({
            "results": formatted_results,
            "total": len(formatted_results),
            "query": query,
            "search_type": search_type
        })
        
    except Exception as e:
        logger.error(f"Error in search endpoint: {str(e)}")
        return jsonify({"error": "Internal server error"}), 500

@app.route('/search/suggestions', methods=['GET'])
def get_search_suggestions():
    """
    Get search suggestions based on common queries or popular features.
    """
    suggestions = [
        "modern apartment with garden",
        "quiet place with balcony",
        "family-friendly 3-bedroom",
        "luxury apartment near city center",
        "affordable studio apartment",
        "apartment with outdoor space",
        "ground floor apartment",
        "top floor with view",
        "newly renovated apartment",
        "apartment near public transport"
    ]
    
    return jsonify({"suggestions": suggestions})

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5001))
    app.run(host='0.0.0.0', port=port, debug=True)
