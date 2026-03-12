#!/usr/bin/env python3
"""
Local email preview script - generates sample email HTML with real Firestore data.
Run: python preview_email.py
Then open preview_email.html in your browser or email it to yourself to test.
"""

import os
import datetime
import firebase_admin
from firebase_admin import firestore

# Set environment variable for frontend URL
os.environ['FRONTEND_URL'] = 'https://huishunters.com'
FRONTEND_URL = os.getenv("FRONTEND_URL", "https://huishunters.com")

# Initialize Firebase
try:
    firebase_admin.initialize_app()
    db = firestore.client()
    print("Firebase initialized successfully.")
except Exception as e:
    print(f"Error initializing Firebase: {e}")
    exit()

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
    area_str = f" ({area} m²)" if area else ""
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

    # Get images - first 4 from gallery, or fallback to mainImage
    image_gallery = listing.get('imageGallery', [])
    if image_gallery:
        images = image_gallery[:4]
    else:
        main_image = listing.get('mainImage', '')
        images = [main_image] if main_image else []

    address = listing.get('address', 'Unknown address')
    area = listing.get('area')
    area_html = f'<div style="font-size: 13px; color: #718096; margin-top: 2px;">{area}</div>' if area else ''

    price = listing.get('price', 0)
    price_formatted = f"€{price:,.0f}" if price else ""

    living_area = listing.get('livingArea')
    bedrooms = listing.get('bedrooms')
    bathrooms = listing.get('bathrooms')
    energy_label = listing.get('energyLabel')
    price_per_sqm = listing.get('pricePerSquareMeter')
    price_per_sqm_str = f"€{price_per_sqm:,.0f}/m²" if price_per_sqm else ""

    # Row 2: main specs - use &nbsp; for energy label to prevent wrapping
    specs = []
    if living_area:
        specs.append(f"{living_area} m²")
    if bedrooms:
        specs.append(f"{bedrooms} bed")
    if bathrooms:
        specs.append(f"{bathrooms} bath")
    if energy_label:
        specs.append(f"Energy&nbsp;{energy_label}")
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

    # Embedding text / short description
    embedding_text = listing.get('embeddingText', '')
    if embedding_text and len(embedding_text) > 200:
        embedding_text = embedding_text[:200] + "..."

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

    # Build image grid HTML (2x2 table)
    image_grid_html = ''
    if images:
        # Build 2x2 grid
        image_grid_html = '<table cellpadding="0" cellspacing="0" border="0" style="width: 100%; border-collapse: collapse;">'
        for i in range(0, len(images), 2):
            image_grid_html += '<tr>'
            # First image in row
            img1 = images[i]
            image_grid_html += f'<td style="width: 50%; padding: 0;"><img src="{img1}" alt="{address}" style="width: 100%; height: 150px; object-fit: cover; display: block;" /></td>'
            # Second image in row (if exists)
            if i + 1 < len(images):
                img2 = images[i + 1]
                image_grid_html += f'<td style="width: 50%; padding: 0;"><img src="{img2}" alt="{address}" style="width: 100%; height: 150px; object-fit: cover; display: block;" /></td>'
            else:
                image_grid_html += '<td style="width: 50%; padding: 0;"></td>'
            image_grid_html += '</tr>'
        image_grid_html += '</table>'

    card_html = f'''
    <div style="border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; margin-bottom: 20px; background: white;">
      <a href="{listing_url}" style="text-decoration: none; color: inherit;">
        {image_grid_html}
        <div style="padding: 16px 20px;">
          <!-- Row 1: Address + Price (table layout for Gmail) -->
          <table cellpadding="0" cellspacing="0" border="0" style="width: 100%; margin-bottom: 2px;">
            <tr>
              <td style="vertical-align: top;">
                <div style="font-size: 15px; font-weight: 600; color: #4a90e2;">{address}</div>
              </td>
              <td style="text-align: right; vertical-align: top; white-space: nowrap; padding-left: 8px;">
                <span style="font-size: 16px; font-weight: 700; color: #1a202c;">{price_formatted}</span>
              </td>
            </tr>
          </table>

          <!-- Row 2: Area + Price/m² (table layout for Gmail) -->
          <table cellpadding="0" cellspacing="0" border="0" style="width: 100%; margin-bottom: 8px;">
            <tr>
              <td style="vertical-align: middle;">
                {area_html.replace('<div style="font-size: 13px; color: #718096; margin-top: 2px;">', '<span style="font-size: 13px; color: #718096;">').replace('</div>', '</span>') if area else ''}
              </td>
              <td style="text-align: right; vertical-align: middle; white-space: nowrap; padding-left: 8px;">
                <span style="font-size: 12px; font-weight: 500; color: #1a202c;">{price_per_sqm_str}</span>
              </td>
            </tr>
          </table>

          <!-- Row 3: Specs -->
          <div style="font-size: 13px; font-weight: 600; color: #1a202c; margin-bottom: 4px;">{specs_str}</div>'''

    if details_str:
        card_html += f'''
          <!-- Row 4: Details -->
          <div style="font-size: 12px; font-weight: 500; color: #1a202c; margin-bottom: 4px;">{details_str}</div>'''

    if embedding_text:
        card_html += f'''
          <!-- Description -->
          <div style="font-size: 13px; color: #4a5568; line-height: 1.4; margin-top: 8px; margin-bottom: 8px;">{embedding_text}</div>'''

    card_html += f'''
          <!-- Footer: View Listing + Date (table layout for Gmail) -->
          <table cellpadding="0" cellspacing="0" border="0" style="width: 100%; margin-top: 12px; padding-top: 12px; border-top: 1px solid #e9ecef;">
            <tr>
              <td style="vertical-align: middle;">
                <span style="font-size: 13px; font-weight: 600; color: #4a90e2;">View Listing &rarr;</span>
              </td>
              <td style="text-align: right; vertical-align: middle;">
                <span style="font-size: 11px; color: #718096;">{date_str}</span>
              </td>
            </tr>
          </table>
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
  <!-- Outer table wrapper for Gmail compatibility -->
  <table cellpadding="0" cellspacing="0" border="0" style="width: 100%; background-color: #f5f5f5;">
    <tr>
      <td align="center" style="padding: 20px;">
        <!-- Inner content container -->
        <table cellpadding="0" cellspacing="0" border="0" style="width: 100%; max-width: 700px;">
          <tr>
            <td>
              <!-- Header card -->
              <div style="background: white; border-radius: 12px; padding: 24px; margin-bottom: 16px;">
                <h2 style="margin: 0 0 8px 0; font-size: 20px; color: #1a202c;">Hoi {user_name},</h2>
                <p style="margin: 0; font-size: 15px; color: #718096;">
                  We found {count} new listing{plural} matching your search preferences, sorted by best value (lowest price per m²).
                </p>
              </div>

'''

    for listing in listings:
        html += '              ' + build_listing_card_html(listing) + '\n'

    html += f'''
              <!-- Footer -->
              <div style="text-align: center; padding: 16px; font-size: 12px; color: #a0aec0;">
                <p>You received this email because you enabled daily email alerts on Huis Hunters Amsterdam.</p>
                <p><a href="{FRONTEND_URL}/saved-properties" style="color: #4a90e2;">Manage your preferences</a></p>
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>'''

    return html


