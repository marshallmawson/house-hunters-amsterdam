import os
import re
import firebase_admin
from dotenv import load_dotenv
from firebase_admin import credentials, firestore
from google.cloud import translate_v2 as translate
import google.generativeai as genai
import vertexai
from vertexai.language_models import TextEmbeddingModel

# --- INITIALIZATION ---
print("--- Initializing Processor ---")

# Load API keys from .env file
load_dotenv()

# Initialize Firebase
try:
    # The SDK will automatically look for the GOOGLE_APPLICATION_CREDENTIALS environment
    # variable and use the service account file it points to.
    firebase_admin.initialize_app()
    db = firestore.client()
    print("✅ Firebase initialized successfully.")
except Exception as e:
    print(f"❗️ Error initializing Firebase: {e}")
    print("Ensure the GOOGLE_APPLICATION_CREDENTIALS environment variable is set to the path of your Firebase service account key file.")
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
    exit()

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
    exit()

def clean_description(description):
    """
    Extracts the English portion of a listing description, if available, and removes boilerplate.
    """
    if not description:
        return ""

    english_text = ""
    # Descriptions often have a Dutch part then "--- English text ---" or similar.
    # We'll try a few common separators.
    separators = [
        "**english**",
        "english version",
        "english text below",
        "--- english ---",
        "--- en ---",
    ]

    found = False
    for sep in separators:
        if sep in description.lower():
            # Split and take the second part
            parts = re.split(re.escape(sep), description, flags=re.IGNORECASE)
            if len(parts) > 1:
                english_text = parts[1]
                found = True
                break
    
    if not found:
        # If no clear separator is found, it's likely the description is either
        # all in one language or doesn't follow the expected format.
        # We will proceed with the entire description.
        english_text = description
    
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

def translate_text(text, translate_client):
    if not text:
        return ""
    try:
        # The API is idempotent, it won't re-translate if it's already in English.
        result = translate_client.translate(text, target_language='en')
        return result['translatedText']
    except Exception as e:
        print(f"❗️ Error during translation: {e}")
        return text # Fallback to original text

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

def process_listings(limit=100):
    """
    Queries Firestore for listings that need AI processing,
    generates the data, and updates them in a batch.
    """
    print(f"--- Starting AI Processing Run (limit: {limit}) ---")
    
    docs_to_process = db.collection('listings').where('status', '==', 'needs_processing').limit(limit).stream()
    
    listings_to_update = list(docs_to_process)
    
    if not listings_to_update:
        print("No listings found with status 'needs_processing'.")
        print("--- ✨ Processing Run Complete. ---")
        return

    print(f"Found {len(listings_to_update)} listings to process. Preparing batch write...")
    
    batch = db.batch()
    processed_count = 0

    for doc in listings_to_update:
        listing_data = doc.to_dict()
        listing_id = doc.id

        raw_description = listing_data.get('description', '')
        
        # 1. Clean the description
        cleaned_description = clean_description(raw_description)
        
        # 2. Translate the description
        translated_description = translate_text(cleaned_description, translate_client)
        
        listing_data['cleanedDescription'] = translated_description

        # 3. Generate the embedding text (summary + features)
        embedding_text = generate_embedding_text(listing_data)
        
        # 4. Generate the embedding vector
        listing_embedding = generate_embedding(embedding_text)

        update_data = {
            'cleanedDescription': translated_description,
            'embeddingText': embedding_text,
            'listingEmbedding': listing_embedding,
            'status': 'processed',
            'processedAt': firestore.SERVER_TIMESTAMP
        }

        doc_ref = db.collection('listings').document(listing_id)
        batch.update(doc_ref, update_data)
        processed_count += 1
        print(f"Queued update for listing {listing_id}")

    try:
        batch.commit()
        print(f"✅ Batch write of {processed_count} listings successful.")
    except Exception as e:
        print(f"❗️ Error during batch write: {e}")

    print(f"--- ✨ Processing Run Complete. Processed {processed_count} listings. ---")


if __name__ == "__main__":
    process_listings()
