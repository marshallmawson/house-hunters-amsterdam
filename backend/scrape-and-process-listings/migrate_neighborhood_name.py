import firebase_admin
from dotenv import load_dotenv
from firebase_admin import credentials, firestore

# --- INITIALIZATION ---
print("--- Initializing Neighborhood Name Migration ---")

# Load environment variables
load_dotenv()

# Initialize Firebase
try:
    if not firebase_admin._apps:
        firebase_admin.initialize_app()
    db = firestore.client()
    print("✅ Firebase initialized successfully.")
except Exception as e:
    print(f"❗️ Error initializing Firebase: {e}")
    exit()

def migrate_neighborhood_name(old_name: str, new_name: str, batch_size: int = 500):
    """
    Migrates all listings with the old neighborhood name to the new name.
    
    Args:
        old_name: The old neighborhood name to replace
        new_name: The new neighborhood name
        batch_size: Number of updates to batch together before committing
    """
    print(f"--- Starting Neighborhood Name Migration ---")
    print(f"Old name: '{old_name}'")
    print(f"New name: '{new_name}'")
    print(f"Batch size: {batch_size}")
    
    # Query all listings with the old area name (processor uses 'area' field, not 'neighborhood')
    listings_ref = db.collection('listings')
    query = listings_ref.where('area', '==', old_name)
    matching_listings = query.stream()
    
    listings_to_update = []
    for doc in matching_listings:
        listing_data = doc.to_dict()
        listing_id = doc.id
        
        # Double-check the area field matches
        if listing_data.get('area') == old_name:
            listings_to_update.append({
                'id': listing_id,
                'current_area': listing_data.get('area')
            })
    
    if not listings_to_update:
        print(f"No listings found with area '{old_name}'.")
        print("--- ✨ Migration Complete. ---")
        return
    
    print(f"Found {len(listings_to_update)} listings to update. Processing in batches of {batch_size}...")
    
    updated_count = 0
    current_batch = db.batch()
    batch_operations = 0
    
    for listing_update in listings_to_update:
        listing_id = listing_update['id']
        doc_ref = db.collection('listings').document(listing_id)
        
        current_batch.update(doc_ref, {'area': new_name})
        updated_count += 1
        batch_operations += 1
        
        # Commit batch when it reaches the batch size
        if batch_operations >= batch_size:
            try:
                current_batch.commit()
                print(f"✅ Committed batch of {batch_operations} listings. (Total updated: {updated_count})")
            except Exception as e:
                print(f"❗️ Error during batch commit: {e}")
            current_batch = db.batch()
            batch_operations = 0
    
    # Commit any remaining operations in the final batch
    if batch_operations > 0:
        try:
            current_batch.commit()
            print(f"✅ Committed final batch of {batch_operations} listings.")
        except Exception as e:
            print(f"❗️ Error during final batch commit: {e}")
    
    print(f"--- ✨ Migration Complete. Updated {updated_count} listings from '{old_name}' to '{new_name}'. ---")

if __name__ == "__main__":
    migrate_neighborhood_name("Good Oost", "Oost - Amstel")

