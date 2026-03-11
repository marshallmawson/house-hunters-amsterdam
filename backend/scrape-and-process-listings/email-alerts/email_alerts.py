import os
import datetime
import firebase_admin
from dotenv import load_dotenv
from firebase_admin import firestore
from email_utils import send_email_alert, send_html_email

# --- INITIALIZATION ---
print("--- Initializing Email Alerts Job ---")

load_dotenv()

try:
    firebase_admin.initialize_app()
    db = firestore.client()
    print("Firebase initialized successfully.")
except Exception as e:
    print(f"Error initializing Firebase: {e}")
    exit()

FRONTEND_URL = os.getenv("FRONTEND_URL", "https://huishunters.com")


def matches_preferences(listing, prefs):
    """
    Check if a listing matches user search preferences.
    Replicates the frontend filter logic from Listings.tsx lines 802-849.
    """
    # Price range
    price = listing.get('price', 0) or 0
    price_range = prefs.get('priceRange', {})
    min_price = price_range.get('min', 0)
    max_price = price_range.get('max', float('inf'))
    if price < min_price or price > max_price:
        return False

    # Bedrooms
    bedrooms_pref = prefs.get('bedrooms', 'any')
    if bedrooms_pref and bedrooms_pref != 'any':
        min_bedrooms = int(bedrooms_pref.replace('+', ''))
        listing_bedrooms = listing.get('bedrooms') or 0
        if listing_bedrooms < min_bedrooms:
            return False

    # Floor level
    floor_pref = prefs.get('floorLevel', 'any')
    if floor_pref and floor_pref != 'any':
        apt_floor = listing.get('apartmentFloor')
        if floor_pref == 'ground' and apt_floor != 'Ground':
            return False
        if floor_pref == 'top' and apt_floor not in ('Upper', 'Top floor', 'Upper floor'):
            return False

    # Outdoor spaces
    outdoor_prefs = prefs.get('selectedOutdoorSpaces', [])
    if outdoor_prefs:
        has_match = any(
            (space == 'garden' and listing.get('hasGarden')) or
            (space == 'rooftop' and listing.get('hasRooftopTerrace')) or
            (space == 'balcony' and listing.get('hasBalcony'))
            for space in outdoor_prefs
        )
        if not has_match:
            return False

    # Minimum size
    min_size = prefs.get('minSize', '')
    if min_size:
        living_area = listing.get('livingArea') or 0
        if living_area < int(min_size):
            return False

    # Selected areas
    selected_areas = prefs.get('selectedAreas', [])
    if selected_areas:
        listing_area = listing.get('area')
        if listing_area not in selected_areas:
            return False

    # Must have images
    image_gallery = listing.get('imageGallery', [])
    if not image_gallery:
        return False

    return True


def get_outdoor_space_string(listing):
    """Build outdoor space description, matching MapListingCard logic."""
    spaces = []
    if listing.get('hasGarden'):
        spaces.append('Garden')
    if listing.get('hasRooftopTerrace'):
        spaces.append('Rooftop Terrace')
    if listing.get('hasBalcony'):
        spaces.append('Balcony')

    if not spaces:
        return None

    area = listing.get('outdoorSpaceArea')
    area_str = f" ({area} m\u00b2)" if area else ""
    return f"{' + '.join(spaces)}{area_str}"


def get_floor_string(listing):
    """Build floor description."""
    apt_floor = listing.get('apartmentFloor')
    if not apt_floor:
        return None
    if isinstance(apt_floor, int):
        return f"Floor {apt_floor}"
    if 'floor' in str(apt_floor).lower():
        return str(apt_floor)
    return f"{apt_floor} floor"


