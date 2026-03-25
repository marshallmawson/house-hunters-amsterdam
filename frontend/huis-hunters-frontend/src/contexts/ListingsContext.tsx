import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { collection, getDocs, query, where, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase';
import { Listing } from '../types';

interface ListingsContextType {
  listings: Listing[];
  loading: boolean;
  getListingById: (id: string) => Listing | undefined;
  ensureLoaded: () => void;
}

const ListingsContext = createContext<ListingsContextType | undefined>(undefined);

export const useListingsContext = (): ListingsContextType => {
  const ctx = useContext(ListingsContext);
  if (!ctx) throw new Error('useListingsContext must be used within ListingsProvider');
  return ctx;
};

export const ListingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchStarted, setFetchStarted] = useState(false);

  const ensureLoaded = useCallback(() => {
    setFetchStarted(true);
  }, []);

  useEffect(() => {
    if (!fetchStarted) return;
    setLoading(true);
    const fetchListings = async () => {
      try {
        const q = query(
          collection(db, "listings"),
          where("status", "==", "processed"),
          where("available", "==", true),
          orderBy("publishedAt", "desc"),
          limit(500)
        );
        const querySnapshot = await getDocs(q);
        const listingsData = querySnapshot.docs
          .map(doc => {
            const { publishDate, publishedAt, ...rest } = doc.data();
            let finalPublishedDate;

            if (publishedAt && typeof publishedAt.toDate === 'function') {
              // Preferred canonical Firestore Timestamp
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

            return { id: doc.id, ...rest, publishedDate: finalPublishedDate } as Listing;
          })
          .filter(listing => {
            return listing.imageGallery && listing.imageGallery.length > 0;
          });

        setListings(listingsData);
      } finally {
        setLoading(false);
      }
    };

    fetchListings();
  }, [fetchStarted]);

  const getListingById = useCallback(
    (id: string) => listings.find(l => l.id === id),
    [listings]
  );

  return (
    <ListingsContext.Provider value={{ listings, loading, getListingById, ensureLoaded }}>
      {children}
    </ListingsContext.Provider>
  );
};
