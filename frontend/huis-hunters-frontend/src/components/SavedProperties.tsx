import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, doc, deleteDoc, updateDoc, serverTimestamp, Timestamp, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { SavedProperty, PropertyStatus, Listing } from '../types';
import SavedPropertiesList from './SavedPropertiesList';
import { Container, Alert, Button } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';

const SavedProperties: React.FC = () => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [savedProperties, setSavedProperties] = useState<SavedProperty[]>([]);
  const [loading, setLoading] = useState(true);
  const [listingsMap, setListingsMap] = useState<Map<string, Listing>>(new Map());

  useEffect(() => {
    if (!currentUser) {
      setLoading(false);
      return;
    }

    loadSavedProperties();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  const loadSavedProperties = async () => {
    if (!currentUser) return;

    try {
      setLoading(true);
      const q = query(
        collection(db, 'savedProperties'),
        where('userId', '==', currentUser.uid)
      );

      const querySnapshot = await getDocs(q);
      const savedProps: SavedProperty[] = [];
      const listingsToLoad = new Set<string>();

      querySnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        savedProps.push({
          id: docSnap.id,
          userId: data.userId,
          listingId: data.listingId,
          status: data.status,
          addedAt: data.addedAt,
          updatedAt: data.updatedAt,
          viewingScheduledAt: data.viewingScheduledAt,
          note: data.note || undefined
        });
        listingsToLoad.add(data.listingId);
      });

      setSavedProperties(savedProps);

      // Load full listing data for each saved property
      const listings = new Map<string, Listing>();
      for (const listingId of Array.from(listingsToLoad)) {
        try {
          const listingDoc = await getDoc(doc(db, 'listings', listingId));
          if (listingDoc.exists()) {
            const listingData = listingDoc.data();
            // Transform publishedDate if needed
            let finalPublishedDate;
            if (typeof listingData.publishDate === 'string') {
              const date = new Date(listingData.publishDate);
              finalPublishedDate = {
                toDate: () => date,
                seconds: Math.floor(date.getTime() / 1000),
                nanoseconds: (date.getTime() % 1000) * 1000000
              };
            } else {
              finalPublishedDate = listingData.publishDate;
            }
            
            listings.set(listingId, {
              id: listingDoc.id,
              ...listingData,
              publishedDate: finalPublishedDate,
              available: listingData.available ?? true
            } as Listing);
          }
        } catch (error) {
          console.error(`Error loading listing ${listingId}:`, error);
        }
      }

      setListingsMap(listings);
    } catch (error) {
      console.error('Error loading saved properties:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUnsave = async (propertyId: string) => {
    try {
      await deleteDoc(doc(db, 'savedProperties', propertyId));
      setSavedProperties(savedProperties.filter(p => p.id !== propertyId));
    } catch (error) {
      console.error('Error unsaving property:', error);
      alert('Failed to unsave property');
    }
  };

  const handleStatusChange = async (propertyId: string, newStatus: PropertyStatus, viewingDate?: Date) => {
    try {
      const updateData: any = {
        status: newStatus,
        updatedAt: serverTimestamp()
      };

      if (newStatus === 'viewing scheduled' && viewingDate) {
        updateData.viewingScheduledAt = Timestamp.fromDate(viewingDate);
      } else if (newStatus !== 'viewing scheduled') {
        updateData.viewingScheduledAt = null;
      }

      await updateDoc(doc(db, 'savedProperties', propertyId), updateData);
      
      setSavedProperties(savedProperties.map(p => 
        p.id === propertyId 
          ? { ...p, status: newStatus, viewingScheduledAt: viewingDate ? {
              seconds: Math.floor(viewingDate.getTime() / 1000),
              nanoseconds: (viewingDate.getTime() % 1000) * 1000000,
              toDate: () => viewingDate
            } : undefined }
          : p
      ));
    } catch (error) {
      console.error('Error updating status:', error);
      alert('Failed to update status');
    }
  };

  const handleNoteChange = async (propertyId: string, note: string) => {
    try {
      const updateData: any = {
        note: note || null,
        updatedAt: serverTimestamp()
      };

      await updateDoc(doc(db, 'savedProperties', propertyId), updateData);
      
      setSavedProperties(savedProperties.map(p => 
        p.id === propertyId ? { ...p, note: note || undefined } : p
      ));
    } catch (error) {
      console.error('Error updating note:', error);
      alert('Failed to update note');
    }
  };

  if (!currentUser) {
    return (
      <Container className="mt-5" style={{ paddingTop: '60px' }}>
        <Alert variant="warning">Please log in to view your saved properties.</Alert>
      </Container>
    );
  }

  // Enrich saved properties with listing data
  const enrichedProperties = savedProperties.map(sp => ({
    ...sp,
    listing: listingsMap.get(sp.listingId)
  }));

  return (
    <Container className="mt-5" style={{ paddingTop: '60px' }}>
      <h2 className="mb-3">Saved Properties</h2>
      <div className="mb-3">
        <Button
          variant="link"
          onClick={() => navigate('/')}
          style={{
            fontSize: '0.9rem',
            color: '#6c757d',
            textDecoration: 'none',
            padding: 0,
            fontWeight: 'normal'
          }}
          className="p-0"
        >
          ← Back to all listings
        </Button>
      </div>
      <SavedPropertiesList
        savedProperties={enrichedProperties}
        onUnsave={handleUnsave}
        onStatusChange={handleStatusChange}
        onNoteChange={handleNoteChange}
        loading={loading}
      />
    </Container>
  );
};

export default SavedProperties;