def get_real_listings():
    """Fetch real listings from Firestore for testing."""
    print("Fetching real listings from Firestore...")

    # Query processed listings (simplified to avoid needing new index)
    listings_query = (
        db.collection('listings')
        .where('status', '==', 'processed')
        .limit(20)  # Get more to find ones with images
    )

    listings = []
    for doc in listings_query.stream():
        listing_data = doc.to_dict()
        listing_data['id'] = doc.id

        # Only include listings with images and that are available
        if listing_data.get('imageGallery') and listing_data.get('available'):
            listings.append(listing_data)
            print(f"  ✓ {listing_data.get('address')} - {listing_data.get('area', 'No area')}")

            if len(listings) >= 3:
                break

    if not listings:
        print("⚠️  No listings found with images. Using any processed listings...")
        # Fallback: just get any processed listings
        fallback_query = (
            db.collection('listings')
            .where('status', '==', 'processed')
            .limit(3)
        )
        for doc in fallback_query.stream():
            listing_data = doc.to_dict()
            listing_data['id'] = doc.id
            listings.append(listing_data)
            if len(listings) >= 3:
                break

    return listings


if __name__ == '__main__':
    print("🏡 Generating email preview with real Firestore data...")
    print()

    # Fetch real listings from Firestore
    real_listings = get_real_listings()

    if not real_listings:
        print("❌ No listings found in Firestore. Cannot generate preview.")
        exit(1)

    print(f"\nFound {len(real_listings)} listings for preview")

    # Generate HTML
    html = build_email_html("Huis Hunter", real_listings)

    # Write to file
    output_path = os.path.join(os.path.dirname(__file__), 'preview_email.html')
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(html)

    print(f"\n✅ Preview generated successfully!")
    print(f"📄 File: {output_path}")
    print(f"\nOpen the file in your browser to preview, or email it to yourself to test Gmail rendering.")
