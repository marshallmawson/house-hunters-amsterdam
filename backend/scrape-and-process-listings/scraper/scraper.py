import re 
import os
import firebase_admin
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
        listings_to_process[str(listing_id)] = clean_data
    if not listings_to_process:
        print("No new listings to process.")
        print(f"--- ✨ Run Complete. Processed 0 listings. ---")
        return

    # Check for existing documents in batches of 30
    print(f"Checking for {len(listings_to_process)} listings in Firestore...")
    existing_listings = {}
    listing_ids = list(listings_to_process.keys())
    for i in range(0, len(listing_ids), 50):
        chunk = listing_ids[i:i+50]
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
    gallery = [photo_base_url.replace("{id}", p.get("Id")) for p in photo_items[:30]]
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

    clean_listing = {
        "fundaId": raw_item.get("_id"),
        "url": urls.get("FullUrl"),
        "address": address_details.get("Title"),
        "postalCode": address_details.get("SubTitle"),
        "neighborhood": address_details.get("NeighborhoodName"),
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
        "mainImage": main_image,
        "imageGallery": gallery,
        "floorPlans": floor_plans,
        "googleMapsUrl": google_maps_url
    }
    
    return clean_listing



# This line makes the script run when you execute it from the terminal
if __name__ == "__main__":
    fetch_and_store_listings()
