import re 
import os
import firebase_admin
from dotenv import load_dotenv
from apify_client import ApifyClient
from firebase_admin import credentials, firestore
from google.cloud import translate_v2 as translate
import google.generativeai as genai
import vertexai
from vertexai.language_models import TextEmbeddingModel

# --- INITIALIZATION ---
print("--- Initializing Script ---")

# Load API keys from .env file
load_dotenv()

# Initialize Firebase
# This uses the credentials file you downloaded
try:
    cred = credentials.Certificate("firebase-credentials.json")
    firebase_admin.initialize_app(cred)
    db = firestore.client()
    print("✅ Firebase initialized successfully.")
except Exception as e:
    print(f"❗️ Error initializing Firebase: {e}")
    exit()

# Initialize Apify Client
try:
    apify_token = os.getenv("APIFY_API_TOKEN")
    if not apify_token:
        raise ValueError("APIFY_API_TOKEN not found in .env file")
    apify_client = ApifyClient(apify_token)
    print("✅ Apify client initialized successfully.")
except Exception as e:
    print(f"❗️ Error initializing Apify: {e}")
    exit()

# Initialize Google Translate Client
try:
    translate_client = translate.Client()
    print("✅ Google Translate client initialized successfully.")
except Exception as e:
    print(f"❗️ Error initializing Google Translate: {e}")
    exit()

# Initialize the Generative Model
try:
    gemini_api_key = os.getenv("GEMINI_API_KEY")
    if not gemini_api_key:
        raise ValueError("GEMINI_API_KEY not found in .env file")
    genai.configure(api_key=gemini_api_key)
    model = genai.GenerativeModel('gemini-pro-latest')
    print("✅ Generative model initialized successfully.")
except Exception as e:
    print(f"❗️ Error initializing generative model: {e}")
    # Continue without this feature if it fails. The field will be missing.
    model = None

# Initialize Vertex AI
try:
    project_id = os.getenv("GCP_PROJECT_ID")
    if not project_id:
        raise ValueError("GCP_PROJECT_ID not found in .env file")
    vertexai.init(project=project_id)
    embedding_model = TextEmbeddingModel.from_pretrained("text-embedding-004")
    print("✅ Vertex AI initialized successfully.")
except Exception as e:
    print(f"❗️ Error initializing Vertex AI: {e}")
    embedding_model = None # Continue without embedding generation

# --- MAIN SCRIPT LOGIC ---


kml_coordinates_string = """
  4.8954475,52.3803562,0 4.8825728,52.385176,0 4.8789679,52.3856999,0
  4.8480686,52.3850713,0 4.8539909,52.3806179,0 4.8466094,52.3780508,0
  4.8478969,52.3697715,0 4.8504719,52.3636921,0 4.8489269,52.3586602,0
  4.8456654,52.3522646,0 4.844807,52.3469168,0 4.8516735,52.345239,0
  4.8848044,52.3495384,0 4.8858344,52.3454487,0 4.8918426,52.3431415,0
  4.9131288,52.3426172,0 4.9115838,52.3477557,0 4.930295,52.3533131,0
  4.9266901,52.3584505,0 4.9314967,52.3609665,0 4.9309817,52.3655789,0
  4.9126996,52.3698501,0 4.9098242,52.3692213,0 4.9017133,52.3659195,0
  4.8957479,52.3647404,0 4.8906839,52.3654217,0 4.8869073,52.36778,0
  4.8871648,52.3726799,0 4.8954475,52.3803562,0
"""

amsterdam_inner_ring_polygon = [
    (float(lon), float(lat))
    for lon, lat, _ in (
        coords.strip().split(',') for coords in kml_coordinates_string.strip().split()
    )
]

def point_in_polygon(lon, lat, polygon):
    """
    Checks if a point (lon, lat) is inside a polygon using the ray-casting algorithm.
    The polygon is a list of (lon, lat) tuples.
    """
    n = len(polygon)
    inside = False
    p1lon, p1lat = polygon[0]
    for i in range(n + 1):
        p2lon, p2lat = polygon[i % n]
        if lat > min(p1lat, p2lat):
            if lat <= max(p1lat, p2lat):
                if lon <= max(p1lon, p2lon):
                    if p1lat != p2lat:
                        lon_intersection = (lat - p1lat) * (p2lon - p1lon) / (p2lat - p1lat) + p1lon
                    if p1lon == p2lon or lon <= lon_intersection:
                        inside = not inside
        p1lon, p1lat = p2lon, p2lat
    return inside

