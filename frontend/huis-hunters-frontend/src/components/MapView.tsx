import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { Listing } from '../types';
import { loadGoogleMapsAPI } from '../config/maps';
import { Button } from 'react-bootstrap';
import MapListingCard from './MapListingCard';

interface MapViewProps {
  // Optional callback to trigger the global login required prompt
  onRequireLogin?: () => void;
}

const MapView: React.FC<MapViewProps> = ({ onRequireLogin }) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<{ marker: google.maps.Marker; listingId: string }[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [filteredListings, setFilteredListings] = useState<Listing[]>([]);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [mapsLoaded, setMapsLoaded] = useState(false);
  const [mapsError, setMapsError] = useState(false);
  const [selectedListing, setSelectedListing] = useState<Listing | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // AI Search state
  const [searchQuery] = useState(searchParams.get('search') || '');
  const [searchResults, setSearchResults] = useState<Listing[]>([]);
  const [useAISearch, setUseAISearch] = useState(!!searchQuery);
  const hasPerformedInitialSearch = useRef(false);
  const searchInProgressRef = useRef(false);

  // Filter state from URL
  const [priceRange] = useState({
    min: parseInt(searchParams.get('minPrice') || '400000', 10),
    max: parseInt(searchParams.get('maxPrice') || '1250000', 10)
  });
  const [bedrooms] = useState(searchParams.get('bedrooms') || '1+');
  const [floorLevel] = useState(searchParams.get('floor') || 'any');
  const [selectedOutdoorSpaces] = useState<string[]>(searchParams.get('outdoor')?.split(',').filter(Boolean) || []);
  const [minSize] = useState(searchParams.get('minSize') || '');
  const [selectedAreas] = useState<string[]>(searchParams.get('areas')?.split(',').filter(Boolean) || []);
  const [publishedWithin] = useState(searchParams.get('publishedWithin') || 'all');

  // Load Google Maps API
  useEffect(() => {
    const loadMaps = async () => {
      try {
        await loadGoogleMapsAPI();
        setMapsLoaded(true);
      } catch (error) {
        console.error('Failed to load Google Maps API:', error);
        setMapsError(true);
      }
    };

    loadMaps();
  }, []);

  // Fetch all listings
  useEffect(() => {
    const fetchListings = async () => {
      const q = query(
        collection(db, "listings"),
        where("status", "==", "processed"),
        where("available", "==", true)
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
    };

    fetchListings();
  }, []);

  // Perform AI search if search query exists
  const performAISearch = useCallback(async (query: string) => {
    if (!query.trim() || query.trim().length < 3) {
      setSearchResults([]);
      setUseAISearch(false);
      return;
    }

    if (searchInProgressRef.current) {
      return;
    }

    searchInProgressRef.current = true;

    try {
      const searchApiUrl = process.env.REACT_APP_SEARCH_API_URL || 'http://localhost:8080';
      const bedroomFilter = bedrooms === 'any' ? 'any' :
        bedrooms === '1+' ? '1' :
        bedrooms === '2+' ? '2' :
        bedrooms === '3+' ? '3' :
        bedrooms === '4+' ? '4' :
        bedrooms === '5+' ? '5' :
        bedrooms;

      const requestBody = {
        query: query.trim(),
        limit: 100,
        filters: {
          minPrice: priceRange.min,
          maxPrice: priceRange.max,
          bedrooms: bedroomFilter,
          floor: floorLevel,
          outdoor: selectedOutdoorSpaces,
          minSize: minSize,
          areas: selectedAreas,
          publishedWithinDays: publishedWithin !== 'all' ? parseInt(publishedWithin, 10) : null
        },
        search_type: 'filtered'
      };

      const response = await fetch(`${searchApiUrl}/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error('Search request failed');
      }

      const data = await response.json();
      const formattedResults: Listing[] = data.results
        .filter((result: any) => {
          return result.imageGallery && result.imageGallery.length > 0;
        })
        .map((result: any) => {
          let finalPublishedDate;
          if (typeof result.publishedDate === 'string') {
            const date = new Date(result.publishedDate);
            finalPublishedDate = {
              toDate: () => date,
              seconds: Math.floor(date.getTime() / 1000),
              nanoseconds: (date.getTime() % 1000) * 1000000
            };
          } else {
            finalPublishedDate = result.publishedDate;
          }

          return {
            id: result.id,
            address: result.address,
            price: result.price,
            pricePerSquareMeter: result.pricePerSquareMeter,
            bedrooms: result.bedrooms,
            bathrooms: result.bathrooms,
            livingArea: result.livingArea,
            energyLabel: result.energyLabel,
            scrapedAt: result.scrapedAt,
            publishedDate: finalPublishedDate,
            url: result.url,
            imageGallery: result.imageGallery,
            embeddingText: result.embeddingText,
            floor: result.apartmentFloor,
            hasGarden: result.hasGarden,
            hasRooftopTerrace: result.hasRooftopTerrace,
            hasBalcony: result.hasBalcony,
            outdoorSpaceArea: result.outdoorSpaceArea,
            apartmentFloor: result.apartmentFloor,
            status: result.status,
            numberOfStories: result.numberOfStories,
            coordinates: result.coordinates,
            agentName: result.agentName,
            agentUrl: result.agentUrl,
            vveContribution: result.vveContribution,
            cleanedDescription: result.cleanedDescription,
            floorPlans: result.floorPlans,
            googleMapsUrl: result.googleMapsUrl,
            yearBuilt: result.yearBuilt,
            neighborhood: result.neighborhood,
            area: result.area,
            searchScore: result.searchScore
          };
        });

      setSearchResults(formattedResults);
      setUseAISearch(true);
    } catch (error) {
      console.error('AI Search error:', error);
      setSearchResults([]);
      setUseAISearch(false);
    } finally {
      searchInProgressRef.current = false;
    }
  }, [priceRange, bedrooms, floorLevel, selectedOutdoorSpaces, minSize, selectedAreas, publishedWithin]);

  // Trigger search when component loads with a search query
  useEffect(() => {
    if (searchQuery && searchQuery.trim() && !hasPerformedInitialSearch.current) {
      hasPerformedInitialSearch.current = true;
      performAISearch(searchQuery);
    }
  }, [searchQuery, performAISearch]);

  // Filter listings
  useEffect(() => {
    let result = useAISearch ? [...searchResults] : [...listings];

    // Filtering (skip for AI search results as filters are applied server-side)
    if (!useAISearch) {
      result = result.filter(listing => {
        const price = listing.price || 0;
        const passesPrice = price >= priceRange.min && price <= priceRange.max;
        const passesBedrooms = bedrooms === 'any' || (listing.bedrooms || 0) >= parseInt(bedrooms, 10);
        const passesFloorLevel = floorLevel === 'any' ||
          (floorLevel === 'ground' && listing.apartmentFloor === 'Ground') ||
          (floorLevel === 'top' && (listing.apartmentFloor === 'Upper' || listing.apartmentFloor === 'Top floor' || listing.apartmentFloor === 'Upper floor'));
        const passesOutdoorSpace = selectedOutdoorSpaces.length === 0 ||
          selectedOutdoorSpaces.some(space =>
            (space === 'garden' && listing.hasGarden) ||
            (space === 'rooftop' && listing.hasRooftopTerrace) ||
            (space === 'balcony' && listing.hasBalcony)
          );
        const passesMinSize = !minSize || (listing.livingArea && listing.livingArea >= parseInt(minSize, 10));
        const passesArea = selectedAreas.length === 0 || (listing.area && selectedAreas.includes(listing.area));

        let passesPublishedWithin = true;
        if (publishedWithin && publishedWithin !== 'all' && listing.publishedDate && typeof listing.publishedDate.toDate === 'function') {
          const days = parseInt(publishedWithin, 10);
          if (!Number.isNaN(days) && days > 0) {
            const now = new Date();
            const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const cutoff = new Date(startOfToday);
            cutoff.setDate(startOfToday.getDate() - (days - 1));

            const publishedJsDate = listing.publishedDate.toDate();
            passesPublishedWithin = publishedJsDate >= cutoff;
          }
        }

        const hasImages = listing.imageGallery && listing.imageGallery.length > 0;
        const hasCoordinates = listing.coordinates && listing.coordinates.lat && listing.coordinates.lon;

        return passesPrice && passesBedrooms && passesFloorLevel && passesOutdoorSpace && passesMinSize && passesArea && passesPublishedWithin && hasImages && hasCoordinates;
      });
    } else {
      // For AI search, still filter by coordinates
      result = result.filter(listing => {
        return listing.coordinates && listing.coordinates.lat && listing.coordinates.lon;
      });
    }

    setFilteredListings(result);
  }, [listings, searchResults, useAISearch, priceRange, bedrooms, floorLevel, selectedOutdoorSpaces, minSize, selectedAreas, publishedWithin]);

  // Initialize map and create markers
  useEffect(() => {
    if (!mapsLoaded || !mapRef.current || filteredListings.length === 0) return;

    // Initialize Google Map
    const map = new google.maps.Map(mapRef.current, {
      zoom: 12,
      center: { lat: 52.3676, lng: 4.9041 }, // Amsterdam center
      mapTypeId: google.maps.MapTypeId.ROADMAP,
      styles: [
        {
          featureType: 'poi',
          elementType: 'labels',
          stylers: [{ visibility: 'off' }]
        }
      ],
      zoomControl: true,
      zoomControlOptions: {
        position: google.maps.ControlPosition.RIGHT_BOTTOM
      },
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: true
    });

    mapInstanceRef.current = map;

    // Clear existing markers
    markersRef.current.forEach(({ marker }) => marker.setMap(null));
    markersRef.current = [];

    // Create markers with clustering/offset logic
    const markers: { marker: google.maps.Marker; listingId: string }[] = [];
    const markerPositions = new Map<string, { lat: number; lng: number; offset: number }>();

    filteredListings.forEach((listing, index) => {
      if (!listing.coordinates || !listing.coordinates.lat || !listing.coordinates.lon) return;

      const baseLat = listing.coordinates.lat;
      const baseLng = listing.coordinates.lon;

      // Check for nearby markers and apply offset
      let finalLat = baseLat;
      let finalLng = baseLng;
      let offset = 0;
      const offsetDistance = 0.0005; // Small offset in degrees (~50 meters)

      // Check if there's a marker at this position
      const positionsArray = Array.from(markerPositions.values());
      for (let i = 0; i < positionsArray.length; i++) {
        const pos = positionsArray[i];
        const distance = Math.sqrt(
          Math.pow(baseLat - pos.lat, 2) + Math.pow(baseLng - pos.lng, 2)
        );

        if (distance < 0.001) { // Very close markers
          offset = pos.offset + 1;
          // Apply spiral offset
          const angle = offset * 60 * (Math.PI / 180); // 60 degrees per marker
          finalLat = baseLat + offsetDistance * Math.cos(angle);
          finalLng = baseLng + offsetDistance * Math.sin(angle);
          break;
        }
      }

      markerPositions.set(`${baseLat},${baseLng}`, { lat: finalLat, lng: finalLng, offset });

      const marker = new google.maps.Marker({
        position: { lat: finalLat, lng: finalLng },
        map: map,
        title: listing.address,
        icon: {
          url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
            <svg width="32" height="40" viewBox="0 0 32 40" xmlns="http://www.w3.org/2000/svg">
              <path d="M16 0C7.163 0 0 7.163 0 16c0 11.045 16 24 16 24s16-12.955 16-24C32 7.163 24.837 0 16 0z" fill="#4a90e2" stroke="#fff" stroke-width="2"/>
              <circle cx="16" cy="16" r="6" fill="#fff"/>
            </svg>
          `),
          scaledSize: new google.maps.Size(32, 40),
          anchor: new google.maps.Point(16, 40)
        }
      });

      // Click event works on both desktop and mobile
      marker.addListener('click', () => {
        setSelectedListing(listing);
      });

      markers.push({ marker, listingId: listing.id });
    });

    markersRef.current = markers;

    // Fit bounds to show all markers
    if (markers.length > 0) {
      const bounds = new google.maps.LatLngBounds();
      markers.forEach(({ marker }) => {
        const position = marker.getPosition();
        if (position) {
          bounds.extend(position);
        }
      });
      map.fitBounds(bounds);

      // If only one marker, set a reasonable zoom level
      if (markers.length === 1) {
        map.setZoom(15);
      }
    }
  }, [mapsLoaded, filteredListings]);

  // Highlight the selected marker in a different color
  useEffect(() => {
    if (!mapsLoaded) return;

    const selectedId = selectedListing?.id || null;

    markersRef.current.forEach(({ marker, listingId }) => {
      const isSelected = selectedId && listingId === selectedId;

      const fillColor = isSelected ? '#ff6b6b' : '#4a90e2'; // red-ish for selected, blue for others

      marker.setIcon({
        url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
          <svg width="32" height="40" viewBox="0 0 32 40" xmlns="http://www.w3.org/2000/svg">
            <path d="M16 0C7.163 0 0 7.163 0 16c0 11.045 16 24 16 24s16-12.955 16-24C32 7.163 24.837 0 16 0z" fill="${fillColor}" stroke="#fff" stroke-width="2"/>
            <circle cx="16" cy="16" r="6" fill="#fff"/>
          </svg>
        `),
        scaledSize: new google.maps.Size(32, 40),
        anchor: new google.maps.Point(16, 40)
      });
    });
  }, [selectedListing, mapsLoaded]);

  const handleBackToListings = () => {
    const params = new URLSearchParams(searchParams);
    navigate(`/?${params.toString()}`);
  };

  // Track whether the full listing modal (opened from the map card) is open.
  // Closing this modal should NOT clear the selected listing so the card
  // stays visible behind it; the card is only closed via MapListingCard's
  // own close/backdrop handlers (which call onClose).
  const handleModalToggle = (isOpen: boolean) => {
    setIsModalOpen(isOpen);
  };

  if (mapsError) {
    return (
      <div style={{ padding: '5rem 1rem', textAlign: 'center' }}>
        <h4>Google Maps API Key Required</h4>
        <p className="mb-3">
          To use the map view, please set up your Google Maps API key.
        </p>
        <Button variant="primary" onClick={handleBackToListings}>
          Back to Listings
        </Button>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: 'calc(100vh - 56px)', marginTop: '56px' }}>
      {/* Back to Listings Button */}
      <div style={{
        position: 'absolute',
        top: '20px',
        left: '20px',
        zIndex: 1000
      }}>
        <Button
          variant="primary"
          onClick={handleBackToListings}
          style={{
            borderRadius: '8px',
            padding: '0.5rem 1rem',
            fontSize: '0.9rem',
            fontWeight: '600',
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Back to Listings
        </Button>
      </div>

      {/* Map Container */}
      <div
        ref={mapRef}
        style={{
          width: '100%',
          height: '100%'
        }}
      />

      {/* Loading indicator */}
      {!mapsLoaded && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 1000,
          backgroundColor: 'white',
          padding: '2rem',
          borderRadius: '8px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
        }}>
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">Loading map...</span>
          </div>
          <p className="mt-2 mb-0">Loading map...</p>
        </div>
      )}

      {/* Listing count badge */}
      {mapsLoaded && filteredListings.length > 0 && (
        <div style={{
          position: 'absolute',
          top: '20px',
          right: '20px',
          zIndex: 1000,
          backgroundColor: 'white',
          padding: '0.5rem 1rem',
          borderRadius: '8px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
          fontSize: '0.9rem',
          fontWeight: '600'
        }}>
          {filteredListings.length} {filteredListings.length === 1 ? 'property' : 'properties'}
        </div>
      )}

      {/* Selected Listing Card */}
      {selectedListing && (
        <MapListingCard
          listing={selectedListing}
          onClose={() => setSelectedListing(null)}
          onModalToggle={handleModalToggle}
          isAnyModalOpen={isModalOpen}
          onRequireLogin={onRequireLogin}
        />
      )}
    </div>
  );
};

export default MapView;

