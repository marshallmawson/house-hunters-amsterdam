import os
from dotenv import load_dotenv
import firebase_admin
from firebase_admin import credentials, firestore
from apify_client import ApifyClient

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
    """Runs the Apify actor and stores each result in Firestore."""
    
    # 1. Prepare the input for the Apify Actor
    # This is the same input from the documentation you provided.
    run_input = {
        "startUrls": [{ "url": "https://www.funda.nl/zoeken/koop?selected_area=[%22amsterdam%22]&price=%22400000-750000%22&publication_date=%2210%22&availability=[%22available%22]&bedrooms=%222-%22&custom_area=_uy%255Cigs~H%257Bi%2540mdA%257C%255BiSa%2540uc%2540pd%2540~%2540rVrRpuEfByJ~%257DAePtuCsiJte%2540wdA%257DWmjCwgA%257CdBagAwf%2540c%255DhmAqXja%2540eDloArc%2540ja%2540hSvg%2540i%2540rHyF" }],
        "maxItems": 1000, # This doesn't seem to work and I get blocked because of not being a paid user
        "maxConcurrency": 100,
        "minConcurrency": 1,
        "maxRequestRetries": 100,
        "proxy": { "useApifyProxy": True, "apifyProxyGroups": ["RESIDENTIAL"] },
    }
    
    print("🤖 Starting Apify Actor for Funda... this might take a minute.")
    
    # 2. Run the Actor and wait for it to finish
    # The ID "isEqQn5XKtr3D3fRW" is for a public Funda scraper on the Apify store.
    try:
        run = apify_client.actor("isEqQn5XKtr3D3fRW").call(run_input=run_input)
        print("✅ Actor run finished.")
    except Exception as e:
        print(f"❗️ Actor run failed: {e}")
        return

    # 3. Iterate through the results and save each one to Firestore
    print("🏘️ Fetching results and saving to Firestore...")
    processed_count = 0
    for item in apify_client.dataset(run["defaultDatasetId"]).iterate_items():
        # Get the unique ID from the '_id' field
        listing_id = item.get("_id") 
        
        if not listing_id:
            print("❗️ Skipping an item because it's missing a unique 'id' field.")
            continue

        # Create a reference to a document in the 'listings' collection
        doc_ref = db.collection('listings').document(str(listing_id))

        # Check if the document already exists
        if doc_ref.get().exists:
            print(f"DB: Listing {listing_id} already exists. Skipping.")
        else:
            print(f"DB: Saving new listing {listing_id}...")
            # Add our own status fields to the data before saving
            item['status'] = 'to be reviewed'
            item['scrapedAt'] = firestore.SERVER_TIMESTAMP
            doc_ref.set(item)
            processed_count += 1
            
    print(f"--- ✨ Run Complete. Saved {processed_count} new listings to Firebase. ---")


# This line makes the script run when you execute it from the terminal
if __name__ == "__main__":
    fetch_and_store_listings()