import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { Listing } from '../types';
import { loadGoogleMapsAPI } from '../config/maps';
import { Button, Form, FormGroup, Row, Col, Dropdown } from 'react-bootstrap';
import Slider from 'rc-slider';
import 'rc-slider/assets/index.css';
import MapListingCard from './MapListingCard';
import { parseKMLNeighborhoods } from '../utils/neighborhoodParser';

interface MapViewProps {
  // Optional callback to trigger the global login required prompt
  onRequireLogin?: () => void;
}

const MapView: React.FC<MapViewProps> = ({ onRequireLogin }) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<{ marker: google.maps.Marker; listingId: string }[]>([]);
  const lastMarkerClickTimeRef = useRef<number>(0);
  const pendingListingRef = useRef<Listing | null>(null);
  const isUpdatingFromURLRef = useRef(false);
  const [listings, setListings] = useState<Listing[]>([]);
  const [filteredListings, setFilteredListings] = useState<Listing[]>([]);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [mapsLoaded, setMapsLoaded] = useState(false);
  const [mapsError, setMapsError] = useState(false);
  const [selectedListing, setSelectedListing] = useState<Listing | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  // AI Search state
  const [searchQuery] = useState(searchParams.get('search') || '');
  const [searchResults, setSearchResults] = useState<Listing[]>([]);
  const [useAISearch, setUseAISearch] = useState(!!searchQuery);
  const hasPerformedInitialSearch = useRef(false);
  const searchInProgressRef = useRef(false);

  // Filter state from URL - make reactive to URL changes
  const [priceRange, setPriceRange] = useState({
    min: parseInt(searchParams.get('minPrice') || '400000', 10),
    max: parseInt(searchParams.get('maxPrice') || '1250000', 10)
  });
  const [bedrooms, setBedrooms] = useState(searchParams.get('bedrooms') || '1+');
  const [floorLevel, setFloorLevel] = useState(searchParams.get('floor') || 'any');
  const [selectedOutdoorSpaces, setSelectedOutdoorSpaces] = useState<string[]>(searchParams.get('outdoor')?.split(',').filter(Boolean) || []);
  const [minSize, setMinSize] = useState(searchParams.get('minSize') || '');
  const [selectedAreas, setSelectedAreas] = useState<string[]>(searchParams.get('areas')?.split(',').filter(Boolean) || []);
  const [publishedWithin, setPublishedWithin] = useState(searchParams.get('publishedWithin') || 'all');
  
  // Neighborhoods list
  const [allNeighborhoods, setAllNeighborhoods] = useState<string[]>([]);
  
  // Refs to track current filter values for comparison
  const priceRangeRef = useRef(priceRange);
  const bedroomsRef = useRef(bedrooms);
  const floorLevelRef = useRef(floorLevel);
  const selectedOutdoorSpacesRef = useRef(selectedOutdoorSpaces);
  const minSizeRef = useRef(minSize);
  const selectedAreasRef = useRef(selectedAreas);
  const publishedWithinRef = useRef(publishedWithin);
  
  // Update refs when state changes
  useEffect(() => {
    priceRangeRef.current = priceRange;
    bedroomsRef.current = bedrooms;
    floorLevelRef.current = floorLevel;
    selectedOutdoorSpacesRef.current = selectedOutdoorSpaces;
    minSizeRef.current = minSize;
    selectedAreasRef.current = selectedAreas;
    publishedWithinRef.current = publishedWithin;
  }, [priceRange, bedrooms, floorLevel, selectedOutdoorSpaces, minSize, selectedAreas, publishedWithin]);

  // Load neighborhoods
  useEffect(() => {
    const loadNeighborhoods = async () => {
      try {
        const response = await fetch('/neighborhoods.kml');
        const kmlContent = await response.text();
        const parsedNeighborhoods = parseKMLNeighborhoods(kmlContent);
        const neighborhoodNames = parsedNeighborhoods.map(n => n.name).sort();
        setAllNeighborhoods(neighborhoodNames);
      } catch (error) {
        console.error('Failed to load neighborhoods:', error);
      }
    };
    loadNeighborhoods();
  }, []);

  // Update filters when URL params change (but not if we're updating from user input)
  useEffect(() => {
    if (isUpdatingFromURLRef.current) {
      isUpdatingFromURLRef.current = false;
      return;
    }
    
    const urlPriceMin = parseInt(searchParams.get('minPrice') || '400000', 10);
    const urlPriceMax = parseInt(searchParams.get('maxPrice') || '1250000', 10);
    const urlBedrooms = searchParams.get('bedrooms') || '1+';
    const urlFloorLevel = searchParams.get('floor') || 'any';
    const urlOutdoor = searchParams.get('outdoor')?.split(',').filter(Boolean) || [];
    const urlMinSize = searchParams.get('minSize') || '';
    const urlAreas = searchParams.get('areas')?.split(',').filter(Boolean) || [];
    const urlPublishedWithin = searchParams.get('publishedWithin') || 'all';
    
    // Only update if values actually changed (compare with current state via refs)
    if (priceRangeRef.current.min !== urlPriceMin || priceRangeRef.current.max !== urlPriceMax) {
      setPriceRange({ min: urlPriceMin, max: urlPriceMax });
    }
    if (bedroomsRef.current !== urlBedrooms) {
      setBedrooms(urlBedrooms);
    }
    if (floorLevelRef.current !== urlFloorLevel) {
      setFloorLevel(urlFloorLevel);
    }
    if (JSON.stringify([...selectedOutdoorSpacesRef.current].sort()) !== JSON.stringify([...urlOutdoor].sort())) {
      setSelectedOutdoorSpaces(urlOutdoor);
    }
    if (minSizeRef.current !== urlMinSize) {
      setMinSize(urlMinSize);
    }
    if (JSON.stringify([...selectedAreasRef.current].sort()) !== JSON.stringify([...urlAreas].sort())) {
      setSelectedAreas(urlAreas);
    }
    if (publishedWithinRef.current !== urlPublishedWithin) {
      setPublishedWithin(urlPublishedWithin);
    }
  }, [searchParams]); // Only depend on searchParams, not on filter states


  // Function to update URL with current filters
  const updateURLWithFilters = useCallback(() => {
    const params = new URLSearchParams(searchParams);
    
    if (priceRange.min !== 400000) {
      params.set('minPrice', priceRange.min.toString());
    } else {
      params.delete('minPrice');
    }
    
    if (priceRange.max !== 1250000) {
      params.set('maxPrice', priceRange.max.toString());
    } else {
      params.delete('maxPrice');
    }
    
    if (bedrooms !== '1+') {
      params.set('bedrooms', bedrooms);
    } else {
      params.delete('bedrooms');
    }
    
    if (floorLevel !== 'any') {
      params.set('floor', floorLevel);
    } else {
      params.delete('floor');
    }
    
    if (selectedOutdoorSpaces.length > 0) {
      params.set('outdoor', selectedOutdoorSpaces.join(','));
    } else {
      params.delete('outdoor');
    }
    
    if (minSize) {
      params.set('minSize', minSize);
    } else {
      params.delete('minSize');
    }
    
    if (selectedAreas.length > 0) {
      params.set('areas', selectedAreas.join(','));
    } else {
      params.delete('areas');
    }
    
    if (publishedWithin !== 'all') {
      params.set('publishedWithin', publishedWithin);
    } else {
      params.delete('publishedWithin');
    }
    
    navigate(`/map?${params.toString()}`, { replace: true });
  }, [priceRange, bedrooms, floorLevel, selectedOutdoorSpaces, minSize, selectedAreas, publishedWithin, searchParams, navigate]);

  // Update URL when filters change (debounced)
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      isUpdatingFromURLRef.current = true; // Mark that we're updating from user input
      updateURLWithFilters();
      // Reset flag after navigation completes (give it time for URL to update)
      setTimeout(() => {
        isUpdatingFromURLRef.current = false;
      }, 100);
    }, 500); // Debounce 500ms

    return () => clearTimeout(timeoutId);
  }, [priceRange, bedrooms, floorLevel, selectedOutdoorSpaces, minSize, selectedAreas, publishedWithin, updateURLWithFilters]);

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
      marker.addListener('click', (e: google.maps.MapMouseEvent) => {
        // Track marker click time to prevent backdrop from closing
        lastMarkerClickTimeRef.current = Date.now();
        // Store the pending listing to open
        pendingListingRef.current = listing;
        // Set the listing immediately (synchronously) so the card opens right away
        setSelectedListing(listing);
        // Clear pending after a short delay
        setTimeout(() => {
          pendingListingRef.current = null;
        }, 300);
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

  // Close the listing card when user starts panning the map
  useEffect(() => {
    if (!selectedListing || !mapInstanceRef.current) return;

    const map = mapInstanceRef.current;
    let touchStartX = 0;
    let touchStartY = 0;
    let isDragging = false;

    // Detect map panning (dragging) - close card when user starts dragging
    const dragStartListener = map.addListener('dragstart', () => {
      setSelectedListing(null);
      isDragging = true;
    });

    // Also detect touch-based panning on mobile
    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        isDragging = false;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 1 && !isDragging) {
        const touch = e.touches[0];
        const deltaX = Math.abs(touch.clientX - touchStartX);
        const deltaY = Math.abs(touch.clientY - touchStartY);
        
        // If user has moved more than 10px, they're panning
        if (deltaX > 10 || deltaY > 10) {
          setSelectedListing(null);
          isDragging = true;
        }
      }
    };

    const mapDiv = mapRef.current;
    if (mapDiv) {
      mapDiv.addEventListener('touchstart', handleTouchStart, { passive: true });
      mapDiv.addEventListener('touchmove', handleTouchMove, { passive: true });
    }

    return () => {
      if (dragStartListener) {
        google.maps.event.removeListener(dragStartListener);
      }
      if (mapDiv) {
        mapDiv.removeEventListener('touchstart', handleTouchStart);
        mapDiv.removeEventListener('touchmove', handleTouchMove);
      }
    };
  }, [selectedListing]);

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

      {/* Listing count badge and Filters button */}
      {mapsLoaded && (
        <div style={{
          position: 'absolute',
          top: '20px',
          right: '20px',
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: '0.75rem'
        }}>
          {filteredListings.length > 0 && (
            <div style={{
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
          <Button 
            onClick={() => setShowFilters(!showFilters)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.5rem 1rem',
              borderRadius: '8px',
              fontSize: '0.9rem',
              fontWeight: '600',
              border: 'none',
              color: '#495057',
              backgroundColor: '#ffffff',
              boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
              whiteSpace: 'nowrap',
              flexShrink: 0
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', whiteSpace: 'nowrap' }}>
              🔍 Filters
              {(() => {
                const activeCount = [
                  bedrooms !== '1+',
                  priceRange.min !== 400000 || priceRange.max !== 1250000,
                  floorLevel !== 'any',
                  selectedOutdoorSpaces.length > 0,
                  minSize !== '',
                  selectedAreas.length > 0,
                  publishedWithin !== 'all'
                ].filter(Boolean).length;
                return activeCount > 0 && (
                  <span style={{
                    backgroundColor: '#4a90e2',
                    color: 'white',
                    borderRadius: '10px',
                    padding: '0.15rem 0.35rem',
                    fontSize: '0.7rem',
                    fontWeight: '700',
                    minWidth: '1.1rem',
                    textAlign: 'center',
                    flexShrink: 0
                  }}>
                    {activeCount}
                  </span>
                );
              })()}
            </span>
          </Button>
        </div>
      )}

      {/* Filter Overlay Backdrop */}
      {showFilters && (
        <div
          onClick={() => {
            setShowFilters(false);
            setOpenDropdown(null);
          }}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 1000,
            backgroundColor: 'transparent'
          }}
        />
      )}

      {/* Filter Overlay */}
      {showFilters && (
        <div 
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            top: filteredListings.length > 0 ? '120px' : '80px',
            right: '20px',
            zIndex: 1001,
            backgroundColor: 'white',
            padding: '0.75rem',
            borderRadius: '8px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
            maxHeight: 'calc(100vh - 140px)',
            overflowY: 'auto',
            minWidth: '280px',
            maxWidth: '320px'
          }}>
          <div className="d-flex justify-content-between align-items-center mb-2">
            <h6 className="text-muted fw-semibold mb-0" style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Filters
            </h6>
            <Button
              variant="outline-secondary"
              size="sm"
              onClick={() => {
                setShowFilters(false);
                setOpenDropdown(null);
              }}
              style={{
                borderRadius: '6px',
                padding: '0.25rem 0.5rem',
                fontSize: '0.75rem',
                fontWeight: '600',
                border: 'none',
                backgroundColor: 'transparent'
              }}
            >
              <span style={{ fontSize: '1.2rem', lineHeight: 1 }}>×</span>
            </Button>
          </div>
          <Form>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {/* Price Range */}
              <FormGroup>
                <Form.Label className="fw-medium mb-1" style={{ fontSize: '0.75rem' }}>Price Range</Form.Label>
                  <div style={{ padding: '0 4px' }}>
                    <Slider
                      range
                      min={400000}
                      max={1250000}
                      step={25000}
                      value={[priceRange.min, priceRange.max]}
                      onChange={(values: number | number[]) => {
                        if (Array.isArray(values) && values.length === 2) {
                          setPriceRange({ min: values[0], max: values[1] });
                        }
                      }}
                      allowCross={false}
                    />
                  </div>
                  <div className="d-flex justify-content-between mt-1">
                    <small className="text-muted" style={{ fontSize: '0.7rem' }}>
                      {priceRange.min >= 1000000 
                        ? `€${(priceRange.min/1000000).toFixed(3)}M` 
                        : `€${(priceRange.min/1000).toFixed(0)}k`
                      }
                    </small>
                    <small className="text-muted" style={{ fontSize: '0.7rem' }}>
                      {priceRange.max >= 1000000 
                        ? `€${(priceRange.max/1000000).toFixed(3)}M` 
                        : `€${(priceRange.max/1000).toFixed(0)}k`
                      }
                    </small>
                  </div>
                </FormGroup>

              {/* Bedrooms */}
              <FormGroup>
                <Form.Label className="fw-medium mb-1" style={{ fontSize: '0.75rem' }}>Beds</Form.Label>
                  <Dropdown
                    show={openDropdown === 'bedrooms'}
                    onToggle={(isOpen) => setOpenDropdown(isOpen ? 'bedrooms' : null)}
                  >
                    <Dropdown.Toggle 
                      variant="outline-secondary" 
                      className="custom-dropdown-toggle"
                      style={{ 
                        width: '100%',
                        borderRadius: '6px',
                        border: '1px solid #dee2e6',
                        fontSize: '0.75rem',
                        textAlign: 'left',
                        backgroundColor: 'white',
                        color: '#495057',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3e%3cpath fill='none' stroke='%23343a40' stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='m1 6 7 7 7-7'/%3e%3c/svg%3e")`,
                        backgroundRepeat: 'no-repeat',
                        backgroundPosition: 'right 0.5rem center',
                        backgroundSize: '12px 8px',
                        paddingRight: '1.5rem',
                        padding: '0.35rem 0.5rem'
                      }}
                    >
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {bedrooms === 'any' ? 'Any' : bedrooms}
                      </span>
                    </Dropdown.Toggle>
                    <Dropdown.Menu style={{ width: '100%' }}>
                      <Dropdown.Item onClick={() => { setBedrooms('any'); setOpenDropdown(null); }} active={bedrooms === 'any'}>Any</Dropdown.Item>
                      <Dropdown.Item onClick={() => { setBedrooms('1+'); setOpenDropdown(null); }} active={bedrooms === '1+'}>1+</Dropdown.Item>
                      <Dropdown.Item onClick={() => { setBedrooms('2+'); setOpenDropdown(null); }} active={bedrooms === '2+'}>2+</Dropdown.Item>
                      <Dropdown.Item onClick={() => { setBedrooms('3+'); setOpenDropdown(null); }} active={bedrooms === '3+'}>3+</Dropdown.Item>
                      <Dropdown.Item onClick={() => { setBedrooms('4+'); setOpenDropdown(null); }} active={bedrooms === '4+'}>4+</Dropdown.Item>
                    </Dropdown.Menu>
                  </Dropdown>
                </FormGroup>

              {/* Min Size */}
              <FormGroup>
                <Form.Label className="fw-medium mb-1" style={{ fontSize: '0.75rem' }}>Min size</Form.Label>
                  <Form.Control 
                    type="number"
                    placeholder="Any m²"
                    value={minSize}
                    onChange={e => setMinSize(e.target.value)}
                  style={{ 
                    borderRadius: '6px',
                    border: '1px solid #dee2e6',
                    fontSize: '0.75rem',
                    padding: '0.35rem 0.5rem'
                  }}
                  />
                </FormGroup>

              {/* Outdoor Space */}
              <FormGroup>
                <Form.Label className="fw-medium mb-1" style={{ fontSize: '0.75rem' }}>Outdoor</Form.Label>
                  <Dropdown
                    show={openDropdown === 'outdoor'}
                    onToggle={(isOpen) => setOpenDropdown(isOpen ? 'outdoor' : null)}
                  >
                    <Dropdown.Toggle 
                      variant="outline-secondary" 
                      className="custom-dropdown-toggle"
                      style={{ 
                        width: '100%',
                        borderRadius: '6px',
                        border: '1px solid #dee2e6',
                        fontSize: '0.75rem',
                        textAlign: 'left',
                        backgroundColor: 'white',
                        color: '#495057',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3e%3cpath fill='none' stroke='%23343a40' stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='m1 6 7 7 7-7'/%3e%3c/svg%3e")`,
                        backgroundRepeat: 'no-repeat',
                        backgroundPosition: 'right 0.5rem center',
                        backgroundSize: '12px 8px',
                        paddingRight: '1.5rem',
                        padding: '0.35rem 0.5rem'
                      }}
                    >
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {selectedOutdoorSpaces.length === 0 
                          ? 'Any' 
                          : selectedOutdoorSpaces.length === 1 
                            ? (selectedOutdoorSpaces[0] === 'garden' ? 'Garden' : selectedOutdoorSpaces[0] === 'rooftop' ? 'Rooftop' : 'Balcony')
                            : `Multiple (${selectedOutdoorSpaces.length})`
                        }
                      </span>
                    </Dropdown.Toggle>
                    <Dropdown.Menu style={{ width: '100%', maxHeight: '300px', overflowY: 'auto' }}>
                      {['garden', 'rooftop', 'balcony'].map(space => {
                        const displayName = space === 'garden' ? 'Garden' : space === 'rooftop' ? 'Rooftop' : 'Balcony';
                        return (
                          <Dropdown.ItemText key={space}>
                            <Form.Check
                              type="checkbox"
                              id={`map-outdoor-${space}`}
                              label={displayName}
                              checked={selectedOutdoorSpaces.includes(space)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedOutdoorSpaces([...selectedOutdoorSpaces, space]);
                                } else {
                                  setSelectedOutdoorSpaces(selectedOutdoorSpaces.filter(s => s !== space));
                                }
                              }}
                            />
                          </Dropdown.ItemText>
                        );
                      })}
                      {selectedOutdoorSpaces.length > 0 && (
                        <>
                          <Dropdown.Divider />
                          <Dropdown.Item onClick={() => { setSelectedOutdoorSpaces([]); setOpenDropdown(null); }} className="text-danger">
                            Clear All
                          </Dropdown.Item>
                        </>
                      )}
                    </Dropdown.Menu>
                  </Dropdown>
                </FormGroup>

              {/* Floor Level */}
              <FormGroup>
                <Form.Label className="fw-medium mb-1" style={{ fontSize: '0.75rem' }}>Floor</Form.Label>
                  <Dropdown
                    show={openDropdown === 'floor'}
                    onToggle={(isOpen) => setOpenDropdown(isOpen ? 'floor' : null)}
                  >
                    <Dropdown.Toggle 
                      variant="outline-secondary" 
                      className="custom-dropdown-toggle"
                      style={{ 
                        width: '100%',
                        borderRadius: '6px',
                        border: '1px solid #dee2e6',
                        fontSize: '0.75rem',
                        textAlign: 'left',
                        backgroundColor: 'white',
                        color: '#495057',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3e%3cpath fill='none' stroke='%23343a40' stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='m1 6 7 7 7-7'/%3e%3c/svg%3e")`,
                        backgroundRepeat: 'no-repeat',
                        backgroundPosition: 'right 0.5rem center',
                        backgroundSize: '12px 8px',
                        paddingRight: '1.5rem',
                        padding: '0.35rem 0.5rem'
                      }}
                    >
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {floorLevel === 'any' ? 'Any' : floorLevel === 'top' ? 'Upper' : 'Ground'}
                      </span>
                    </Dropdown.Toggle>
                    <Dropdown.Menu style={{ width: '100%' }}>
                      <Dropdown.Item onClick={() => { setFloorLevel('any'); setOpenDropdown(null); }} active={floorLevel === 'any'}>Any</Dropdown.Item>
                      <Dropdown.Item onClick={() => { setFloorLevel('top'); setOpenDropdown(null); }} active={floorLevel === 'top'}>Upper</Dropdown.Item>
                      <Dropdown.Item onClick={() => { setFloorLevel('ground'); setOpenDropdown(null); }} active={floorLevel === 'ground'}>Ground</Dropdown.Item>
                    </Dropdown.Menu>
                  </Dropdown>
                </FormGroup>

              {/* Area */}
              <FormGroup>
                <Form.Label className="fw-medium mb-1" style={{ fontSize: '0.75rem' }}>Neighborhood</Form.Label>
                  <Dropdown
                    show={openDropdown === 'neighborhood'}
                    onToggle={(isOpen) => setOpenDropdown(isOpen ? 'neighborhood' : null)}
                  >
                    <Dropdown.Toggle 
                      variant="outline-secondary" 
                      className="custom-dropdown-toggle"
                      style={{ 
                        width: '100%',
                        borderRadius: '6px',
                        border: '1px solid #dee2e6',
                        fontSize: '0.75rem',
                        textAlign: 'left',
                        backgroundColor: 'white',
                        color: '#495057',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3e%3cpath fill='none' stroke='%23343a40' stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='m1 6 7 7 7-7'/%3e%3c/svg%3e")`,
                        backgroundRepeat: 'no-repeat',
                        backgroundPosition: 'right 0.5rem center',
                        backgroundSize: '12px 8px',
                        paddingRight: '1.5rem',
                        padding: '0.35rem 0.5rem'
                      }}
                    >
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {selectedAreas.length === 0 
                          ? 'Any' 
                          : selectedAreas.length === 1 
                            ? (selectedAreas[0].length > 20 ? selectedAreas[0].substring(0, 17) + '...' : selectedAreas[0])
                            : `Multiple (${selectedAreas.length})`
                        }
                      </span>
                    </Dropdown.Toggle>
                    <Dropdown.Menu style={{ width: '100%', maxHeight: '300px', overflowY: 'auto' }}>
                      {allNeighborhoods.map(area => (
                        <Dropdown.ItemText key={area}>
                          <Form.Check
                            type="checkbox"
                            id={`map-neighborhood-${area}`}
                            label={area}
                            checked={selectedAreas.includes(area)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedAreas([...selectedAreas, area]);
                              } else {
                                setSelectedAreas(selectedAreas.filter(a => a !== area));
                              }
                            }}
                          />
                        </Dropdown.ItemText>
                      ))}
                      {selectedAreas.length > 0 && (
                        <>
                          <Dropdown.Divider />
                          <Dropdown.Item onClick={() => { setSelectedAreas([]); setOpenDropdown(null); }} className="text-danger">
                            Clear All
                          </Dropdown.Item>
                        </>
                      )}
                    </Dropdown.Menu>
                  </Dropdown>
                </FormGroup>

              {/* Published within */}
              <FormGroup>
                <Form.Label className="fw-medium mb-1" style={{ fontSize: '0.75rem' }}>Published in last</Form.Label>
                  <Dropdown
                    show={openDropdown === 'published'}
                    onToggle={(isOpen) => setOpenDropdown(isOpen ? 'published' : null)}
                  >
                    <Dropdown.Toggle
                      variant="outline-secondary"
                      className="custom-dropdown-toggle"
                      style={{
                        width: '100%',
                        borderRadius: '8px',
                        border: '1px solid #dee2e6',
                        fontSize: '0.8rem',
                        textAlign: 'left',
                        backgroundColor: 'white',
                        color: '#495057',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3e%3cpath fill='none' stroke='%23343a40' stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='m1 6 7 7 7-7'/%3e%3c/svg%3e")`,
                        backgroundRepeat: 'no-repeat',
                        backgroundPosition: 'right 0.5rem center',
                        backgroundSize: '12px 8px',
                        paddingRight: '1.5rem'
                      }}
                    >
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {publishedWithin === 'all'
                          ? 'Any time'
                          : publishedWithin === '1'
                            ? '1 day'
                            : publishedWithin === '3'
                              ? '3 days'
                              : '7 days'}
                      </span>
                    </Dropdown.Toggle>
                    <Dropdown.Menu style={{ width: '100%' }}>
                      <Dropdown.Item onClick={() => { setPublishedWithin('all'); setOpenDropdown(null); }} active={publishedWithin === 'all'}>
                        Any time
                      </Dropdown.Item>
                      <Dropdown.Item onClick={() => { setPublishedWithin('1'); setOpenDropdown(null); }} active={publishedWithin === '1'}>
                        Last 1 day
                      </Dropdown.Item>
                      <Dropdown.Item onClick={() => { setPublishedWithin('3'); setOpenDropdown(null); }} active={publishedWithin === '3'}>
                        Last 3 days
                      </Dropdown.Item>
                      <Dropdown.Item onClick={() => { setPublishedWithin('7'); setOpenDropdown(null); }} active={publishedWithin === '7'}>
                        Last 7 days
                      </Dropdown.Item>
                    </Dropdown.Menu>
                  </Dropdown>
                </FormGroup>

              {/* Close button */}
              <FormGroup>
                <Button 
                  variant="outline-secondary" 
                  size="sm" 
                  onClick={() => {
                    setShowFilters(false);
                    setOpenDropdown(null);
                  }}
                  style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem', width: '100%', borderRadius: '8px', marginTop: '0.25rem' }}
                >
                  Close
                </Button>
              </FormGroup>
            </div>
          </Form>
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
          wasMarkerJustClicked={() => {
            const timeSinceClick = Date.now() - lastMarkerClickTimeRef.current;
            return timeSinceClick < 500 || pendingListingRef.current !== null;
          }}
        />
      )}
    </div>
  );
};

export default MapView;