def generate_embedding(text):
    """Generates an embedding vector for a given text."""
    if not embedding_model or not text:
        return None
    try:
        embeddings = embedding_model.get_embeddings([text])
        return embeddings[0].values
    except Exception as e:
        print(f"❗️ Could not generate embedding: {e}")
        return None

def fetch_and_store_listings():
    """Runs the Apify actor, transforms the data, and stores the clean result in Firestore."""

    
    # 1. Prepare the input for the Apify Actor
    run_input = {
        "startUrls": [{ "url": "https://www.funda.nl/zoeken/koop?price=%22400000-750000%22&publication_date=%2210%22&availability=[%22available%22]&bedrooms=%222-%22&sort=%22date_down%22&custom_area=_uy%255Cigs~HkDkb%2540od%2540aa%2540%257C%255BiSa%2540uc%2540pd%2540~%2540rVrRpuEfByJ~%257DAePtuCsiJte%2540wdA%257DWmjCwgA%257CdBagAwf%2540c%255DhmAqXja%2540eDloArc%2540ja%2540hSvg%2540i%2540rHyF" }],
        "maxItems": 1000, #free limit is 100 anyway it seems
        "maxConcurrency": 100,
        "minConcurrency": 1,
        "maxRequestRetries": 100,
        "proxy": { "useApifyProxy": True, "apifyProxyGroups": ["RESIDENTIAL"] },
    }
    
    print("🤖 Starting Apify Actor for Funda... this might take a minute.")
    
    # 2. Run the Actor and wait for it to finish
    try:
        run = apify_client.actor("isEqQn5XKtr3D3fRW").call(run_input=run_input)
        print("✅ Actor run finished.")
    except Exception as e:
        print(f"❗️ Actor run failed: {e}")
        return

    # 3. Iterate through the results and save each one to Firestore
    print("🏘️ Fetching results, transforming, and saving to Firestore...")
    processed_count = 0
    for item in apify_client.dataset(run["defaultDatasetId"]).iterate_items():
        
        clean_data = transform_listing_data(item)
        listing_id = clean_data.get("fundaId")
        
        if not listing_id:
            print("❗️ Skipping item, could not find 'fundaId' after transformation.")
            continue

        # Only process listings that are in the desired area.
        if not clean_data.get('isInInnerRing'):
            print(f"DB: Skipping listing {listing_id} (not in inner ring).")
            continue

        # Generate embedding for the text.
        embedding_text = clean_data.get("embeddingText")
        listing_embedding = generate_embedding(embedding_text)
        if listing_embedding:
            clean_data['listingEmbedding'] = listing_embedding

        doc_ref = db.collection('listings').document(str(listing_id))

        # Check if the document already exists to determine if it's a new listing or an update.
        if doc_ref.get().exists:
            print(f"DB: Updating existing listing {listing_id}...")
            # For existing listings, we merge the new data to avoid overwriting fields
            # that might be updated manually (like 'status').
            clean_data['scrapedAt'] = firestore.SERVER_TIMESTAMP # Always update the scraped time
            doc_ref.set(clean_data, merge=True)
        else:
            print(f"DB: Saving new listing {listing_id}...")
            # For new listings, we set the initial status.
            clean_data['status'] = 'to be reviewed'
            clean_data['scrapedAt'] = firestore.SERVER_TIMESTAMP
            doc_ref.set(clean_data)
        
        processed_count += 1
            
    print(f"--- ✨ Run Complete. Processed {processed_count} listings. ---")

def parse_number_from_string(text):
    """Finds the first number in a string and returns it as an integer."""
    if not isinstance(text, str):
        return None
    numbers = re.findall(r'\d+', text)
    if numbers:
        return int(numbers[0])
    return None

def find_kenmerk_value(raw_item, section_id, feature_id):
    """Helper function to find a specific value in the complex KenmerkSections list."""
    for section in raw_item.get('KenmerkSections', []):
        if section.get('Id') == section_id:
            for feature in section.get('KenmerkenList', []):
                if feature.get('Id') == feature_id:
                    return feature.get('Value')
    return None


