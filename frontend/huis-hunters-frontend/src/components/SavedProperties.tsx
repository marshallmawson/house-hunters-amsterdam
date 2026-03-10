import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, doc, deleteDoc, updateDoc, serverTimestamp, Timestamp, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { SavedProperty, PropertyStatus, Listing } from '../types';
import SavedPropertiesList from './SavedPropertiesList';
import { Container, Alert, Button, Card } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import { useUserPreferences } from '../hooks/useUserPreferences';

const SavedProperties: React.FC = () => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const { preferences, loading: preferencesLoading } = useUserPreferences();
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
        let status = data.status;
        
        // Auto-update status to "viewed" if viewing date is in the past
        if (data.viewingScheduledAt && status === 'viewing scheduled') {
          const viewingDate = data.viewingScheduledAt.toDate ? data.viewingScheduledAt.toDate() : new Date(data.viewingScheduledAt.seconds * 1000);
          const now = new Date();
          if (viewingDate < now) {
            status = 'viewed';
            // Update in database asynchronously (don't wait)
            updateDoc(doc(db, 'savedProperties', docSnap.id), {
              status: 'viewed',
              updatedAt: serverTimestamp()
            }).catch(err => console.error('Error auto-updating status to viewed:', err));
          }
        }
        
        savedProps.push({
          id: docSnap.id,
          userId: data.userId,
          listingId: data.listingId,
          status: status,
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

      // Only update viewingScheduledAt if setting a new viewing date
      // Otherwise, preserve the existing viewingScheduledAt
      if (newStatus === 'viewing scheduled' && viewingDate) {
        updateData.viewingScheduledAt = Timestamp.fromDate(viewingDate);
      }
      // Don't clear viewingScheduledAt when changing status - preserve it

      await updateDoc(doc(db, 'savedProperties', propertyId), updateData);
      
      // Update local state
      const updatedProperty = savedProperties.find(p => p.id === propertyId);
      const newViewingScheduledAt = viewingDate 
        ? {
            seconds: Math.floor(viewingDate.getTime() / 1000),
            nanoseconds: (viewingDate.getTime() % 1000) * 1000000,
            toDate: () => viewingDate
          }
        : updatedProperty?.viewingScheduledAt; // Preserve existing if not setting new one
      
      setSavedProperties(savedProperties.map(p => 
        p.id === propertyId 
          ? { ...p, status: newStatus, viewingScheduledAt: newViewingScheduledAt }
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

  // Format preferences for display
  const formatPreferences = () => {
    if (!preferences || preferencesLoading) return null;

    const parts: string[] = [];

    // Price range
    if (preferences.priceRange) {
      const minPrice = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(preferences.priceRange.min);
      const maxPrice = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(preferences.priceRange.max);
      parts.push(`Price: ${minPrice} - ${maxPrice}`);
    }

    // Bedrooms
    if (preferences.bedrooms && preferences.bedrooms !== 'any') {
      parts.push(`Bedrooms: ${preferences.bedrooms}`);
    }

    // Floor level
    if (preferences.floorLevel && preferences.floorLevel !== 'any') {
      const floorLabels: { [key: string]: string } = {
        'ground': 'Ground floor',
        'first': 'First floor',
        'second': 'Second floor',
        'third': 'Third floor',
        'fourth': 'Fourth floor',
        'fifth': 'Fifth floor',
        'top': 'Top floor'
      };
      parts.push(`Floor: ${floorLabels[preferences.floorLevel] || preferences.floorLevel}`);
    }

    // Outdoor spaces
    if (preferences.selectedOutdoorSpaces && preferences.selectedOutdoorSpaces.length > 0) {
      const outdoorLabels: { [key: string]: string } = {
        'garden': 'Garden',
        'balcony': 'Balcony',
        'rooftop': 'Rooftop terrace'
      };
      const formatted = preferences.selectedOutdoorSpaces.map(space => 
        outdoorLabels[space] || space.charAt(0).toUpperCase() + space.slice(1)
      ).join(', ');
      parts.push(`Outdoor: ${formatted}`);
    }

    // Minimum size
    if (preferences.minSize) {
      parts.push(`Min size: ${preferences.minSize} m²`);
    }

    // Published within
    if (preferences.publishedWithin && preferences.publishedWithin !== 'all') {
      const publishedLabels: { [key: string]: string } = {
        '1day': '1 day ago',
        '3days': '3 days ago',
        '1week': '7 days ago',
        '2weeks': '14 days ago',
        '1month': '30 days ago'
      };
      // Check if it's a numeric value (like "7") and format it
      const daysMatch = preferences.publishedWithin.match(/^(\d+)$/);
      if (daysMatch) {
        const days = parseInt(daysMatch[1], 10);
        parts.push(`Published: ${days} day${days !== 1 ? 's' : ''} ago`);
      } else {
        parts.push(`Published: ${publishedLabels[preferences.publishedWithin] || preferences.publishedWithin}`);
      }
    }

    // Selected areas (last)
    if (preferences.selectedAreas && preferences.selectedAreas.length > 0) {
      const areasText = preferences.selectedAreas.join(', ');
      parts.push(`Areas: ${areasText}`);
    }

    return parts.length > 0 ? parts.join(' • ') : 'No preferences set';
  };

  return (
    <Container fluid="xl" className="mt-5" style={{ paddingTop: '60px', paddingLeft: window.innerWidth < 768 ? '0.5rem' : undefined, paddingRight: window.innerWidth < 768 ? '0.5rem' : undefined }}>
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
      
      {/* Search Preferences Summary */}
      {currentUser && !preferencesLoading && (
        <Card 
          style={{ 
            marginTop: '3rem', 
            border: 'none', 
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            backgroundColor: '#f8f9fa'
          }}
        >
          <Card.Body style={{ padding: '1.5rem' }}>
            <h5 style={{ 
              fontFamily: 'system-ui, -apple-system, sans-serif',
              fontWeight: '600',
              fontSize: '1.1rem',
              marginBottom: '1rem',
              color: '#212529'
            }}>
              Your Search Preferences
            </h5>
            <p style={{ 
              fontFamily: 'system-ui, -apple-system, sans-serif',
              fontSize: '0.95rem',
              color: '#495057',
              marginBottom: '1rem',
              lineHeight: '1.6'
            }}>
              {formatPreferences()}
            </p>
            <Button
              variant="primary"
              onClick={() => navigate('/')}
              style={{ 
                fontFamily: 'system-ui, -apple-system, sans-serif',
                fontWeight: '500',
                padding: '0.5rem 1.5rem',
                borderRadius: '6px'
              }}
            >
              Update Preferences
            </Button>
          </Card.Body>
        </Card>
      )}
    </Container>
  );
};

export default SavedProperties;

