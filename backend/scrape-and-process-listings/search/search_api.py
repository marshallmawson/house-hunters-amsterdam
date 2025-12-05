from flask import Flask, request, jsonify
from flask_cors import CORS
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Ensure Firebase credentials are set for Cloud Run
# In Cloud Run, the credentials are automatically available via the service account
# For local development, you may need to set this manually
if not os.environ.get('GOOGLE_APPLICATION_CREDENTIALS'):
    # This will use the default service account in Cloud Run
    pass

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

@app.route('/debug/count', methods=['GET'])
def debug_count():
    """Debug endpoint to check listing count"""
    try:
        # Use the exact same imports as search_service.py
        import firebase_admin
        from firebase_admin import credentials, firestore
        if not firebase_admin._apps:
            firebase_admin.initialize_app()
        db = firestore.client()
        
        # Get project info
        project_id = os.getenv("GCP_PROJECT_ID") or os.getenv("GOOGLE_CLOUD_PROJECT") or "unknown"
        
        listings_ref = db.collection('listings')
        count = len(list(listings_ref.limit(1000).stream()))
        
        # Check status distribution
        status_counts = {}
        all_docs = list(listings_ref.limit(1000).stream())
        for doc in all_docs:
            status = doc.to_dict().get('status', 'no_status')
            status_counts[status] = status_counts.get(status, 0) + 1
        
        # Also try to get a sample document to see the structure
        sample_docs = list(listings_ref.limit(1).stream())
        sample_structure = {}
        if sample_docs:
            sample_doc = sample_docs[0].to_dict()
            sample_structure = {key: type(value).__name__ for key, value in sample_doc.items()}
        
        return jsonify({
            "total_listings": count,
            "project_id": project_id,
            "status_distribution": status_counts,
            "sample_document_structure": sample_structure
        })
    except Exception as e:
        return jsonify({"error": str(e), "error_type": type(e).__name__}), 500


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
        
        # Remove only truly empty/default filters that don't represent user intent
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
        logger.info(f"Active filters check - bedrooms: {filters.get('bedrooms')}, floor: {filters.get('floor')}, outdoor: {filters.get('outdoor')}, minPrice: {filters.get('minPrice')}, maxPrice: {filters.get('maxPrice')}")
        
        # Perform search based on type
        try:
            hybrid_search, search_listings_by_similarity, text_based_search, apply_structured_filters_then_ai_search = get_search_functions()
            
            if search_type == 'semantic':
                results = search_listings_by_similarity(query, limit, filters)
                # Fall back to text-based search if semantic search returns no results
                if not results:
                    logger.info("Semantic search returned no results, falling back to text-based search")
                    results = text_based_search(query, limit, filters)
            elif search_type == 'text':
                results = text_based_search(query, limit, filters)
            elif search_type == 'filtered':
                results = apply_structured_filters_then_ai_search(query, limit, filters)
                # Note: apply_structured_filters_then_ai_search already has its own fallback to text-based
                # on filtered listings, so we don't need another fallback here that would bypass filters
                if not results:
                    logger.info("Filtered search returned no results (filters may be too restrictive or no matches found)")
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
            # Calculate pricePerSquareMeter if missing
            price_per_sqm = result.get('pricePerSquareMeter')
            if price_per_sqm is None:
                price = result.get('price', 0)
                living_area = result.get('livingArea', 0)
                if price and living_area and living_area > 0:
                    price_per_sqm = round(price / living_area)
            
            formatted_result = {
                'id': result['id'],
                'address': result.get('address', ''),
                'price': result.get('price', 0),
                'pricePerSquareMeter': price_per_sqm,
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
                'publishedDate': result.get('publishDate') or result.get('publishedDate'),
                'scrapedAt': result.get('scrapedAt'),
                'searchScore': result.get('hybrid_score', result.get('similarity_score', result.get('text_score', 0))),
                # Additional fields needed for modal display
                'yearBuilt': result.get('yearBuilt', ''),
                'vveContribution': result.get('vveContribution', 0),
                'agentName': result.get('agentName', ''),
                'agentUrl': result.get('agentUrl', ''),
                'floorPlans': result.get('floorPlans', []),
                'numberOfStories': result.get('numberOfStories', 0),
                'googleMapsUrl': result.get('googleMapsUrl', ''),
                'outdoorSpaceArea': result.get('outdoorSpaceArea', 0)
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

@app.route('/listings/<listing_id>', methods=['GET'])
def get_listing_html(listing_id):
    """
    Serve HTML with Open Graph meta tags for social media crawlers.
    This endpoint is called by nginx when a social media crawler requests a listing URL.
    """
    try:
        logger.info(f"Received request for listing {listing_id} from user agent: {request.headers.get('User-Agent', 'Unknown')}")
        import firebase_admin
        from firebase_admin import credentials, firestore
        if not firebase_admin._apps:
            firebase_admin.initialize_app()
        db = firestore.client()
        
        # Fetch listing from Firestore
        listing_ref = db.collection('listings').document(listing_id)
        listing_doc = listing_ref.get()
        
        if not listing_doc.exists:
            logger.warning(f"Listing {listing_id} not found in Firestore")
            # Return default HTML if listing not found
            return DEFAULT_HTML_TEMPLATE, 404, {'Content-Type': 'text/html; charset=utf-8'}
        
        listing_data = listing_doc.to_dict()
        
        # Extract listing information
        address = listing_data.get('address', 'Property Listing')
        price = listing_data.get('price', 0)
        bedrooms = listing_data.get('bedrooms', 0)
        bathrooms = listing_data.get('bathrooms', 0)
        living_area = listing_data.get('livingArea', 0)
        image_gallery = listing_data.get('imageGallery', [])
        
        logger.info(f"Listing {listing_id}: address={address}, imageGallery length={len(image_gallery) if image_gallery else 0}")
        
        # Use first image if available, otherwise default logo
        # Ensure image URL is absolute (starts with http:// or https://)
        raw_image_url = image_gallery[0] if image_gallery and len(image_gallery) > 0 else None
        if raw_image_url:
            logger.info(f"Raw image URL: {raw_image_url}")
            # If URL is relative, make it absolute (assuming it's from funda.nl)
            if raw_image_url.startswith('http://') or raw_image_url.startswith('https://'):
                image_url = raw_image_url
            else:
                # If relative URL, prepend https:// (assuming funda.nl)
                image_url = f'https://www.funda.nl{raw_image_url}' if raw_image_url.startswith('/') else f'https://{raw_image_url}'
            logger.info(f"Final image URL: {image_url}")
        else:
            logger.warning(f"No image found for listing {listing_id}, using default logo")
            image_url = 'https://www.huishunters.com/logo512.png'
        
        # Build description
        description_parts = [address, f'€{price:,}']
        if bedrooms:
            description_parts.append(f'{bedrooms} bedrooms')
        if bathrooms:
            description_parts.append(f'{bathrooms} bathrooms')
        if living_area:
            description_parts.append(f'{living_area} m²')
        description = ' - '.join(description_parts)
        
        # Build title
        title = f'{address} - €{price:,}'
        
        # Build URL
        listing_url = f'https://www.huishunters.com/listings/{listing_id}'
        
        # Render HTML with meta tags
        html = HTML_TEMPLATE.format(
            title=title,
            description=description,
            image_url=image_url,
            listing_url=listing_url
        )
        
        return html, 200, {'Content-Type': 'text/html; charset=utf-8'}
        
    except Exception as e:
        logger.error(f"Error fetching listing {listing_id}: {str(e)}")
        return DEFAULT_HTML_TEMPLATE, 500, {'Content-Type': 'text/html; charset=utf-8'}

# HTML template for listing pages with Open Graph meta tags
HTML_TEMPLATE = '''<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{title}</title>
    <meta name="description" content="{description}" />
    
    <!-- Open Graph / Facebook -->
    <meta property="og:type" content="website" />
    <meta property="og:url" content="{listing_url}" />
    <meta property="og:title" content="{title}" />
    <meta property="og:description" content="{description}" />
    <meta property="og:image" content="{image_url}" />
    <meta property="og:image:secure_url" content="{image_url}" />
    <meta property="og:image:type" content="image/jpeg" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    
    <!-- Twitter -->
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:url" content="{listing_url}" />
    <meta name="twitter:title" content="{title}" />
    <meta name="twitter:description" content="{description}" />
    <meta name="twitter:image" content="{image_url}" />
    
    <!-- Redirect to actual page -->
    <script>
        window.location.href = "{listing_url}";
    </script>
    <noscript>
        <meta http-equiv="refresh" content="0; url={listing_url}" />
    </noscript>
</head>
<body>
    <p>Redirecting to <a href="{listing_url}">{title}</a>...</p>
</body>
</html>'''

DEFAULT_HTML_TEMPLATE = '''<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <title>Huis Hunters - AI-Powered Amsterdam Home Search</title>
    <meta name="description" content="Find your perfect Amsterdam house with smart filters and AI-powered search." />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="https://www.huishunters.com/" />
    <meta property="og:title" content="Huis Hunters - AI-Powered Amsterdam Home Search" />
    <meta property="og:description" content="Find your perfect Amsterdam house with smart filters and AI-powered search." />
    <meta property="og:image" content="https://www.huishunters.com/logo512.png" />
</head>
<body>
    <p>Huis Hunters - AI-Powered Amsterdam Home Search</p>
</body>
</html>'''

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    app.run(host='0.0.0.0', port=port, debug=False)