def clean_description(description):
    """
    Extracts the English portion of a listing description, translating if necessary, and removes boilerplate.
    """
    if not description:
        return ""

    english_text = ""
    # Descriptions often have a Dutch part then "--- English text ---" or similar.
    # We'll try a few common separators.
    separators = [
        "**english**"
        "english version",
        "english text below",
        "--- english ---",
        "--- en ---",
    ]

    found = False
    for sep in separators:
        if sep in description.lower():
            # Split and take the second part
            parts = re.split(sep, description, flags=re.IGNORECASE)
            if len(parts) > 1:
                english_text = parts[1]
                found = True
                break
    
    if not found:
        # If no clear separator is found, it's likely the description is either
        # all in one language or doesn't follow the expected format.
        # We will proceed with the entire description and translate if needed.
        try:
            # Detect language
            detection = translate_client.detect_language([description])
            if detection[0]['language'] != 'en':
                # Translate to English
                translation = translate_client.translate(description, target_language='en')
                english_text = translation['translatedText']
            else:
                english_text = description
        except Exception as e:
            print(f"❗️ Error during translation: {e}")
            english_text = description # Fallback to original description
    
    # 2. Clean the Text
    # Remove boilerplate legal disclaimers (both English and Dutch)
    boilerplate_patterns = [
        r'ASBESTOS CLAUSE.*',
        r'AGE CLAUSE.*',
        r'NEN CLAUSE.*',
        r'OWNERS DID NOT LIVE IN THE APARTMENT RECENTLY.*',
        r'This information has been compiled by us with due care.*',
        r'Deze informatie is door ons met de nodige zorgvuldigheid samengesteld.*'
    ]
    cleaned_text = english_text
    for pattern in boilerplate_patterns:
        cleaned_text = re.sub(pattern, '', cleaned_text, flags=re.IGNORECASE | re.DOTALL)

    return cleaned_text.strip()

    
def generate_embedding_text(clean_listing):
    """
    Generates a summary and combines it with key features for AI processing.
    """
    summary = "No description available."
    cleaned_description = clean_listing.get("cleanedDescription", "")

    if model and cleaned_description: # Check if model was initialized
        try:
            prompt = f'''
            Based on the following apartment description, write a concise, one-paragraph summary.
            Focus on the apartment's overall vibe and its key selling points.
            Do not include any HTML or markdown.

            Description:
            ---
            {cleaned_description}
            ---
            Summary:
            '''
            response = model.generate_content(prompt)
            summary = response.text
        except Exception as e:
            print(f"❗️ Could not generate summary: {e}")
            summary = "Summary generation failed."
    elif not model:
        summary = "Summary generation skipped: model not initialized."

    # Combine with structured data
    features = []
    if clean_listing.get("bedrooms"):
        features.append(f'{clean_listing["bedrooms"]}-bedroom')
    if clean_listing.get("bathrooms"):
        features.append(f'{clean_listing["bathrooms"]}-bathroom')
    
    feature_str = ", ".join(features)
    
    location_str = ""
    if clean_listing.get("neighborhood"):
        location_str = f' in the {clean_listing["neighborhood"]} neighborhood'

    apartment_type_str = ""
    if clean_listing.get("apartmentFloor"):
        floor = clean_listing["apartmentFloor"]
        if isinstance(floor, int):
            apartment_type_str = f" on floor {floor}"
        else:
            apartment_type_str = f" a {floor}-floor unit"

    outdoor_space_parts = []
    if clean_listing.get("hasBalcony"):
        outdoor_space_parts.append("a balcony")
    if clean_listing.get("hasGarden"):
        outdoor_space_parts.append("a garden")
    if clean_listing.get("hasRooftopTerrace"):
        outdoor_space_parts.append("a rooftop terrace")

    outdoor_space_str = ""
    if not outdoor_space_parts:
        outdoor_space_str = " with no balcony or garden."
    else:
        outdoor_space_str = " with " + " and ".join(outdoor_space_parts) + "."


    features_summary = f"Features: This is a {feature_str} apartment{location_str}. It is{apartment_type_str}{outdoor_space_str}"

    embedding_text = f"Summary: {summary}. {features_summary}"
    
    return embedding_text


