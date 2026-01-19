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

@app.route('/debug/status', methods=['GET'])
def debug_status():
    """Debug endpoint to check initialization status of search service"""
    try:
        # Try to import search_service to check its initialization state
        import search_service
        
        # Check if db is initialized
        db_initialized = search_service.db is not None
        embedding_initialized = search_service.embedding_model is not None
        
        # Try to get project info
        project_id = os.getenv("GCP_PROJECT_ID") or os.getenv("GOOGLE_CLOUD_PROJECT") or "unknown"
        google_cloud_project = os.getenv("GOOGLE_CLOUD_PROJECT", "NOT SET")
        gcp_project_id = os.getenv("GCP_PROJECT_ID", "NOT SET")
        
        # Try to test Firebase connection
        firebase_test = "unknown"
        if db_initialized:
            try:
                test_ref = search_service.db.collection('listings').limit(1)
                list(test_ref.stream())
                firebase_test = "working"
            except Exception as e:
                firebase_test = f"error: {str(e)}"
        
        # Try to test Vertex AI
        vertex_test = "unknown"
        if embedding_initialized:
            try:
                test_embedding = search_service.generate_query_embedding("test")
                vertex_test = "working" if test_embedding else "error: returned None"
            except Exception as e:
                vertex_test = f"error: {str(e)}"
        
        return jsonify({
            "db_initialized": db_initialized,
            "embedding_model_initialized": embedding_initialized,
            "firebase_test": firebase_test,
            "vertex_ai_test": vertex_test,
            "project_id": project_id,
            "GOOGLE_CLOUD_PROJECT": google_cloud_project,
            "GCP_PROJECT_ID": gcp_project_id,
            "GOOGLE_APPLICATION_CREDENTIALS": os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "NOT SET (using ADC)")
        })
    except Exception as e:
        import traceback
        return jsonify({
            "error": str(e),
            "error_type": type(e).__name__,
            "traceback": traceback.format_exc()
        }), 500


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
            
            # Check initialization status before searching
            import search_service
            if search_service.db is None:
                logger.error("Firebase database not initialized - search will return no results")
                return jsonify({
                    "error": "Search service not properly initialized",
                    "details": "Firebase database connection failed",
                    "results": [],
                    "total": 0
                }), 500
            
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
            import traceback
            error_traceback = traceback.format_exc()
            logger.error(f"Error during search: {str(e)}")
            logger.error(f"Traceback: {error_traceback}")
            # Return error details in development, generic error in production
            return jsonify({
                "error": "Search failed",
                "details": str(e) if os.getenv("FLASK_ENV") == "development" else "Internal server error",
                "results": [],
                "total": 0
            }), 500
        
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
        main_image = listing_data.get('mainImage')
        
        logger.info(f"Listing {listing_id}: address={address}, imageGallery length={len(image_gallery) if image_gallery else 0}, mainImage={bool(main_image)}")
        
        # Helper function to validate and normalize a single image URL
        def validate_image_url(img_url):
            if not img_url or not isinstance(img_url, str) or not img_url.strip():
                return None
            img_url = img_url.strip()
            if img_url.startswith('http://') or img_url.startswith('https://'):
                # Valid absolute URL - ensure it has a proper domain
                if len(img_url) > 10 and '.' in img_url.split('://', 1)[-1].split('/')[0]:
                    return img_url
            elif img_url.startswith('/'):
                # Relative URL - make it absolute
                return f'https://www.funda.nl{img_url}'
            elif '.' in img_url and '/' in img_url and not img_url.startswith('{'):
                # Looks like a partial URL with path - might be valid
                if not img_url.startswith('//'):
                    return f'https://{img_url}'
                else:
                    return f'https:{img_url}'
            return None
        
        # Filter and validate image URLs - remove empty, None, or invalid URLs
        valid_image_urls = []
        if image_gallery:
            for img_url in image_gallery:
                validated_url = validate_image_url(img_url)
                if validated_url:
                    valid_image_urls.append(validated_url)
        
        # If no valid URLs from gallery, try mainImage as fallback
        if not valid_image_urls and main_image:
            validated_url = validate_image_url(main_image)
            if validated_url:
                valid_image_urls.append(validated_url)
        
        logger.info(f"Valid image URLs found: {len(valid_image_urls)}")
        
        # Use first valid image if available, otherwise default logo
        if valid_image_urls:
            image_url = valid_image_urls[0]
            logger.info(f"Using image URL: {image_url}")
            # Log all image URLs for debugging
            logger.info(f"All image URLs in gallery: {image_gallery[:3] if image_gallery else 'None'}")  # Log first 3
        else:
            logger.warning(f"No valid image found for listing {listing_id}, using default logo")
            logger.warning(f"Raw imageGallery was: {image_gallery[:3] if image_gallery else 'None'}")
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
        
        # Add cache-busting query parameter to image URL to force WhatsApp refresh
        # Use listing's publishedAt or scrapedAt timestamp, or current time as fallback
        # This ensures the cache key changes when the listing is updated
        from datetime import datetime
        
        # Prefer publishedAt (when listing was published), then scrapedAt, then current time
        cache_timestamp = None
        if listing_data.get('publishedAt'):
            pub_date = listing_data.get('publishedAt')
            if hasattr(pub_date, 'seconds'):
                cache_timestamp = pub_date.seconds
        elif listing_data.get('scrapedAt'):
            scraped = listing_data.get('scrapedAt')
            if hasattr(scraped, 'seconds'):
                cache_timestamp = scraped.seconds
        
        # If no timestamp found, use current time
        if not cache_timestamp:
            cache_timestamp = int(datetime.now().timestamp())
        
        # Add cache-busting parameter to image URL
        # Using timestamp ensures URL changes when listing is updated
        if '?' in image_url:
            image_url_with_cache = f"{image_url}&v={cache_timestamp}"
        else:
            image_url_with_cache = f"{image_url}?v={cache_timestamp}"
        
        # Render HTML with meta tags
        html = HTML_TEMPLATE.format(
            title=title,
            description=description,
            image_url=image_url_with_cache,
            listing_url=listing_url
        )
        
        # Add headers to prevent caching by WhatsApp
        headers = {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
            'Pragma': 'no-cache',
            'Expires': '0'
        }
        
        return html, 200, headers
        
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
