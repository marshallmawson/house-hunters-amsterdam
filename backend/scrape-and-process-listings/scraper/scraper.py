import re 
import os
import firebase_admin
import requests
from dotenv import load_dotenv
from apify_client import ApifyClient
from firebase_admin import credentials, firestore
from google.cloud.firestore_v1.field_path import FieldPath

# --- INITIALIZATION ---
print("--- Initializing Scraper ---")

# Load API keys from .env file
load_dotenv()

# Initialize Firebase
try:
    # When running on Google Cloud, the SDK automatically detects the project's
    # service account credentials. For local development, you can use the
    # GOOGLE_APPLICATION_CREDENTIALS environment variable.
    firebase_admin.initialize_app()
    db = firestore.client()
    print("✅ Firebase initialized successfully.")
except Exception as e:
    print(f"❗️ Error initializing Firebase: {e}")
    exit()

# Initialize Apify Client
try:
    apify_token = os.getenv("APIFY_API_TOKEN")
    if not apify_token:
        raise ValueError("APIFY_API_TOKEN environment variable not found.")
    apify_client = ApifyClient(apify_token)
    print("✅ Apify client initialized successfully.")
except Exception as e:
    print(f"❗️ Error initializing Apify: {e}")
    print("Please ensure the APIFY_API_TOKEN environment variable is set.")
    exit()

# --- MAIN SCRIPT LOGIC ---