#transform the data for our DB
def transform_listing_data(raw_item):
    """Takes the raw scraper output and returns a clean, detailed dictionary."""
    
    price_info = raw_item.get('Price', {})
    targeting_options = raw_item.get('Advertising', {}).get('TargetingOptions', {})
    source_info = raw_item.get('basicInfo', {}).get('_source', {})
    address_details = raw_item.get('AddressDetails', {})
    fast_view = raw_item.get('FastView', {})
    listing_description_text = raw_item.get('ListingDescription', {}).get("Description")
    urls = raw_item.get('Urls', {}).get('FriendlyUrl', {})

    bathroom_str = find_kenmerk_value(raw_item, 'indeling', 'indeling-totalbathroom')
    vve_str = find_kenmerk_value(raw_item, 'overdracht', 'overdracht-bijdragevve')
    
    apartment_floor = None
    apartment_type_str = find_kenmerk_value(raw_item, 'bouw', 'bouw-soortobject')
    if apartment_type_str:
        if "Ground-floor apartment" in apartment_type_str or "Benedenwoning" in apartment_type_str:
            apartment_floor = "Ground"
        elif "Upstairs apartment" in apartment_type_str or "Bovenwoning" in apartment_type_str:
            apartment_floor = "Top floor"

    if apartment_floor is None:
        floor_str = find_kenmerk_value(raw_item, 'indeling', 'indeling-locatedat')
        if floor_str:
            if "Ground floor" in floor_str:
                apartment_floor = "Ground"
            else:
                apartment_floor = parse_number_from_string(floor_str)

    stories_str = find_kenmerk_value(raw_item, 'indeling', 'indeling-totalstories')
    number_of_stories = parse_number_from_string(stories_str)

    # --- CORRECTED LOGIC for Outdoor Space ---
    outdoor_space_str = None
    # First, try to find balcony/building-attached space, as it's more common
    for section in raw_item.get('KenmerkSections', []):
        if section.get('Id') == 'afmetingen':
            for feature in section.get('KenmerkenList', []):
                for sub_feature in feature.get('KenmerkenList', []):
                    if sub_feature.get('Id') == 'afmetingen-gebruiksoppervlakte-gebouwgebondenbuitenruimte':
                        outdoor_space_str = sub_feature.get('Value')
                        break
                if outdoor_space_str: break
    
    # If no balcony space was found, specifically look for the main garden area
    if not outdoor_space_str:
        outdoor_space_str = find_kenmerk_value(raw_item, 'buitenruimte', 'buitenruimte-hoofdtuin')

    photos_info = raw_item.get("Media", {}).get("Photos", {})
    photo_items = photos_info.get("Items", [])
    photo_base_url = photos_info.get("MediaBaseUrl", "")
    gallery = [photo_base_url.replace("{id}", p.get("Id")) for p in photo_items[:5]]
    main_image = gallery[0] if gallery else None

    floor_plans_raw = raw_item.get("Media", {}).get("LegacyFloorPlan", {}).get("Items", [])
    floor_plans = [f"https://cloud.funda.nl/valentina_media/{fp.get('ThumbnailId')}.png" for fp in floor_plans_raw]

    agent_info_list = source_info.get('agent', [])
    agent_name = None
    agent_url = None
    if agent_info_list:
        agent_name = agent_info_list[0].get('name')
        relative_url = agent_info_list[0].get('relative_url')
        if relative_url:
            agent_url = f"https://www.funda.nl{relative_url}"

    lat = raw_item.get("Coordinates", {}).get("Latitude")
    lon = raw_item.get("Coordinates", {}).get("Longitude")
    is_in_inner_ring = False
    if lat and lon:
        is_in_inner_ring = point_in_polygon(lon, lat, amsterdam_inner_ring_polygon)

    # Clean the description
    cleaned_description = clean_description(listing_description_text)

    clean_listing = {
        "fundaId": raw_item.get("_id"),
        "url": urls.get("FullUrl"),
        "address": address_details.get("Title"),
        "postalCode": address_details.get("SubTitle"),
        "neighborhood": address_details.get("NeighborhoodName"),
        "isInInnerRing": is_in_inner_ring,
        "coordinates": {
            "lat": lat,
            "lon": lon
        },
        "price": price_info.get("NumericSellingPrice"),
        "livingArea": parse_number_from_string(fast_view.get("LivingArea")),
        "bedrooms": parse_number_from_string(fast_view.get("NumberOfBedrooms")),
        "bathrooms": parse_number_from_string(bathroom_str),
        "apartmentFloor": apartment_floor,
        "numberOfStories": number_of_stories,
        "energyLabel": fast_view.get("EnergyLabel"),
        "hasBalcony": targeting_options.get('balkon') == 'true',
        "hasGarden": targeting_options.get('tuin') == 'true',
        "hasRooftopTerrace": targeting_options.get('dakterras') == 'true',
        "outdoorSpaceArea": parse_number_from_string(outdoor_space_str),
        "yearBuilt": targeting_options.get('bouwjaar'),
        "publishDate": source_info.get('publish_date'),
        "agentName": agent_name,
        "agentUrl": agent_url,
        "vveContribution": parse_number_from_string(vve_str),
        "description": listing_description_text,
        "cleanedDescription": cleaned_description,
        "mainImage": main_image,
        "imageGallery": gallery,
        "floorPlans": floor_plans
    }
    
    # Generate the final text for AI embedding
    embedding_text = generate_embedding_text(clean_listing)
    clean_listing['embeddingText'] = embedding_text
    
    return clean_listing



# This line makes the script run when you execute it from the terminal
if __name__ == "__main__":
    fetch_and_store_listings()