def build_listing_card_html(listing):
    """Build HTML for a single listing card, modelled on MapListingCard."""
    listing_id = listing.get('id', '')
    listing_url = f"{FRONTEND_URL}/listings/{listing_id}"
    image = listing.get('mainImage', '')
    address = listing.get('address', 'Unknown address')
    neighborhood = listing.get('neighborhood')
    neighborhood_html = f'<div style="font-size: 13px; color: #718096; margin-top: 2px;">{neighborhood}</div>' if neighborhood else ''

    price = listing.get('price', 0)
    price_formatted = f"\u20ac{price:,.0f}" if price else ""

    living_area = listing.get('livingArea')
    bedrooms = listing.get('bedrooms')
    bathrooms = listing.get('bathrooms')
    energy_label = listing.get('energyLabel')
    price_per_sqm = listing.get('pricePerSquareMeter')
    price_per_sqm_str = f"\u20ac{price_per_sqm:,.0f}/m\u00b2" if price_per_sqm else ""

    # Row 2: main specs
    specs = []
    if living_area:
        specs.append(f"{living_area} m\u00b2")
    if bedrooms:
        specs.append(f"{bedrooms} bed")
    if bathrooms:
        specs.append(f"{bathrooms} bath")
    if energy_label:
        specs.append(f"Energy {energy_label}")
    specs_str = " &bull; ".join(specs)

    # Row 3: floor & outdoor
    details = []
    floor_str = get_floor_string(listing)
    if floor_str:
        details.append(floor_str)
    stories = listing.get('numberOfStories')
    if stories and stories >= 2:
        details.append(f"{stories} stories")
    outdoor_str = get_outdoor_space_string(listing)
    if outdoor_str:
        details.append(outdoor_str)
    details_str = " &bull; ".join(details)

    # Published date
    published_at = listing.get('publishedAt')
    date_str = ""
    if published_at:
        try:
            if hasattr(published_at, 'strftime'):
                date_str = published_at.strftime("%d %b %Y")
            else:
                date_str = str(published_at)
        except Exception:
            pass

    card_html = f'''
    <div style="border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; margin-bottom: 20px; background: white;">
      <a href="{listing_url}" style="text-decoration: none; color: inherit;">
        <img src="{image}" alt="{address}" style="width: 100%; height: 220px; object-fit: cover; display: block;" />
        <div style="padding: 16px 20px;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 4px;">
            <div style="flex: 1; margin-right: 8px;">
              <div style="font-size: 15px; font-weight: 600; color: #4a90e2;">{address}</div>
              {neighborhood_html}
            </div>
            <span style="font-size: 16px; font-weight: 700; color: #1a202c; white-space: nowrap;">{price_formatted}</span>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
            <span style="font-size: 13px; font-weight: 600; color: #1a202c;">{specs_str}</span>
            <span style="font-size: 12px; font-weight: 500; color: #1a202c; white-space: nowrap; margin-left: 8px;">{price_per_sqm_str}</span>
          </div>'''

    if details_str:
        card_html += f'''
          <div style="font-size: 12px; font-weight: 500; color: #1a202c; margin-bottom: 4px;">{details_str}</div>'''

    card_html += f'''
          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 12px; padding-top: 12px; border-top: 1px solid #e9ecef;">
            <span style="font-size: 13px; font-weight: 600; color: #4a90e2;">View Listing &rarr;</span>
            <span style="font-size: 11px; color: #718096;">{date_str}</span>
          </div>
        </div>
      </a>
    </div>'''

    return card_html


def build_email_html(user_name, listings):
    """Build the full HTML email with listing cards."""
    count = len(listings)
    plural = "s" if count != 1 else ""

    html = f'''<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5; margin: 0; padding: 0;">
  <div style="max-width: 700px; margin: 0 auto; padding: 20px;">
    <div style="background: white; border-radius: 12px; padding: 24px; margin-bottom: 16px;">
      <h2 style="margin: 0 0 8px 0; font-size: 20px; color: #1a202c;">Hi {user_name},</h2>
      <p style="margin: 0; font-size: 15px; color: #718096;">
        We found {count} new listing{plural} matching your search preferences, sorted by best value (lowest price per m\u00b2).
      </p>
    </div>

'''

    for listing in listings:
        html += build_listing_card_html(listing)

    html += f'''
    <div style="text-align: center; padding: 16px; font-size: 12px; color: #a0aec0;">
      <p>You received this email because you enabled daily email alerts on Huis Hunters Amsterdam.</p>
      <p><a href="{FRONTEND_URL}/saved-properties" style="color: #4a90e2;">Manage your preferences</a></p>
    </div>
  </div>
</body>
</html>'''

    return html


