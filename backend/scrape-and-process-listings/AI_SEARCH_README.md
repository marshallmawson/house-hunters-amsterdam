# AI-Powered Search for House Hunters Amsterdam

This implementation adds natural language search capabilities to your house hunting app using Vertex AI embeddings and semantic similarity.

## 🚀 What's New

### Backend Components

1. **`search_service.py`** - Core search functionality
   - Generates embeddings for user queries using Vertex AI
   - Calculates cosine similarity between query and listing embeddings
   - Implements hybrid search combining semantic similarity with structured filters
   - Supports both semantic-only and hybrid search modes

2. **`search_api.py`** - Flask REST API
   - `/search` endpoint for AI-powered search
   - `/search/suggestions` endpoint for search suggestions
   - `/health` endpoint for health checks
   - Handles CORS for frontend integration

3. **`test_search.py`** - Test script
   - Validates search functionality
   - Tests cosine similarity calculations
   - Provides sample queries for testing

### Frontend Components

1. **Enhanced `Listings.tsx`**
   - Added AI search input field with beautiful UI
   - Integrated search results with existing filter system
   - Maintains URL state for search queries
   - Shows search relevance scores and result counts

2. **Updated `types.ts`**
   - Added `searchScore` field to Listing interface

## 🔧 Setup Instructions

### 1. Backend Setup

```bash
# Navigate to the backend directory
cd backend/scrape-and-process-listings

# Install search API requirements
pip install -r search_requirements.txt

# Set up environment variables in your .env file
export GOOGLE_APPLICATION_CREDENTIALS="firebase-credentials.json"
export GCP_PROJECT_ID="your-gcp-project-id"
export GEMINI_API_KEY="your-gemini-api-key"
```

### 2. Start the Search API

```bash
# Option 1: Use the startup script
./start_search_api.sh

# Option 2: Run directly
python search_api.py
```

The API will start on `http://localhost:5000`

### 3. Test the Search Functionality

```bash
# Run the test script
python test_search.py
```

### 4. Frontend Integration

The frontend is already configured to connect to the search API at `http://localhost:5000`. Make sure:

1. The search API is running
2. Your frontend development server is running
3. CORS is properly configured (already set up)

## 🎯 How It Works

### 1. Embedding Generation
- User queries are converted to 768-dimensional embeddings using Vertex AI's `text-embedding-004` model
- Each listing already has an embedding generated from its description and features

### 2. Similarity Calculation
- Cosine similarity is calculated between query embedding and all listing embeddings
- Results are ranked by similarity score (0.0 to 1.0)

### 3. Hybrid Search
- Combines semantic similarity with structured filters
- Applies price, bedroom, area, and other filters server-side
- Adds recency boost for newer listings
- Returns optimally ranked results

### 4. Frontend Integration
- Search results replace regular listings when AI search is active
- Filters are applied server-side for AI search
- URL state is maintained for shareable search links
- Clear visual indicators show when AI search is active

## 📝 Example Queries

Try these natural language queries:

- **"modern apartment with garden"** - Finds contemporary apartments with outdoor space
- **"quiet place with balcony"** - Locates peaceful apartments with balconies
- **"family-friendly 3-bedroom"** - Searches for family-oriented 3-bedroom units
- **"luxury apartment near city center"** - Finds high-end apartments in central locations
- **"affordable studio apartment"** - Locates budget-friendly studio units
- **"ground floor apartment"** - Finds ground-level units
- **"top floor with view"** - Locates upper-level apartments with views

## 🔍 API Endpoints

### POST `/search`
Search listings using natural language.

**Request Body:**
```json
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
  "search_type": "hybrid"
}
```

**Response:**
```json
{
  "results": [
    {
      "id": "listing_id",
      "address": "123 Example Street",
      "price": 650000,
      "bedrooms": 2,
      "searchScore": 0.847,
      // ... other listing fields
    }
  ],
  "total": 25,
  "query": "modern apartment with garden",
  "search_type": "hybrid"
}
```

### GET `/search/suggestions`
Get popular search suggestions.

**Response:**
```json
{
  "suggestions": [
    "modern apartment with garden",
    "quiet place with balcony",
    // ... more suggestions
  ]
}
```

## 🎨 UI Features

### Search Interface
- **Prominent search bar** with placeholder examples
- **Real-time search** with Enter key support
- **Loading states** with visual feedback
- **Clear search** button to return to regular browsing

### Search Results
- **Relevance ranking** based on semantic similarity
- **Search score display** in result indicators
- **Result count** showing number of matches
- **Seamless integration** with existing filters

### Visual Design
- **Blue accent colors** to distinguish AI search
- **Clear status indicators** showing search mode
- **Responsive design** that works on all devices
- **Smooth transitions** between search and browse modes

## 🚀 Performance Considerations

### Backend Optimizations
- **Server-side filtering** reduces data transfer
- **Cosine similarity** is computed efficiently with NumPy
- **Batch processing** for multiple similarity calculations
- **Caching** of embeddings (handled by Vertex AI)

### Frontend Optimizations
- **Debounced search** prevents excessive API calls
- **Result caching** for repeated queries
- **Lazy loading** of search results
- **Optimized re-renders** with proper dependency arrays

## 🔧 Configuration Options

### Search API Settings
- **Port**: Configurable via `PORT` environment variable (default: 5000)
- **CORS**: Enabled for frontend integration
- **Rate limiting**: Can be added if needed
- **Logging**: Configured for debugging

### Search Behavior
- **Similarity weight**: Adjustable in hybrid search (default: 0.7)
- **Result limits**: Configurable per request (max: 100)
- **Recency boost**: Optional boost for newer listings
- **Filter integration**: Full integration with existing filters

## 🐛 Troubleshooting

### Common Issues

1. **Search API not responding**
   - Check if the API is running on port 5000
   - Verify environment variables are set
   - Check Firebase credentials are valid

2. **No search results**
   - Ensure listings have been processed with embeddings
   - Check if listings have `status: "processed"`
   - Verify Vertex AI is properly configured

3. **CORS errors**
   - Flask-CORS is configured, but check browser console
   - Ensure API is running on localhost:5000

4. **Slow search performance**
   - Consider implementing result caching
   - Check Firestore query performance
   - Monitor Vertex AI API quotas

### Debug Mode
- Set `debug=True` in `search_api.py` for detailed error messages
- Check browser developer tools for frontend errors
- Use `test_search.py` to validate backend functionality

## 🎉 Next Steps

### Potential Enhancements
1. **Search suggestions** based on user behavior
2. **Search history** for returning users
3. **Advanced filters** in AI search (e.g., "pet-friendly")
4. **Search analytics** to improve results
5. **Multi-language support** for Dutch queries
6. **Image-based search** using vision embeddings

### Performance Improvements
1. **Result caching** with Redis
2. **Embedding pre-computation** for popular queries
3. **Elasticsearch integration** for faster similarity search
4. **CDN integration** for static assets

## 📊 Success Metrics

Track these metrics to measure AI search success:

- **Search usage**: Percentage of users using AI search vs. filters
- **Result relevance**: Click-through rates on search results
- **User satisfaction**: Time spent on search result pages
- **Query diversity**: Variety of natural language queries
- **Conversion rates**: From search to listing views

---

**🎯 Your AI search implementation is now complete and ready to provide users with intuitive, natural language search capabilities for finding their perfect Amsterdam apartment!**
