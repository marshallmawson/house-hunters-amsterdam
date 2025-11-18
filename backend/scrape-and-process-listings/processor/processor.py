import os
import re
import firebase_admin
from dotenv import load_dotenv
from firebase_admin import credentials, firestore
from transformers import MarianMTModel, MarianTokenizer, AutoTokenizer, AutoModelForSeq2SeqLM
import vertexai
from vertexai.language_models import TextEmbeddingModel
import datetime
import xml.etree.ElementTree as ET

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

def parse_kml_file(file_path):
    """Parses a KML file to extract area polygons."""
    namespaces = {'kml': 'http://www.opengis.net/kml/2.2'}
    tree = ET.parse(file_path)
    root = tree.getroot()
    areas = []
    for placemark in root.findall('.//kml:Placemark', namespaces):
        name = placemark.find('kml:name', namespaces).text
        coordinates_str = placemark.find('.//kml:coordinates', namespaces).text.strip()
        polygon = []
        for coord in coordinates_str.split():
            lon, lat, _ = coord.split(',')
            polygon.append((float(lon), float(lat)))
        areas.append({'name': name, 'polygon': polygon})
    return areas

def log_timestamp(message):
    print(f"[{datetime.datetime.now()}] {message}")

# --- INITIALIZATION ---
log_timestamp("--- Initializing Processor ---")

# Load API keys from .env file
log_timestamp("Loading environment variables...")
load_dotenv()
log_timestamp("✅ Environment variables loaded.")

# Initialize Firebase
try:
    log_timestamp("Initializing Firebase...")
    firebase_admin.initialize_app()
    db = firestore.client()
    log_timestamp("✅ Firebase initialized successfully.")
except Exception as e:
    log_timestamp(f"❗️ Error initializing Firebase: {e}")
    log_timestamp("Ensure the GOOGLE_APPLICATION_CREDENTIALS environment variable is set to the path of your Firebase service account key file.")
    exit()

# Initialize Hugging Face Translation Model
try:
    log_timestamp("Initializing Hugging Face translation model (Dutch to English)...")
    model_name = "Helsinki-NLP/opus-mt-nl-en"
    translate_tokenizer = MarianTokenizer.from_pretrained(model_name)
    translate_model = MarianMTModel.from_pretrained(model_name)
    log_timestamp("✅ Hugging Face translation model initialized successfully.")
except Exception as e:
    log_timestamp(f"❗️ Error initializing translation model: {e}")
    exit()

# Initialize Hugging Face Summarization Model
try:
    log_timestamp("Initializing Hugging Face summarization model...")
    summarizer_model_name = "sshleifer/distilbart-cnn-12-6"
    summarizer_tokenizer = AutoTokenizer.from_pretrained(summarizer_model_name)
    summarizer_model = AutoModelForSeq2SeqLM.from_pretrained(summarizer_model_name)
    log_timestamp("✅ Hugging Face summarization model initialized successfully.")
except Exception as e:
    log_timestamp(f"❗️ Error initializing summarization model: {e}")
    summarizer_model = None
    summarizer_tokenizer = None

# Initialize Vertex AI
try:
    log_timestamp("Initializing Vertex AI...")
    project_id = os.getenv("GCP_PROJECT_ID")
    if not project_id:
        raise ValueError("GCP_PROJECT_ID not found in .env file")
    vertexai.init(project=project_id)
    embedding_model = TextEmbeddingModel.from_pretrained("text-embedding-004")
    log_timestamp("✅ Vertex AI initialized successfully.")
except Exception as e:
    log_timestamp(f"❗️ Error initializing Vertex AI: {e}")
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

from langdetect import detect, LangDetectException

def translate_text(text):
    if not text:
        return ""
    try:
        # Detect the language of the text
        lang = detect(text)
        # If the language is English, no need to translate
        if lang == 'en':
            return text
        
        # Translate using Hugging Face model
        # truncation=True handles texts longer than model's max length gracefully
        translated = translate_model.generate(**translate_tokenizer(text, return_tensors="pt", padding=True, truncation=True, max_length=512))
        translated_text = translate_tokenizer.decode(translated[0], skip_special_tokens=True)
        return translated_text
    except LangDetectException:
        # If language detection fails, fallback to the original text
        return text
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

    if summarizer_model and summarizer_tokenizer and cleaned_description:
        try:
            # BART works best with 1024 tokens or less
            inputs = summarizer_tokenizer(cleaned_description, max_length=1024, truncation=True, return_tensors="pt")
            summary_ids = summarizer_model.generate(
                inputs["input_ids"], 
                max_length=150, 
                min_length=40, 
                length_penalty=2.0, 
                num_beams=4
            )
            summary = summarizer_tokenizer.decode(summary_ids[0], skip_special_tokens=True)
            # Fix spacing issues (remove space before punctuation)
            summary = summary.replace(' .', '.').replace(' ,', ',').replace(' !', '!').replace(' ?', '?')
        except Exception as e:
            print(f"❗️ Could not generate summary: {e}")
            summary = "Summary generation failed."
    elif not summarizer_model:
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

    embedding_text = f"{summary} {features_summary}"
    
    return embedding_text