def run_email_alerts():
    """Main function: iterate users, match listings, send emails."""
    print("--- Starting Email Alert Job ---")

    # 1. Get all users
    users = list(db.collection('users').stream())
    print(f"Found {len(users)} users")

    if not users:
        print("No users found. Exiting.")
        return

    emails_sent = 0
    skipped_no_optin = 0
    skipped_no_prefs = 0
    skipped_no_matches = 0

    for user_doc in users:
        user_data = user_doc.to_dict()
        user_id = user_doc.id
        user_name = user_data.get('name', 'House Hunter')
        user_email = user_data.get('email')

        # Check opt-in
        if not user_data.get('emailAlerts'):
            skipped_no_optin += 1
            continue

        if not user_email:
            print(f"Skipping user {user_id} - no email address")
            continue

        # 2. Load search preferences
        prefs_doc = db.collection('users').document(user_id).collection('searchPreferences').document('lastUsed').get()

        if not prefs_doc.exists:
            print(f"Skipping {user_email} - no search preferences")
            skipped_no_prefs += 1
            continue

        prefs = prefs_doc.to_dict()

        # 3. Determine cutoff time
        last_sent = user_data.get('lastEmailSentAt')
        if last_sent:
            cutoff = last_sent
        else:
            cutoff = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(hours=24)

        # 4. Query new processed, available listings since cutoff
        listings_query = (
            db.collection('listings')
            .where('status', '==', 'processed')
            .where('available', '==', True)
            .where('processedAt', '>', cutoff)
        )
        new_listings = list(listings_query.stream())

        if not new_listings:
            print(f"No new listings for {user_email}")
            skipped_no_matches += 1
            continue

        # 5. Filter by preferences
        matched = []
        for doc in new_listings:
            listing = doc.to_dict()
            listing['id'] = doc.id
            if matches_preferences(listing, prefs):
                matched.append(listing)

        if not matched:
            print(f"No matching listings for {user_email} (from {len(new_listings)} new)")
            skipped_no_matches += 1
            continue

        # 6. Sort by pricePerSquareMeter ascending (None values last)
        matched.sort(key=lambda x: x.get('pricePerSquareMeter') or float('inf'))

        # 7. Build and send email
        html = build_email_html(user_name, matched)
        count = len(matched)
        plural = "s" if count != 1 else ""
        subject = f"🏡 Huis Hunters Daily: {count} new listing{plural} meeting your preferences"

        success = send_html_email(subject, html, user_email)

        if success:
            # 8. Update lastEmailSentAt
            db.collection('users').document(user_id).update({
                'lastEmailSentAt': firestore.SERVER_TIMESTAMP
            })
            emails_sent += 1
            print(f"Sent email to {user_email} with {len(matched)} listings")
        else:
            print(f"Failed to send email to {user_email}")

    print(f"--- Email Alert Job Complete ---")
    print(f"  Emails sent: {emails_sent}")
    print(f"  Skipped (no opt-in): {skipped_no_optin}")
    print(f"  Skipped (no prefs): {skipped_no_prefs}")
    print(f"  Skipped (no matches): {skipped_no_matches}")


if __name__ == "__main__":
    try:
        run_email_alerts()
    except Exception as e:
        error_msg = f"Email alert job failed: {e}"
        print(f"Error: {error_msg}")
        send_email_alert(
            subject="Email Alert Job Failed - House Hunters Amsterdam",
            body=f"The email alert job encountered an error.\n\nError details:\n{error_msg}"
        )
        raise
