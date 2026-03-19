import { DocumentSnapshot } from 'firebase/firestore';
import { Listing } from '../types';

/**
 * Parse a Firestore document snapshot into a Listing object.
 * Handles the publishDate/publishedAt field normalization.
 * Returns null if the listing is invalid (no images, not processed, not available).
 */
export function parseListingDoc(docSnap: DocumentSnapshot): Listing | null {
  if (!docSnap.exists()) return null;

  const data = docSnap.data();
  const { publishDate, publishedAt, ...rest } = data;
  let finalPublishedDate;

  if (publishedAt && typeof publishedAt.toDate === 'function') {
    finalPublishedDate = publishedAt;
  } else if (typeof publishDate === 'string') {
    const date = new Date(publishDate);
    finalPublishedDate = {
      toDate: () => date,
      seconds: Math.floor(date.getTime() / 1000),
      nanoseconds: (date.getTime() % 1000) * 1000000
    };
  } else {
    finalPublishedDate = publishDate;
  }

  const listing = { id: docSnap.id, ...rest, publishedDate: finalPublishedDate } as Listing;

  if (!listing.imageGallery || listing.imageGallery.length === 0) return null;
  if (listing.status !== 'processed') return null;
  if (listing.available === false) return null;

  return listing;
}