def process_listings(limit=None, batch_size=20):
    """
    Queries Firestore for listings that need AI processing,
    generates the data, and updates them in batches.
    
    Args:
        limit: Maximum number of listings to process in this run (None = process all)
        batch_size: Number of listings to process before committing to Firestore
    """
    limit_str = "all" if limit is None else str(limit)
    print(f"--- Starting AI Processing Run (limit: {limit_str}, batch_size: {batch_size}) ---")

    areas = parse_kml_file('neighborhoods.kml')
    
    query = db.collection('listings').where('status', '==', 'needs_processing')
    if limit is not None:
        query = query.limit(limit)
    docs_to_process = query.stream()
    
    listings_to_update = list(docs_to_process)
    
    if not listings_to_update:
        print("No listings found with status 'needs_processing'.")
        print("--- ✨ Processing Run Complete. ---")
        return

    print(f"Found {len(listings_to_update)} listings to process. Processing in batches of {batch_size}...")
    
    processed_count = 0
    skipped_count = 0
    current_batch = db.batch()
    batch_operations = 0

    for doc in listings_to_update:
        listing_data = doc.to_dict()
        listing_id = doc.id

        # Assign area
        listing_area = None
        coords = listing_data.get('coordinates')
        if coords and coords.get('lon') and coords.get('lat'):
            for hood in areas:
                if point_in_polygon(coords['lon'], coords['lat'], hood['polygon']):
                    listing_area = hood['name']
                    break
        
        if not listing_area:
            print(f"❗️ Listing {listing_id} is not in any defined area. Skipping.")
            doc_ref = db.collection('listings').document(listing_id)
            current_batch.update(doc_ref, {'status': 'processed_without_area'})
            batch_operations += 1
            skipped_count += 1
            # Commit batch if it's getting large
            if batch_operations >= batch_size:
                try:
                    current_batch.commit()
                    print(f"✅ Committed batch of {batch_operations} listings (skipped).")
                except Exception as e:
                    print(f"❗️ Error during batch commit: {e}")
                current_batch = db.batch()
                batch_operations = 0
            continue

        listing_data['area'] = listing_area

        raw_description = listing_data.get('description', '')
        
        # 1. Clean the description
        cleaned_description = clean_description(raw_description)
        
        # 2. Translate the description
        translated_description = translate_text(cleaned_description)
        
        listing_data['cleanedDescription'] = translated_description

        # 3. Generate the embedding text (summary + features)
        embedding_text = generate_embedding_text(listing_data)
        
        # 4. Generate the embedding vector
        listing_embedding = generate_embedding(embedding_text)

        # 5. Calculate price per square meter if missing
        price_per_sqm = listing_data.get('pricePerSquareMeter')
        if price_per_sqm is None:
            price = listing_data.get('price')
            living_area = listing_data.get('livingArea')
            if price and living_area and living_area > 0:
                price_per_sqm = round(price / living_area)

        update_data = {
            'area': listing_area,
            'cleanedDescription': translated_description,
            'embeddingText': embedding_text,
            'listingEmbedding': listing_embedding,
            'status': 'processed',
            'processedAt': firestore.SERVER_TIMESTAMP
        }
        
        # Only add pricePerSquareMeter to update if it was calculated
        if price_per_sqm is not None:
            update_data['pricePerSquareMeter'] = price_per_sqm

        doc_ref = db.collection('listings').document(listing_id)
        current_batch.update(doc_ref, update_data)
        batch_operations += 1
        processed_count += 1
        print(f"Processed listing {listing_id} ({processed_count}/{len(listings_to_update)})")

        # Commit batch when it reaches the batch size
        if batch_operations >= batch_size:
            try:
                current_batch.commit()
                print(f"✅ Committed batch of {batch_operations} listings.")
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

    print(f"--- ✨ Processing Run Complete. Processed {processed_count} listings, skipped {skipped_count}. ---")


if __name__ == "__main__":
    process_listings()
