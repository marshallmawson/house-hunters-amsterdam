import re 
import os
import firebase_admin
from dotenv import load_dotenv
from apify_client import ApifyClient
from firebase_admin import credentials, firestore

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
            if clean_data.get('isInInnerRing'):
                print(f"DB: Saving new listing {listing_id} (in inner ring)...")
                # Add our status fields to the CLEAN data.
                clean_data['status'] = 'to be reviewed'
                clean_data['scrapedAt'] = firestore.SERVER_TIMESTAMP
                
                # Save the CLEAN data to Firestore, not the raw item.
                doc_ref.set(clean_data)
                processed_count += 1
            else:
                print(f"DB: Skipping new listing {listing_id} (not in inner ring).")
            
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
    address_details = raw_item.get('AddressDetails', {})
    fast_view = raw_item.get('FastView', {})
    listing_description = raw_item.get('ListingDescription', {})
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
        "description": listing_description.get("Description"),
        "mainImage": main_image,
        "imageGallery": gallery,
        "floorPlans": floor_plans
    }
    
    return clean_listing



# This line makes the script run when you execute it from the terminal
if __name__ == "__main__":
    fetch_and_store_listings()