def fetch_and_store_listings():
    """Runs the Apify actor, transforms the data, and stores the clean result in Firestore."""

    # 1. Prepare the input for the Apify Actor
    run_input = {
        "startUrls": [{ "url": "https://www.funda.nl/zoeken/koop?price=%22400000-1250000%22&object_type=[%22apartment%22,%22house%22]&publication_date=%225%22&availability=[%22available%22]&sort=%22date_down%22&custom_area=%257Bhq%255Comx~H%257CLv%2560JkcHqDwhAbg%2540qcByy%2540oy%2540bJkkEwmBtu%2540_bCzhCmLlsB%2560Mfo%2540yGp%257CB_lBxgFhQ" }],
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

    # 3. Iterate through the results and prepare data for Firestore
    print("🏘️ Fetching results, transforming, and preparing for Firestore...")
    
    all_items = list(apify_client.dataset(run["defaultDatasetId"]).iterate_items())
    
    listings_to_process = {}
    for item in all_items:
        clean_data = transform_listing_data(item)
        listing_id = clean_data.get("fundaId")
        
        if not listing_id:
            print("❗️ Skipping item, could not find 'fundaId' after transformation.")
            continue
        
        # Skip listings without images
        image_gallery = clean_data.get("imageGallery", [])
        if not image_gallery or len(image_gallery) == 0:
            print(f"❗️ Skipping listing {listing_id}, no images found.")
            continue
            
        listings_to_process[str(listing_id)] = clean_data
    if not listings_to_process:
        print("No new listings to process.")
        print(f"--- ✨ Run Complete. Processed 0 listings. ---")
        return

    # Check for existing documents in batches of 30
    print(f"Checking for {len(listings_to_process)} listings in Firestore...")
    existing_listings = {}
    listing_ids = list(listings_to_process.keys())
    for i in range(0, len(listing_ids), 30):
        chunk = listing_ids[i:i+30]
        docs = db.collection('listings').where(FieldPath.document_id(), 'in', chunk).stream()
        for doc in docs:
            existing_listings[doc.id] = doc.to_dict()
    
    print(f"Found {len(existing_listings)} existing listings. Preparing batch write...")

    batch = db.batch()
    processed_count = 0
    
    for listing_id, clean_data in listings_to_process.items():
        doc_ref = db.collection('listings').document(listing_id)

        if listing_id in existing_listings and existing_listings[listing_id].get('status') == 'processed':
            continue

        clean_data['scrapedAt'] = firestore.SERVER_TIMESTAMP
        clean_data['status'] = 'needs_processing'
        clean_data['available'] = True

        if listing_id in existing_listings:
            batch.set(doc_ref, clean_data, merge=True)
        else:
            batch.set(doc_ref, clean_data)
        
        processed_count += 1

    try:
        batch.commit()
        print(f"✅ Batch write of {processed_count} listings successful.")
    except Exception as e:
        print(f"❗️ Error during batch write: {e}")
            
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
    
    # Extract the URL ID from the full URL (the actual listing ID)
    full_url = urls.get("FullUrl", "")
    url_id = None
    if full_url:
        # URL format: https://www.funda.nl/.../43101031/
        # Extract the last number before the trailing slash
        url_parts = full_url.rstrip('/').split('/')
        if url_parts and url_parts[-1].isdigit():
            url_id = url_parts[-1]

    bathroom_str = find_kenmerk_value(raw_item, 'indeling', 'indeling-totalbathroom')
    vve_str = find_kenmerk_value(raw_item, 'overdracht', 'overdracht-bijdragevve')
    
    apartment_floor = None
    apartment_type_str = find_kenmerk_value(raw_item, 'bouw', 'bouw-soortobject')
    if apartment_type_str:
        if "Ground-floor apartment" in apartment_type_str or "Benedenwoning" in apartment_type_str:
            apartment_floor = "Ground"
        elif "Upstairs apartment" in apartment_type_str or "Bovenwoning" in apartment_type_str:
            apartment_floor = "Upper"

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
    gallery = [photo_base_url.replace("{id}", p.get("Id")) for p in photo_items[:50]]
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
    
    google_maps_url = None
    if lat and lon:
        google_maps_url = f"https://maps.google.com/maps?q={lat},{lon}&z=15&output=embed"

    # Calculate price per square meter
    price = price_info.get("NumericSellingPrice")
    living_area = parse_number_from_string(fast_view.get("LivingArea"))
    price_per_sqm = None
    if price and living_area and living_area > 0:
        price_per_sqm = round(price / living_area)

    clean_listing = {
        "fundaId": url_id or raw_item.get("_id"),  # Prefer URL ID, fallback to _id
        "url": urls.get("FullUrl"),
        "address": address_details.get("Title"),
        "postalCode": address_details.get("SubTitle"),
        "neighborhood": address_details.get("NeighborhoodName"),
        "coordinates": {
            "lat": lat,
            "lon": lon
        },
        "price": price,
        "livingArea": living_area,
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
        "mainImage": main_image,
        "imageGallery": gallery,
        "floorPlans": floor_plans,
        "googleMapsUrl": google_maps_url,
        "pricePerSquareMeter": price_per_sqm
    }
    
    return clean_listing

def check_unavailable_listings():
    """Scrapes unavailable/sold listings and marks them as unavailable in Firestore."""
    
    # 1. Prepare the input for the Apify Actor (unavailable listings)
    run_input = {
        "startUrls": [{ "url": "https://www.funda.nl/zoeken/koop?price=%22400000-1250000%22&object_type=[%22apartment%22,%22house%22]&publication_date=%2230%22&availability=[%22negotiations%22,%22unavailable%22]&sort=%22date_down%22&custom_area=%257Bhq%255Comx~H%257CLv%2560JkcHqDwhAbg%2540qcByy%2540oy%2540bJkkEwmBtu%2540_bCzhCmLlsB%2560Mfo%2540yGp%257CB_lBxgFhQ" }],
        "maxItems": 1000,
        "maxConcurrency": 100,
        "minConcurrency": 1,
        "maxRequestRetries": 100,
        "proxy": { "useApifyProxy": True, "apifyProxyGroups": ["RESIDENTIAL"] },
    }
    
    print("🤖 Starting Apify Actor for unavailable listings...")
    
    # 2. Run the Actor and wait for it to finish
    try:
        run = apify_client.actor("isEqQn5XKtr3D3fRW").call(run_input=run_input)
        print("✅ Unavailable listings actor run finished.")
    except Exception as e:
        print(f"❗️ Unavailable listings actor run failed: {e}")
        return
    
    # 3. Fetch results and extract IDs
    print("🏘️ Fetching unavailable listings...")
    
    all_items = list(apify_client.dataset(run["defaultDatasetId"]).iterate_items())
    
    unavailable_ids = []
    for item in all_items:
        funda_id = item.get("_id")
        if funda_id:
            unavailable_ids.append(str(funda_id))
    
    if not unavailable_ids:
        print("No unavailable listings found.")
        print("--- ✨ Unavailable Check Complete. Marked 0 listings. ---")
        return
    
    print(f"Found {len(unavailable_ids)} unavailable listings. Marking in Firestore...")
    
    # 4. Update Firestore in batches of 30 (query limit for 'in')
    batch = db.batch()
    marked_count = 0
    
    for i in range(0, len(unavailable_ids), 30):
        chunk = unavailable_ids[i:i+30]
        
        # Find matching documents
        docs = db.collection('listings').where(FieldPath.document_id(), 'in', chunk).stream()
        
        for doc in docs:
            doc_ref = db.collection('listings').document(doc.id)
            batch.update(doc_ref, {'available': False})
            marked_count += 1
            
            # Commit every 500 updates
            if marked_count % 500 == 0:
                try:
                    batch.commit()
                    print(f"✅ Marked {marked_count} listings as unavailable so far...")
                    batch = db.batch()
                except Exception as e:
                    print(f"❗️ Error during batch commit: {e}")
                    return
    
    # Commit remaining updates
    if marked_count % 500 != 0:
        try:
            batch.commit()
            print(f"✅ Final batch committed.")
        except Exception as e:
            print(f"❗️ Error during final batch commit: {e}")
            return
    
    print(f"--- ✨ Unavailable Check Complete. Marked {marked_count} listings as unavailable. ---")

def check_image_url(url):
    """Check if an image URL returns 404."""
    if not url:
        return False
    
    try:
        response = requests.head(url, timeout=10, allow_redirects=True)
        return response.status_code == 200
    except Exception:
        return False

def check_listing_url(url):
    """Check if a Funda listing URL exists and is still available."""
    if not url:
        return False
    
    try:
        response = requests.get(url, timeout=10, allow_redirects=True)
        if response.status_code != 200:
            return False
        
        text = response.text
        
        # Check for various "removed" indicators
        if "We cannot find this page" in text:
            return False
        if "The page you requested is no longer available" in text:
            return False
        if "This property is no longer available" in text:
            return False
        if "Verkocht onder voorbehoud" in text or "Verkopen onder voorbehoud" in text:
            return False
        if 'status":"sold"' in text or '"availability":"unavailable"' in text:
            return False
        
        # If we got here, listing appears to be available
        return True
    except Exception:
        return False

def check_removed_listings():
    """Checks if any available listings have been removed from Funda by checking their mainImage URLs."""
    
    print("🔍 Checking for removed listings...")
    
    # Get all available listings
    available_listings = {}
    for doc in db.collection('listings').where('available', '==', True).stream():
        data = doc.to_dict()
        available_listings[doc.id] = data
    
    if not available_listings:
        print("No available listings to check.")
        return
    
    print(f"Checking {len(available_listings)} available listings...")
    
    # Check each listing's mainImage URL for 404
    batch = db.batch()
    removed_count = 0
    checked_count = 0
    
    for listing_id, data in available_listings.items():
        main_image = data.get('mainImage')
        if not main_image:
            continue
        
        checked_count += 1
        is_valid = check_image_url(main_image)
        
        if not is_valid:
            # Mark as unavailable
            doc_ref = db.collection('listings').document(listing_id)
            batch.update(doc_ref, {'available': False})
            removed_count += 1
            
            # Commit every 500 updates
            if removed_count % 500 == 0:
                try:
                    batch.commit()
                    print(f"✅ Marked {removed_count} removed listings so far...")
                    batch = db.batch()
                except Exception as e:
                    print(f"❗️ Error during batch commit: {e}")
                    return
        
        # Print progress every 20 listings
        if checked_count % 20 == 0:
            print(f"   Checked {checked_count}/{len(available_listings)}... Found {removed_count} with 404 images so far")
    
    # Commit remaining updates
    if removed_count > 0:
        try:
            batch.commit()
            print(f"✅ Final batch committed.")
        except Exception as e:
            print(f"❗️ Error during final batch commit: {e}")
            return
    
    print(f"--- ✨ Removed Check Complete. Marked {removed_count} listings as unavailable. ---")


# This line makes the script run when you execute it from the terminal
if __name__ == "__main__":
    fetch_and_store_listings()
    check_unavailable_listings()
    check_removed_listings()
