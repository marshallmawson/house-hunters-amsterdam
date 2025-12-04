# Published Date Filter - Production Deployment Checklist

## Status Summary

✅ **Code Complete:**
- Backend scraper has `publishedAt` timestamp field (line 306 in `scraper.py`)
- Migration script exists (`backend/scrape-and-process-listings/migrate_published_at.py`)
- Frontend filter UI implemented and pushed to main branch
- Search service supports `publishedWithinDays` filter

⚠️ **Needs Production Deployment:**
- Deploy updated scraper to production (so new listings get `publishedAt`)
- Run migration script against production Firestore (backfill existing listings)

## Steps to Deploy

### 1. Deploy Updated Scraper to Production

The scraper code already includes `publishedAt` field. Deploy the updated scraper so that:
- All new listings scraped will have both `publishDate` (string) and `publishedAt` (timestamp)
- Existing listings will continue to work (they'll get `publishedAt` when re-scraped or via migration)

**Deployment:**
- Follow your standard scraper deployment process
- Verify that new listings have the `publishedAt` field after deployment

### 2. Backfill Existing Listings (Run Migration)

**IMPORTANT:** Run the migration script against production Firestore to backfill `publishedAt` for all existing listings.

**Script Location:**
```
backend/scrape-and-process-listings/migrate_published_at.py
```

**How to Run:**

1. **Local with Production Credentials:**
   ```bash
   cd backend/scrape-and-process-listings
   # Ensure GOOGLE_APPLICATION_CREDENTIALS points to production service account
   python migrate_published_at.py
   ```

2. **Or via Cloud Run/Cloud Function:**
   - Deploy the migration script as a one-time Cloud Run job
   - Or run it in a Cloud Shell instance with production access

**What it does:**
- Scans all documents in the `listings` collection
- For each listing missing `publishedAt`:
  - Parses the `publishDate` string into a timezone-aware `datetime`
  - Updates the document with `publishedAt` field
- Uses batch writes (500 at a time) for efficiency
- Logs progress and any failures

**Expected Output:**
```
--- Starting publishedAt migration (batch_size=500) ---
✅ Committed batch of 500 updates (total updated: 500)
✅ Committed batch of 500 updates (total updated: 1000)
...
✅ Committed final batch of 234 updates.
--- ✨ Migration complete. Updated: 1234, Already had publishedAt: 56, No publishDate: 0, Failed parse: 2 ---
```

**Verification After Migration:**
- Check a few listings in Firestore console - they should have `publishedAt` field
- Test the date filter in the frontend - it should work immediately

### 3. Verify Deployment

After both steps:

1. **Check Scraper:**
   - Trigger a new scrape
   - Verify new listings have `publishedAt` field in Firestore

2. **Check Migration:**
   - Sample a few older listings in Firestore
   - Verify they have `publishedAt` populated

3. **Test Frontend:**
   - Use the "Published in last" filter (1 day, 3 days, 7 days)
   - Verify results are filtered correctly
   - Test both regular listings and AI search results

## Notes

- The migration script is **idempotent** - safe to run multiple times (skips listings that already have `publishedAt`)
- Listings without a `publishDate` string will be skipped (these should be rare/old)
- Failed parses are logged but don't stop the migration

## Rollback Plan

If issues occur:
- The frontend already has fallback logic to parse `publishDate` strings if `publishedAt` is missing
- Filter will still work (may be slower due to string parsing)
- No data loss - only adding fields, not removing

## Files Changed

- `backend/scrape-and-process-listings/scraper/scraper.py` - Added `publishedAt` field
- `backend/scrape-and-process-listings/migrate_published_at.py` - Migration script (NEW)
- `backend/scrape-and-process-listings/search/search_service.py` - Date filter logic
- `backend/scrape-and-process-listings/search_api.py` - Date filter parameter handling
- Frontend files (already deployed via git push)

