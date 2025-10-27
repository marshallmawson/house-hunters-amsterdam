import firebase_admin
from firebase_admin import credentials, firestore
from dotenv import load_dotenv

# --- INITIALIZATION ---
print("--- Starting Availability Migration ---")

# Load environment variables
load_dotenv()

# Initialize Firebase
try:
    firebase_admin.initialize_app()
    db = firestore.client()
    print("✅ Firebase initialized successfully.")
except Exception as e:
    print(f"❗️ Error initializing Firebase: {e}")
    print("Ensure the GOOGLE_APPLICATION_CREDENTIALS environment variable is set.")
    exit()

def migrate_availability():
    """Sets available=true on all existing listings in batches."""
    print("Fetching all listings...")
    
    # Get all listings
    all_listings = db.collection('listings').stream()
    
    # Process in batches of 500 (Firestore batch limit)
    batch = db.batch()
    count = 0
    total_updated = 0
    
    for doc in all_listings:
        doc_ref = db.collection('listings').document(doc.id)
        batch.update(doc_ref, {'available': True})
        count += 1
        
        # Commit every 500 documents
        if count >= 500:
            try:
                batch.commit()
                total_updated += count
                print(f"✅ Updated {total_updated} listings so far...")
                batch = db.batch()
                count = 0
            except Exception as e:
                print(f"❗️ Error during batch commit: {e}")
                return
    
    # Commit remaining documents
    if count > 0:
        try:
            batch.commit()
            total_updated += count
            print(f"✅ Updated {total_updated} listings in final batch.")
        except Exception as e:
            print(f"❗️ Error during final batch commit: {e}")
            return
    
    print(f"--- ✨ Migration Complete. Updated {total_updated} total listings. ---")

if __name__ == "__main__":
    migrate_availability()

