import os
from dotenv import load_dotenv
import firebase_admin
from firebase_admin import credentials, firestore
from apify_client import ApifyClient
import re 

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

# --- MAIN SCRIPT LOGIC ---

def fetch_and_store_listings():
    """Runs the Apify actor, transforms the data, and stores the clean result in Firestore."""
    
    # 1. Prepare the input for the Apify Actor
    run_input = {
        "startUrls": [{ "url": "https://www.funda.nl/zoeken/koop?selected_area=[%22amsterdam%22]&price=%22400000-750000%22&publication_date=%2210%22&availability=[%22available%22]&bedrooms=%222-%22&sort=%22date_down%22&custom_area=_uy%255Cigs~HkDkb%2540od%2540aa%2540%257C%255BiSa%2540uc%2540pd%2540~%2540rVrRpuEfByJ~%257DAePtuCsiJte%2540wdA%257DWmjCwgA%257CdBagAwf%2540c%255DhmAqXja%2540eDloArc%2540ja%2540hSvg%2540i%2540rHyF" }],
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
        
        # ### NEW LINE ###
        # First, transform the raw data into our clean structure.
        clean_data = transform_listing_data(item)
        
        # ### MODIFIED LINE ###
        # Get the unique ID from our new clean_data object.
        listing_id = clean_data.get("fundaId")
        
        if not listing_id:
            print("❗️ Skipping item, could not find 'fundaId' after transformation.")
            continue

        # Create a reference to a document in the 'listings' collection
        doc_ref = db.collection('listings').document(str(listing_id))

        # Check if the document already exists
        if doc_ref.get().exists:
            print(f"DB: Listing {listing_id} already exists. Skipping.")
        else:
            print(f"DB: Saving new listing {listing_id}...")
            # ### MODIFIED LINES ###
            # Add our status fields to the CLEAN data.
            clean_data['status'] = 'to be reviewed'
            clean_data['scrapedAt'] = firestore.SERVER_TIMESTAMP
            
            # Save the CLEAN data to Firestore, not the raw item.
            doc_ref.set(clean_data)
            processed_count += 1
            
    print(f"--- ✨ Run Complete. Saved {processed_count} new listings to Firebase. ---")

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

    bathroom_str = find_kenmerk_value(raw_item, 'indeling', 'indeling-totalbathroom')
    vve_str = find_kenmerk_value(raw_item, 'overdracht', 'overdracht-bijdragevve')
    
    apartment_floor = None
    apartment_type_str = find_kenmerk_value(raw_item, 'bouw', 'bouw-soortobject')
    if apartment_type_str and "Benedenwoning" in apartment_type_str:
        apartment_floor = "Ground"
    else:
        floor_str = find_kenmerk_value(raw_item, 'indeling', 'indeling-locatedat')
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

    photos = raw_item.get("Media", {}).get("Photos", [])
    gallery = [p.get('PhotoUrl') for p in photos[:5]]
    
    floor_plans_raw = raw_item.get("Media", {}).get("FloorPlan", {}).get("Floors", [])
    floor_plans = [fp.get('ThumbnailUrl') for fp in floor_plans_raw]

    agent_info_list = source_info.get('agent', [])
    agent_name = None
    agent_url = None
    if agent_info_list:
        agent_name = agent_info_list[0].get('name')
        relative_url = agent_info_list[0].get('relative_url')
        if relative_url:
            agent_url = f"https://www.funda.nl{relative_url}"

    clean_listing = {
        "fundaId": raw_item.get("_id"),
        "url": raw_item.get("Advertising", {}).get("ContentUrl"),
        "address": raw_item.get("AddressTitle"),
        "postalCode": raw_item.get("AddressSubTitle"),
        "neighborhood": raw_item.get("BuurtName"),
        "coordinates": {
            "lat": raw_item.get("Coordinates", {}).get("Latitude"),
            "lon": raw_item.get("Coordinates", {}).get("Longitude")
        },
        "price": price_info.get("NumericSellingPrice"),
        "livingArea": parse_number_from_string(raw_item.get("WoonOppervlakteSubTitle")),
        "bedrooms": parse_number_from_string(raw_item.get("NumberOfBedrooms")),
        "bathrooms": parse_number_from_string(bathroom_str),
        "apartmentFloor": apartment_floor,
        "numberOfStories": number_of_stories,
        "energyLabel": raw_item.get("FastView", {}).get("EnergyLabel"),
        "hasBalcony": targeting_options.get('balkon') == 'true',
        "hasGarden": targeting_options.get('tuin') == 'true',
        "hasRooftopTerrace": targeting_options.get('dakterras') == 'true',
        "outdoorSpaceArea": parse_number_from_string(outdoor_space_str),
        "yearBuilt": targeting_options.get('bouwjaar'),
        "publishDate": source_info.get('publish_date'),
        "agentName": agent_name,
        "agentUrl": agent_url,
        "vveContribution": parse_number_from_string(vve_str),
        "description": raw_item.get("Aanbiedingstekst"),
        "mainImage": raw_item.get("Media", {}).get("HoofdfotoUrl"),
        "imageGallery": gallery,
        "floorPlans": floor_plans
    }
    
    return clean_listing



# This line makes the script run when you execute it from the terminal
if __name__ == "__main__":
    fetch_and_store_listings()