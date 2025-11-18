import firebase_admin
from dotenv import load_dotenv
from firebase_admin import credentials, firestore

# --- INITIALIZATION ---
print("--- Initializing Price Per Square Meter Migration ---")

# Load environment variables
load_dotenv()

# Initialize Firebase
try:
    firebase_admin.initialize_app()
    db = firestore.client()
    print("✅ Firebase initialized successfully.")
except Exception as e:
    print(f"❗️ Error initializing Firebase: {e}")
    exit()

def migrate_price_per_sqm(batch_size=500):
    """
    Migrates all existing listings to add pricePerSquareMeter field.
    Calculates price / livingArea for each listing if both exist and livingArea > 0.
    """
    print(f"--- Starting Price Per Square Meter Migration (batch_size: {batch_size}) ---")
    
    # Query all listings
    all_listings = db.collection('listings').stream()
    
    listings_to_update = []
    for doc in all_listings:
        listing_data = doc.to_dict()
        listing_id = doc.id
        
        # Check if pricePerSquareMeter already exists
        if 'pricePerSquareMeter' in listing_data and listing_data['pricePerSquareMeter'] is not None:
            continue
        
        # Calculate price per square meter
        price = listing_data.get('price')
        living_area = listing_data.get('livingArea')
        price_per_sqm = None
        
        if price and living_area and living_area > 0:
            price_per_sqm = round(price / living_area)
        
        listings_to_update.append({
            'id': listing_id,
            'pricePerSquareMeter': price_per_sqm
        })
    
    if not listings_to_update:
        print("No listings need updating. All listings already have pricePerSquareMeter.")
        print("--- ✨ Migration Complete. ---")
        return
    
    print(f"Found {len(listings_to_update)} listings to update. Processing in batches of {batch_size}...")
    
    updated_count = 0
    skipped_count = 0
    current_batch = db.batch()
    batch_operations = 0
    
    for listing_update in listings_to_update:
        listing_id = listing_update['id']
        price_per_sqm = listing_update['pricePerSquareMeter']
        
        doc_ref = db.collection('listings').document(listing_id)
        
        if price_per_sqm is not None:
            current_batch.update(doc_ref, {'pricePerSquareMeter': price_per_sqm})
            updated_count += 1
        else:
            # Store null for listings where calculation is not possible
            current_batch.update(doc_ref, {'pricePerSquareMeter': None})
            skipped_count += 1
        
        batch_operations += 1
        
        # Commit batch when it reaches the batch size
        if batch_operations >= batch_size:
            try:
                current_batch.commit()
                print(f"✅ Committed batch of {batch_operations} listings. (Updated: {updated_count}, Skipped: {skipped_count})")
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
    
    print(f"--- ✨ Migration Complete. Updated {updated_count} listings, set null for {skipped_count} listings. ---")

if __name__ == "__main__":
    migrate_price_per_sqm()

