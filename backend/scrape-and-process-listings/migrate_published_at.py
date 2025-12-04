import firebase_admin
from firebase_admin import firestore
from dotenv import load_dotenv
from datetime import datetime

print("--- Initializing publishedAt migration ---")

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
    raise SystemExit(1)


def parse_publish_date(publish_date: str):
    """Parse Funda publish_date ISO string into a datetime.

    Example format: '2025-11-14T19:45:03.6530000+01:00'
    Python's fromisoformat only supports up to 6 digits of fractional
    seconds, so we normalise the string when necessary.
    """
    if not isinstance(publish_date, str) or not publish_date:
        return None
    try:
        return datetime.fromisoformat(publish_date)
    except ValueError:
        try:
            # Trim fractional seconds to max 6 digits while preserving timezone
            tz_sep_index = max(publish_date.rfind("+"), publish_date.rfind("-"))
            if tz_sep_index == -1:
                core = publish_date
                tz_part = ""
            else:
                core = publish_date[:tz_sep_index]
                tz_part = publish_date[tz_sep_index:]

            if "." in core:
                date_part, frac = core.split(".", 1)
                frac_digits = "".join(ch for ch in frac if ch.isdigit())
                if len(frac_digits) > 6:
                    frac_digits = frac_digits[:6]
                core_fixed = f"{date_part}.{frac_digits}"
            else:
                core_fixed = core

            fixed_str = f"{core_fixed}{tz_part}"
            return datetime.fromisoformat(fixed_str)
        except Exception:
            return None


def migrate_published_at(batch_size: int = 500):
    """Backfill publishedAt from publishDate string for existing listings."""
    print(f"--- Starting publishedAt migration (batch_size={batch_size}) ---")

    listings_ref = db.collection("listings")
    docs = listings_ref.stream()

    batch = db.batch()
    ops_in_batch = 0
    updated = 0
    skipped_no_publish = 0
    already_set = 0
    failed_parse = 0

    for doc in docs:
        data = doc.to_dict()

        if "publishedAt" in data and data.get("publishedAt") is not None:
            already_set += 1
            continue

        publish_str = data.get("publishDate")
        if not publish_str:
            skipped_no_publish += 1
            continue

        parsed = parse_publish_date(publish_str)
        if not parsed:
            failed_parse += 1
            print(f"⚠️ Could not parse publishDate for listing {doc.id}: {publish_str}")
            continue

        doc_ref = listings_ref.document(doc.id)
        batch.update(doc_ref, {"publishedAt": parsed})
        ops_in_batch += 1
        updated += 1

        if ops_in_batch >= batch_size:
            try:
                batch.commit()
                print(f"✅ Committed batch of {ops_in_batch} updates (total updated: {updated})")
            except Exception as e:
                print(f"❗️ Error committing batch: {e}")
            batch = db.batch()
            ops_in_batch = 0

    if ops_in_batch > 0:
        try:
            batch.commit()
            print(f"✅ Committed final batch of {ops_in_batch} updates.")
        except Exception as e:
            print(f"❗️ Error committing final batch: {e}")

    print(
        "--- ✨ Migration complete. "
        f"Updated: {updated}, Already had publishedAt: {already_set}, "
        f"No publishDate: {skipped_no_publish}, Failed parse: {failed_parse} ---"
    )


if __name__ == "__main__":
    migrate_published_at()


