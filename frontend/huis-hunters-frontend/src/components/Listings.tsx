import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { collection, getDocs, query, where, limit, QueryDocumentSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { useListingsContext } from '../contexts/ListingsContext';
import ListingCard from './ListingCard';
import NeighborhoodMap from './NeighborhoodMap';
import { Container, Row, Col, Form, FormGroup, Pagination, Button, Dropdown } from 'react-bootstrap';
import { Listing } from '../types';
import Slider from 'rc-slider';
import 'rc-slider/assets/index.css';
import { useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import { useUserPreferences } from '../hooks/useUserPreferences';
import { parseKMLNeighborhoods } from '../utils/neighborhoodParser';


interface ListingsProps {
  // Optional callback to trigger the global login required prompt
  onRequireLogin?: () => void;
}

const Listings: React.FC<ListingsProps> = ({ onRequireLogin }) => {
  const { listings, loading: listingsLoading } = useListingsContext();
  const [filteredListings, setFilteredListings] = useState<Listing[]>([]);
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { preferences: savedPreferences, loading: preferencesLoading, savePreferences } = useUserPreferences();
  const preferencesLoadedRef = useRef(false);
  // Tracks location.state so the filter effect can read it without adding location to its deps
  const locationStateRef = useRef<unknown>(location.state);
  locationStateRef.current = location.state;

  // Address Search state
  const [searchQuery, setSearchQuery] = useState(searchParams.get('search') || '');
  const [isSearching, setIsSearching] = useState(false);
  const [addressSearchResults, setAddressSearchResults] = useState<Listing[]>([]);
  const [useAddressSearch, setUseAddressSearch] = useState(!!searchParams.get('search'));

  // Initialize from URL params, then override with saved preferences if logged in
  const [sortOrder, setSortOrder] = useState(searchParams.get('sort') || 'date-new-old');
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
  const [showFilters, setShowFilters] = useState(false);
  const [showNeighborhoodMap, setShowNeighborhoodMap] = useState(false);
  const [allNeighborhoods, setAllNeighborhoods] = useState<string[]>([]);
  const [isMobile, setIsMobile] = useState(false);
  // Pagination state
  const [currentPage, setCurrentPage] = useState(parseInt(searchParams.get('page') || '1', 10));
  const itemsPerPage = 20;
  
  // Detect mobile screen size
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768); // Bootstrap's md breakpoint
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Restore scroll position when returning from a listing detail page.
  // Must depend on filteredListings — the mount-time scroll fires before listing cards
  // are in the DOM (filteredListings starts as [] and is populated by a later effect).
  const scrollRestoredRef = useRef(false);
  useEffect(() => {
    if (scrollRestoredRef.current || filteredListings.length === 0) return;
    const scrollY = (location.state as { scrollY?: number } | null)?.scrollY;
    if (scrollY) {
      scrollRestoredRef.current = true;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          window.scrollTo({ top: scrollY, behavior: 'instant' as ScrollBehavior });
          // Clear the navigation state so the filter effect resets pages normally
          // on any subsequent filter changes
          navigate('.', { replace: true, state: null, preventScrollReset: true });
        });
      });
    }
  }, [filteredListings]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load saved preferences on mount if logged in and no URL params
  useEffect(() => {
    if (preferencesLoading || preferencesLoadedRef.current) return;
    
    const hasURLParams = searchParams.get('minPrice') || searchParams.get('maxPrice') || 
                         searchParams.get('bedrooms') || searchParams.get('floor') || 
                         searchParams.get('outdoor') || searchParams.get('minSize') || 
                         searchParams.get('areas') || searchParams.get('sort') || 
                         searchParams.get('publishedWithin') || searchParams.get('search');
    
    // Only load saved preferences if no URL params (user hasn't shared a link with filters)
    if (!hasURLParams && savedPreferences) {
      preferencesLoadedRef.current = true;
      
      // Restore preferences
      if (savedPreferences.priceRange) {
        setPriceRange(savedPreferences.priceRange);
      }
      if (savedPreferences.bedrooms) {
        setBedrooms(savedPreferences.bedrooms);
      }
      if (savedPreferences.floorLevel) {
        setFloorLevel(savedPreferences.floorLevel);
      }
      if (savedPreferences.selectedOutdoorSpaces && savedPreferences.selectedOutdoorSpaces.length > 0) {
        setSelectedOutdoorSpaces(savedPreferences.selectedOutdoorSpaces);
      }
      if (savedPreferences.minSize) {
        setMinSize(savedPreferences.minSize);
      }
      if (savedPreferences.selectedAreas && savedPreferences.selectedAreas.length > 0) {
        setSelectedAreas(savedPreferences.selectedAreas);
      }
      if (savedPreferences.sortOrder) {
        setSortOrder(savedPreferences.sortOrder);
      }
      if (savedPreferences.publishedWithin) {
        setPublishedWithin(savedPreferences.publishedWithin);
      }
      // Note: searchQuery is not restored from saved preferences
    } else {
      preferencesLoadedRef.current = true;
    }
  }, [savedPreferences, preferencesLoading, searchParams]);

  // Load all neighborhoods from KML file
  useEffect(() => {
    const loadNeighborhoods = async () => {
      try {
        const response = await fetch('/neighborhoods.kml');
        const kmlContent = await response.text();
        const parsedNeighborhoods = parseKMLNeighborhoods(kmlContent);
        const neighborhoodNames = parsedNeighborhoods.map(n => n.name).sort();
        setAllNeighborhoods(neighborhoodNames);
      } catch (error) {
        console.error('Error loading neighborhoods from KML:', error);
      }
    };

    loadNeighborhoods();
  }, []);

  const uniqueAreas = useMemo(() => {
    const areas = new Set<string>();
    listings.forEach(listing => {
        if (listing.area) {
            areas.add(listing.area);
        }
    });
    return Array.from(areas).sort();
  }, [listings]);


  // URL params update function (for filter changes, not search queries)
  // Note: This should NOT modify the search parameter - that's handled by updateURLWithSearch
  // But it preserves the current search from URL (if present) when only filters change
  const updateURLParams = useCallback(() => {
    // Start with current URL params to preserve search and other params
    const params = new URLSearchParams(searchParams);
    
    // Update all filter params
    if (sortOrder !== 'date-new-old') {
      params.set('sort', sortOrder);
    } else {
      params.delete('sort');
    }
    
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

    if (publishedWithin && publishedWithin !== 'all') {
      params.set('publishedWithin', publishedWithin);
    } else {
      params.delete('publishedWithin');
    }
    
    if (currentPage > 1) {
      params.set('page', currentPage.toString());
    } else {
      params.delete('page');
    }

    // Handle search parameter: only preserve if it exists in URL AND searchQuery state is not empty
    // If searchQuery state is empty, don't preserve search from URL (it was likely just cleared)
    const currentSearchInURL = searchParams.get('search');
    if (currentSearchInURL && currentSearchInURL.trim() && searchQuery && searchQuery.trim()) {
      // Only preserve search if both URL and state have it (user is searching)
      params.set('search', currentSearchInURL.trim());
    } else {
      // Remove search if either URL or state is empty (search was cleared)
      params.delete('search');
    }
    
    setSearchParams(params, { replace: true, preventScrollReset: true });
  }, [sortOrder, priceRange, bedrooms, floorLevel, selectedOutdoorSpaces, minSize, selectedAreas, publishedWithin, currentPage, setSearchParams, searchParams, searchQuery]);

  // Separate function for updating URL with search query
  const updateURLWithSearch = useCallback((query: string, overrideFilters?: {
    priceRange?: { min: number; max: number };
    bedrooms?: string;
    floorLevel?: string;
    outdoor?: string[];
    minSize?: string;
    areas?: string[];
    publishedWithin?: string;
  }) => {
    // Create fresh URLSearchParams (don't start with searchParams to avoid preserving old values)
    const params = new URLSearchParams();
    const filtersToUse = overrideFilters || {
      priceRange,
      bedrooms,
      floorLevel,
      outdoor: selectedOutdoorSpaces,
      minSize,
      areas: selectedAreas,
      publishedWithin
    };
    
    // Update all params based on current values
    if (sortOrder !== 'date-new-old') {
      params.set('sort', sortOrder);
    } else {
      params.delete('sort');
    }
    
    if (filtersToUse.priceRange) {
      if (filtersToUse.priceRange.min !== 400000) {
        params.set('minPrice', filtersToUse.priceRange.min.toString());
      } else {
        params.delete('minPrice');
      }
      if (filtersToUse.priceRange.max !== 1250000) {
        params.set('maxPrice', filtersToUse.priceRange.max.toString());
      } else {
        params.delete('maxPrice');
      }
    }
    
    if (filtersToUse.bedrooms && filtersToUse.bedrooms !== '1+') {
      params.set('bedrooms', filtersToUse.bedrooms);
    } else {
      params.delete('bedrooms');
    }
    
    if (filtersToUse.floorLevel && filtersToUse.floorLevel !== 'any') {
      params.set('floor', filtersToUse.floorLevel);
    } else {
      params.delete('floor');
    }
    
    if (filtersToUse.outdoor && filtersToUse.outdoor.length > 0) {
      params.set('outdoor', filtersToUse.outdoor.join(','));
    } else {
      params.delete('outdoor');
    }
    
    if (filtersToUse.minSize) {
      params.set('minSize', filtersToUse.minSize);
    } else {
      params.delete('minSize');
    }
    
    if (filtersToUse.areas && filtersToUse.areas.length > 0) {
      params.set('areas', filtersToUse.areas.join(','));
    } else {
      params.delete('areas');
    }

    if (filtersToUse.publishedWithin && filtersToUse.publishedWithin !== 'all') {
      params.set('publishedWithin', filtersToUse.publishedWithin);
    } else {
      params.delete('publishedWithin');
    }
    
    // Handle search parameter - explicitly add or remove
    if (query && query.trim()) {
      params.set('search', query.trim());
    } else {
      params.delete('search'); // Explicitly remove search parameter
    }
    
    setSearchParams(params, { replace: true, preventScrollReset: true });
  }, [sortOrder, priceRange, bedrooms, floorLevel, selectedOutdoorSpaces, minSize, selectedAreas, publishedWithin, setSearchParams, searchParams]);

  // Address Search function - shows spinner while fetching, then sets all results at once
  const performAddressSearch = useCallback(async (searchTerm: string) => {
    const trimmed = searchTerm.trim();
    if (!trimmed) {
      setAddressSearchResults([]);
      setUseAddressSearch(false);
      updateURLWithSearch('');
      return;
    }

    setIsSearching(true);
    const lowerQuery = trimmed.toLowerCase();

    // Search available listings in-memory (instant, no network)
    const availableMatches = listings.filter(listing =>
      listing.address && listing.address.toLowerCase().includes(lowerQuery)
    );

    // Fetch unavailable listings from Firestore and merge before showing results
    try {
      const q = query(
        collection(db, "listings"),
        where("status", "==", "processed"),
        where("available", "==", false),
        limit(500)
      );
      const snapshot = await getDocs(q);
      const unavailableMatches = snapshot.docs
        .map((doc: QueryDocumentSnapshot) => {
          const { publishDate, publishedAt, ...rest } = doc.data();
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
          return { id: doc.id, ...rest, publishedDate: finalPublishedDate } as Listing;
        })
        .filter((listing: Listing) =>
          listing.imageGallery && listing.imageGallery.length > 0 &&
          listing.address && listing.address.toLowerCase().includes(lowerQuery)
        );
      setAddressSearchResults([...availableMatches, ...unavailableMatches]);
    } catch (error) {
      console.error('Error fetching unavailable listings for search:', error);
      setAddressSearchResults(availableMatches);
    } finally {
      setUseAddressSearch(true);
      updateURLWithSearch(trimmed);
      setIsSearching(false);
    }
  }, [listings, updateURLWithSearch]);

  // Helper to check if a listing passes the current filters (used for "outside filters" indicator)
  const doesListingPassFilters = useCallback((listing: Listing): boolean => {
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
    const passesMinSize = !minSize || !!(listing.livingArea && listing.livingArea >= parseInt(minSize, 10));
    const passesArea = selectedAreas.length === 0 || !!(listing.area && selectedAreas.includes(listing.area));
    let passesPublishedWithin = true;
    if (publishedWithin && publishedWithin !== 'all' && listing.publishedDate &&
        typeof listing.publishedDate.toDate === 'function') {
      const days = parseInt(publishedWithin, 10);
      if (!Number.isNaN(days) && days > 0) {
        const now = new Date();
        const cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        cutoff.setDate(cutoff.getDate() - days);
        passesPublishedWithin = listing.publishedDate.toDate() >= cutoff;
      }
    }
    return passesPrice && passesBedrooms && passesFloorLevel && passesOutdoorSpace && passesMinSize && passesArea && passesPublishedWithin;
  }, [priceRange, bedrooms, floorLevel, selectedOutdoorSpaces, minSize, selectedAreas, publishedWithin]);

  useEffect(() => {
    // Use address search results if available, otherwise use regular listings
    let result = useAddressSearch ? [...addressSearchResults] : [...listings];

    // Sorting (always applied)
    result.sort((a, b) => {
      switch (sortOrder) {
        case 'price-low-high':
          return (a.price || 0) - (b.price || 0);
        case 'date-new-old': {
          // Primary sort: Date (day only) DESC (newest day first)
          const dateA = new Date((a.publishedDate?.seconds || 0) * 1000);
          const dateB = new Date((b.publishedDate?.seconds || 0) * 1000);
          const dayA = new Date(dateA.getFullYear(), dateA.getMonth(), dateA.getDate()).getTime();
          const dayB = new Date(dateB.getFullYear(), dateB.getMonth(), dateB.getDate()).getTime();
          const dayDiff = dayB - dayA;
          if (dayDiff !== 0) return dayDiff;
          return (a.price || 0) - (b.price || 0);
        }
        case 'date-old-new':
          return (a.publishedDate?.seconds || 0) - (b.publishedDate?.seconds || 0);
        default: {
          const defaultDateA = new Date((a.publishedDate?.seconds || 0) * 1000);
          const defaultDateB = new Date((b.publishedDate?.seconds || 0) * 1000);
          const defaultDayA = new Date(defaultDateA.getFullYear(), defaultDateA.getMonth(), defaultDateA.getDate()).getTime();
          const defaultDayB = new Date(defaultDateB.getFullYear(), defaultDateB.getMonth(), defaultDateB.getDate()).getTime();
          const defaultDayDiff = defaultDayB - defaultDayA;
          if (defaultDayDiff !== 0) return defaultDayDiff;
          return (a.price || 0) - (b.price || 0);
        }
      }
    });

    // Filtering - only apply to regular (non-search) view
    if (!useAddressSearch) {
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
            cutoff.setDate(startOfToday.getDate() - days);
            const publishedJsDate = listing.publishedDate.toDate();
            passesPublishedWithin = publishedJsDate >= cutoff;
          }
        }

        const hasImages = listing.imageGallery && listing.imageGallery.length > 0;

        return passesPrice &&
          passesBedrooms &&
          passesFloorLevel &&
          passesOutdoorSpace &&
          passesMinSize &&
          passesArea &&
          passesPublishedWithin &&
          hasImages;
      });
    }

    setFilteredListings(result);
    // Skip page reset when navigating back from a listing (location.state.scrollY is set).
    // We read from a ref so location doesn't need to be in the deps array.
    if (!(locationStateRef.current as any)?.scrollY) {
      setCurrentPage(1);
    }
  }, [listings, addressSearchResults, useAddressSearch, sortOrder, priceRange, bedrooms, floorLevel, selectedOutdoorSpaces, minSize, selectedAreas, publishedWithin]);

  // Calculate max processedAt date from available listings only (used for "New" badge)
  const maxProcessedAtDate = useMemo(() => {
    const allListings = listings; // Always use available listings — unavailable listings get processedAt updated when marked sold, which would skew the max date
    if (allListings.length === 0) return null;

    let maxDate: Date | null = null;

    allListings.forEach(listing => {
      if (listing.processedAt && typeof listing.processedAt.toDate === 'function') {
        const processedDate = listing.processedAt.toDate();
        if (!maxDate || processedDate > maxDate) {
          maxDate = processedDate;
        }
      }
    });

    return maxDate;
  }, [listings]);

  // Helper function to normalize date to day level (remove time component)
  const normalizeToDay = (date: Date): Date => {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  };

  // Helper function to check if a listing should show the "New" badge
  const isListingNew = useCallback((listing: Listing): boolean => {
    if (!maxProcessedAtDate || !listing.processedAt || listing.available === false) return false;

    try {
      const listingProcessedDate = listing.processedAt.toDate();
      const normalizedListingDate = normalizeToDay(listingProcessedDate);
      const normalizedMaxDate = normalizeToDay(maxProcessedAtDate);

      return normalizedListingDate.getTime() === normalizedMaxDate.getTime();
    } catch (error) {
      console.error('Error checking if listing is new:', error);
      return false;
    }
  }, [maxProcessedAtDate]);

  // Separate useEffect to update URL parameters only when filter values change
  // Skip updating URL if we're on a listing detail page (modal is open) to keep URL clean
  useEffect(() => {
    // Don't update URL params when viewing a listing detail page (path like /listings/123456)
    const isListingDetailPage = location.pathname.match(/^\/listings\/[^/]+$/);
    if (isListingDetailPage) {
      return;
    }
    updateURLParams();
  }, [sortOrder, priceRange, bedrooms, floorLevel, selectedOutdoorSpaces, minSize, selectedAreas, publishedWithin, updateURLParams, location.pathname]);

  // Save preferences when they change (debounced)
  // Note: searchQuery is not saved to preferences
  useEffect(() => {
    if (!preferencesLoadedRef.current) return; // Don't save on initial load
    
    const timeoutId = setTimeout(() => {
      savePreferences({
        priceRange,
        bedrooms,
        floorLevel,
        selectedOutdoorSpaces,
        minSize,
        selectedAreas,
        sortOrder,
        publishedWithin
      });
    }, 2000); // Debounce 2 seconds

    return () => clearTimeout(timeoutId);
  }, [priceRange, bedrooms, floorLevel, selectedOutdoorSpaces, minSize, selectedAreas, sortOrder, savePreferences]);

  // Pagination calculations
  const totalPages = Math.ceil(filteredListings.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentListings = filteredListings.slice(startIndex, endIndex);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const renderPaginationItems = () => {
    const items = [];
    const maxVisiblePages = 5;
    
    // Calculate the range of pages to show
    let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
    
    // Adjust start page if we're near the end
    if (endPage - startPage + 1 < maxVisiblePages) {
      startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }

    // Add first page and ellipsis if needed
    if (startPage > 1) {
      items.push(
        <Pagination.Item key={1} active={currentPage === 1} onClick={() => handlePageChange(1)}>
          1
        </Pagination.Item>
      );
      if (startPage > 2) {
        items.push(<Pagination.Ellipsis key="start-ellipsis" />);
      }
    }

    // Add visible pages
    for (let page = startPage; page <= endPage; page++) {
      items.push(
        <Pagination.Item 
          key={page} 
          active={currentPage === page} 
          onClick={() => handlePageChange(page)}
        >
          {page}
        </Pagination.Item>
      );
    }

    // Add ellipsis and last page if needed
    if (endPage < totalPages) {
      if (endPage < totalPages - 1) {
        items.push(<Pagination.Ellipsis key="end-ellipsis" />);
      }
      items.push(
        <Pagination.Item 
          key={totalPages} 
          active={currentPage === totalPages} 
          onClick={() => handlePageChange(totalPages)}
        >
          {totalPages}
        </Pagination.Item>
      );
    }

    return items;
  };


  return (
    <Container fluid="xl" style={{ position: 'relative', paddingTop: '0', marginTop: '0', paddingLeft: isMobile ? '0.5rem' : undefined, paddingRight: isMobile ? '0.5rem' : undefined }}>
      {/* Mobile Filters and Map Buttons - Floating over hero
          Only show after the initial listings load has completed to avoid
          any visible vertical "jump" as data and layout settle. */}
      {!listingsLoading && (
        <div className="mobile-filters-button d-md-none">
          <div className="mobile-buttons-container" style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <Button 
              onClick={() => {
                setShowFilters(!showFilters);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.5rem 1.5rem',
                borderRadius: '50px',
                fontSize: '0.875rem',
                fontWeight: '600',
                border: '2px solid rgba(255,255,255,0.9)',
                color: '#4a90e2',
                backgroundColor: '#ffffff',
                boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
                backdropFilter: 'blur(10px)',
                minWidth: '140px',
                whiteSpace: 'nowrap',
                flexShrink: 0,
                height: 'auto',
                lineHeight: '1.2'
              }}
              className="mobile-filters-btn"
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', whiteSpace: 'nowrap' }}>
                🔍 Filters
                {(() => {
                  const activeCount = [
                    bedrooms !== 'any',
                    priceRange.min !== 400000 || priceRange.max !== 1250000,
                    floorLevel !== 'any',
                    selectedOutdoorSpaces.length > 0,
                    minSize !== '',
                    selectedAreas.length > 0
                  ].filter(Boolean).length;
                  return activeCount > 0 && (
                    <span style={{
                      backgroundColor: '#4a90e2',
                      color: 'white',
                      borderRadius: '10px',
                      padding: '0.2rem 0.4rem',
                      fontSize: '0.75rem',
                      fontWeight: '700',
                      minWidth: '1.25rem',
                      textAlign: 'center',
                      flexShrink: 0
                    }}>
                      {activeCount}
                    </span>
                  );
                })()}
              </span>
            </Button>
            <Button 
              onClick={() => {
                const params = new URLSearchParams(searchParams);
                navigate(`/map?${params.toString()}`);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.5rem 1rem',
                borderRadius: '50px',
                fontSize: '0.875rem',
                fontWeight: '600',
                border: '2px solid rgba(255,255,255,0.9)',
                color: '#4a90e2',
                backgroundColor: '#ffffff',
                boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
                backdropFilter: 'blur(10px)'
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
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              Map
            </Button>
          </div>
        </div>
      )}

      {/* Filter Section */}
      <div
        className={`mb-2 mb-md-4 p-3 p-md-5 filters-section ${showFilters ? '' : 'd-none'} d-md-block`}
        style={{ 
          backgroundColor: '#f8f9fa', 
          borderRadius: '16px',
          border: '1px solid #e9ecef',
          boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
          marginTop: '-90px',
          position: 'relative',
          zIndex: 100,
          minHeight: '1px',
          maxWidth: '1180px',
          marginLeft: 'auto',
          marginRight: 'auto',
          width: '100%'
        }}
      >
        <div className="d-flex justify-content-between align-items-center mb-3 filters-header-row">
          <h6 className="text-muted fw-semibold mb-0" style={{ fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Filter houses
          </h6>
          {/* Mobile: Close filters button */}
          <Button
            className="d-inline-flex d-md-none"
            variant="outline-secondary"
            size="sm"
            onClick={() => {
              setShowFilters(false);
            }}
            style={{
              borderRadius: '8px',
              padding: '0.4rem 1rem',
              fontSize: '0.85rem',
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            <span style={{ fontSize: '1rem', lineHeight: 1, marginRight: '0.25rem' }}>×</span>
            Close
          </Button>
        </div>
        <div className="filters-content-desktop">
          <Form>
            <Row className="g-1 g-md-2 filters-main-row align-items-end flex-wrap flex-md-nowrap">
            {/* Price Range */}
            <Col lg={2} md={6}>
              <FormGroup>
                <Form.Label className="fw-medium mb-2" style={{ fontSize: '0.85rem' }}>Price Range</Form.Label>
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
            </Col>

            {/* Bedrooms */}
            <Col lg={1} md={6}>
              <FormGroup>
                <Form.Label className="fw-medium mb-2" style={{ fontSize: '0.85rem' }}>Beds</Form.Label>
                <Dropdown>
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
                      {bedrooms === 'any' ? 'Any' : bedrooms}
                    </span>
                  </Dropdown.Toggle>

                  <Dropdown.Menu style={{ width: '100%' }}>
                    <Dropdown.Item 
                      onClick={() => setBedrooms('any')}
                      active={bedrooms === 'any'}
                    >
                      Any
                    </Dropdown.Item>
                    <Dropdown.Item 
                      onClick={() => setBedrooms('1+')}
                      active={bedrooms === '1+'}
                    >
                      1+
                    </Dropdown.Item>
                    <Dropdown.Item 
                      onClick={() => setBedrooms('2+')}
                      active={bedrooms === '2+'}
                    >
                      2+
                    </Dropdown.Item>
                    <Dropdown.Item 
                      onClick={() => setBedrooms('3+')}
                      active={bedrooms === '3+'}
                    >
                      3+
                    </Dropdown.Item>
                    <Dropdown.Item 
                      onClick={() => setBedrooms('4+')}
                      active={bedrooms === '4+'}
                    >
                      4+
                    </Dropdown.Item>
                  </Dropdown.Menu>
                </Dropdown>
              </FormGroup>
            </Col>

            {/* Min Size */}
            <Col lg={1} md={6}>
              <FormGroup>
                <Form.Label className="fw-medium mb-2" style={{ fontSize: '0.85rem' }}>Min size</Form.Label>
                <Form.Control 
                  type="number"
                  placeholder="Any m²"
                  value={minSize}
                  onChange={e => setMinSize(e.target.value)}
                  style={{ 
                    borderRadius: '8px',
                    border: '1px solid #dee2e6',
                    fontSize: '0.8rem',
                    padding: '0.4rem 0.5rem'
                  }}
                />
              </FormGroup>
            </Col>

            {/* Outdoor Space */}
            <Col lg={1} md={6}>
              <FormGroup>
                <Form.Label className="fw-medium mb-2" style={{ fontSize: '0.85rem' }}>Outdoor</Form.Label>
                <Dropdown>
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
                            id={`outdoor-${space}`}
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
                        <Dropdown.Item 
                          onClick={() => setSelectedOutdoorSpaces([])}
                          className="text-danger"
                        >
                          Clear All
                        </Dropdown.Item>
                      </>
                    )}
                  </Dropdown.Menu>
                </Dropdown>
              </FormGroup>
            </Col>

            {/* Floor Level */}
            <Col lg={1} md={6}>
              <FormGroup>
                <Form.Label className="fw-medium mb-2" style={{ fontSize: '0.85rem' }}>Floor</Form.Label>
                <Dropdown>
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
                      {floorLevel === 'any' ? 'Any' : floorLevel === 'top' ? 'Upper' : 'Ground'}
                    </span>
                  </Dropdown.Toggle>

                  <Dropdown.Menu style={{ width: '100%' }}>
                    <Dropdown.Item 
                      onClick={() => setFloorLevel('any')}
                      active={floorLevel === 'any'}
                    >
                      Any
                    </Dropdown.Item>
                    <Dropdown.Item 
                      onClick={() => setFloorLevel('top')}
                      active={floorLevel === 'top'}
                    >
                      Upper
                    </Dropdown.Item>
                    <Dropdown.Item 
                      onClick={() => setFloorLevel('ground')}
                      active={floorLevel === 'ground'}
                    >
                      Ground
                    </Dropdown.Item>
                  </Dropdown.Menu>
                </Dropdown>
              </FormGroup>
            </Col>


            {/* Area */}
            <Col lg={3} md={12}>
              <FormGroup>
                <Form.Label className="fw-medium mb-2" style={{ fontSize: '0.85rem' }}>Neighborhood</Form.Label>
                <Dropdown>
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
                      {selectedAreas.length === 0 
                        ? 'Any' 
                        : selectedAreas.length === 1 
                          ? (selectedAreas[0].length > 20 ? selectedAreas[0].substring(0, 17) + '...' : selectedAreas[0])
                          : `Multiple (${selectedAreas.length})`
                      }
                    </span>
                  </Dropdown.Toggle>

                  <Dropdown.Menu style={{ width: '100%', maxHeight: '300px', overflowY: 'auto' }}>
                    <Dropdown.Item 
                      onClick={() => setShowNeighborhoodMap(true)}
                    >
                      🗺️ Select on Map
                    </Dropdown.Item>
                    <Dropdown.Divider />
                    {allNeighborhoods.map(area => (
                      <Dropdown.ItemText key={area}>
                        <Form.Check
                          type="checkbox"
                          id={`neighborhood-${area}`}
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
                        <Dropdown.Item 
                          onClick={() => setSelectedAreas([])}
                          className="text-danger"
                        >
                          Clear All
                        </Dropdown.Item>
                      </>
                    )}
                  </Dropdown.Menu>
                </Dropdown>
              </FormGroup>
            </Col>

            {/* Published within */}
            <Col lg={2} md={6}>
              <FormGroup>
                <Form.Label className="fw-medium mb-2" style={{ fontSize: '0.85rem' }}>Published in last</Form.Label>
                <Dropdown>
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
                            : publishedWithin === '7'
                              ? '7 days'
                              : '14 days'}
                    </span>
                  </Dropdown.Toggle>
                  <Dropdown.Menu style={{ width: '100%' }}>
                    <Dropdown.Item onClick={() => setPublishedWithin('all')} active={publishedWithin === 'all'}>
                      Any time
                    </Dropdown.Item>
                    <Dropdown.Item onClick={() => setPublishedWithin('1')} active={publishedWithin === '1'}>
                      Last 1 day
                    </Dropdown.Item>
                    <Dropdown.Item onClick={() => setPublishedWithin('3')} active={publishedWithin === '3'}>
                      Last 3 days
                    </Dropdown.Item>
                    <Dropdown.Item onClick={() => setPublishedWithin('7')} active={publishedWithin === '7'}>
                      Last 7 days
                    </Dropdown.Item>
                    <Dropdown.Item onClick={() => setPublishedWithin('14')} active={publishedWithin === '14'}>
                      Last 14 days
                    </Dropdown.Item>
                  </Dropdown.Menu>
                </Dropdown>
              </FormGroup>
            </Col>

            {/* Clear Filters button - hidden on mobile */}
            <Col lg={1} md={6} className="clear-filters-col d-none d-md-block">
              <FormGroup>
                <Form.Label className="fw-medium mb-2" style={{ fontSize: '0.85rem', visibility: 'hidden' }}>
                  Clear Filters
                </Form.Label>
                <Button 
                  variant="outline-secondary" 
                  size="sm" 
                  onClick={() => {
                    setPriceRange({ min: 400000, max: 1250000 });
                    setBedrooms('1+');
                    setFloorLevel('any');
                    setSelectedOutdoorSpaces([]);
                    setMinSize('');
                    setSelectedAreas([]);
                    setPublishedWithin('all');
                    setSearchQuery('');
                    setUseAddressSearch(false);
                    setAddressSearchResults([]);
                  }}
                  style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem', width: '100%', borderRadius: '8px' }}
                >
                  Clear Filters
                </Button>
              </FormGroup>
            </Col>

            </Row>
            
            {/* Address Search + Map view (desktop/tablet) */}
            <Row className="mt-3 ai-search-row">
              <Col xs={12} md={6} lg={5}>
                <FormGroup>
                  <Form.Label className="fw-medium mb-2" style={{ fontSize: '0.85rem' }}>
                    Address search
                  </Form.Label>
                  <div className="d-flex gap-2" style={{ width: '100%' }}>
                    <Form.Control
                      type="text"
                      placeholder="Street name and number"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          performAddressSearch(searchQuery);
                        }
                      }}
                      style={{
                        flex: 1,
                        minWidth: 0,
                        borderRadius: '8px',
                        border: '1px solid #dee2e6',
                        fontSize: '0.9rem',
                        padding: '8px 12px'
                      }}
                    />
                    <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                      <Button
                        variant="primary"
                        onClick={() => performAddressSearch(searchQuery)}
                        disabled={isSearching || !searchQuery.trim()}
                        style={{ borderRadius: '8px', padding: '8px 16px' }}
                      >
                        {isSearching ? 'Searching...' : 'Search'}
                      </Button>
                      {useAddressSearch && (
                        <Button
                          variant="outline-secondary"
                          size="sm"
                          onClick={() => {
                            setSearchQuery('');
                            setUseAddressSearch(false);
                            setAddressSearchResults([]);
                            updateURLWithSearch('');
                          }}
                          style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                        >
                          Clear
                        </Button>
                      )}
                    </div>
                  </div>
                </FormGroup>
              </Col>
              <Col lg={7} md={6} sm={12} className="mt-2 mt-md-0 d-none d-md-flex justify-content-md-end">
                <Button
                  className="ai-map-btn"
                  variant="primary"
                  onClick={() => {
                    const params = new URLSearchParams(searchParams);
                    navigate(`/map?${params.toString()}`);
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
                    style={{ marginRight: '0.4rem' }}
                  >
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                  View all on map
                </Button>
              </Col>
            </Row>

            {/* Mobile: Close Filters button - shown only on mobile after search */}
            <Row className="d-md-none mt-3">
              <Col>
                <Button 
                  variant="outline-secondary" 
                  size="sm" 
                  onClick={() => {
                    setShowFilters(false);
                  }}
                  style={{ 
                    fontSize: '0.75rem', 
                    padding: '0.25rem 0.5rem', 
                    width: '100%', 
                    borderRadius: '8px' 
                  }}
                >
                  Close Filters
                </Button>
              </Col>
            </Row>
          </Form>
        </div>
      </div>
      
      {/* Mobile Sort Bar */}
      {!listingsLoading && filteredListings.length > 0 && (
        <div className="d-md-none mb-3" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', marginTop: '0.5rem', paddingTop: showFilters ? '680px' : '0', transition: 'padding-top 0.3s ease', position: 'relative', zIndex: 100 }}>
          {/* Left: Results count */}
          <div style={{
            fontSize: '0.8rem',
            color: '#6c757d',
            whiteSpace: 'nowrap'
          }}>
            {filteredListings.length} listings • Page {currentPage} of {totalPages}
          </div>
          
          {/* Right: Sort Dropdown */}
          <Dropdown>
            <Dropdown.Toggle 
              variant="outline-secondary"
              size="sm"
              style={{
                padding: '0.5rem 0.75rem',
                borderRadius: '8px',
                fontSize: '0.875rem',
                fontWeight: '500',
                border: '1px solid #dee2e6',
                backgroundColor: 'white',
                color: '#495057',
                whiteSpace: 'nowrap'
              }}
            >
              {sortOrder === 'date-new-old' ? ('Date & Price') :
               sortOrder === 'date-old-new' ? 'Oldest first' :
               sortOrder === 'price-low-high' ? 'Price: Low-High' : 'Price: High-Low'}
            </Dropdown.Toggle>
            <Dropdown.Menu align="end">
              <Dropdown.Item onClick={() => setSortOrder('date-new-old')} active={sortOrder === 'date-new-old'}>
                {'Date & Price'}
              </Dropdown.Item>
              <Dropdown.Item onClick={() => setSortOrder('date-old-new')} active={sortOrder === 'date-old-new'}>
                Oldest first
              </Dropdown.Item>
              <Dropdown.Item onClick={() => setSortOrder('price-low-high')} active={sortOrder === 'price-low-high'}>
                Price: Low-High
              </Dropdown.Item>
              <Dropdown.Item onClick={() => setSortOrder('price-high-low')} active={sortOrder === 'price-high-low'}>
                Price: High-Low
              </Dropdown.Item>
            </Dropdown.Menu>
          </Dropdown>
        </div>
      )}
      
      {/* Desktop Sort and Pagination info */}
      {!listingsLoading && filteredListings.length > 0 && (
        <div className="mb-2 d-none d-md-flex" style={{ maxWidth: '1180px', marginLeft: 'auto', marginRight: 'auto' }}>
          <div style={{ width: '100%' }}>
            <div className="d-flex justify-content-between align-items-center flex-wrap gap-2" style={{ fontSize: '0.85rem' }}>
              <div className="d-flex align-items-center gap-2">
                <div>
                  <strong>Showing {startIndex + 1}-{Math.min(endIndex, filteredListings.length)} of {filteredListings.length} listings</strong>
                </div>
                {totalPages > 1 && (
                  <div className="text-muted">
                    Page {currentPage} of {totalPages}
                  </div>
                )}
              </div>
              <div className="d-flex align-items-center gap-1">
                <Form.Label className="mb-0 me-1 results-sort-label"><strong>Sort by:</strong></Form.Label>
                <Form.Control 
                  as="select" 
                  value={sortOrder} 
                  onChange={e => setSortOrder(e.target.value)}
                  className="results-sort-select"
                  style={{ 
                    width: 'auto', 
                    minWidth: '180px',
                    backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3e%3cpath fill='none' stroke='%23343a40' stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='m1 6 7 7 7-7'/%3e%3c/svg%3e")`,
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'right 0.75rem center',
                    backgroundSize: '16px 12px',
                    paddingRight: '2.25rem'
                  }}
                >
                  <option value="date-new-old">{'Date & Price'}</option>
                  <option value="date-old-new">Date (Old to New)</option>
                  <option value="price-low-high">Price (Low to High)</option>
                  <option value="price-high-low">Price (High to Low)</option>
                </Form.Control>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Initial loading message */}
      {listingsLoading && (
        <Row>
          <Col>
            <div className="text-center py-5">
              <div className="spinner-border text-primary mb-3" role="status" style={{ width: '3rem', height: '3rem' }}>
                <span className="visually-hidden">Loading...</span>
              </div>
              <h4 style={{ color: '#6c757d', fontWeight: '500' }}>Loading homes...</h4>
            </div>
          </Col>
        </Row>
      )}

      {/* Listings */}
      {!listingsLoading && (
        <Row className="listings-grid-row">
          {currentListings.map(listing => (
            <Col
              key={listing.id}
              sm={12}
              md={6}
              lg={6}
              xl={4}
              className="mb-4"
              style={isMobile ? { paddingLeft: 0, paddingRight: 0 } : {}}
            >
              <ListingCard
                listing={listing}
                onRequireLogin={onRequireLogin}
                isNew={isListingNew(listing)}
                isUnavailable={listing.available === false}
                isOutsideFilters={useAddressSearch && !doesListingPassFilters(listing)}
              />
            </Col>
          ))}
        </Row>
      )}

      {/* Pagination controls */}
      {!listingsLoading && totalPages > 1 && (
        <Row className="mt-4">
          <Col>
            <div className="d-flex justify-content-center">
              <Pagination>
                <Pagination.Prev 
                  disabled={currentPage === 1} 
                  onClick={() => currentPage > 1 && handlePageChange(currentPage - 1)}
                />
                {renderPaginationItems()}
                <Pagination.Next 
                  disabled={currentPage === totalPages} 
                  onClick={() => currentPage < totalPages && handlePageChange(currentPage + 1)}
                />
              </Pagination>
            </div>
          </Col>
        </Row>
      )}

      {/* No results message */}
      {filteredListings.length === 0 && !isSearching &&
       ((!useAddressSearch && !listingsLoading) || useAddressSearch) && (
        <Row>
          <Col>
            <div className="text-center py-5">
              <h4>No listings found</h4>
              <p>Try adjusting your filters to see more results.</p>
            </div>
          </Col>
        </Row>
      )}

      {/* Neighborhood Map Modal */}
      <NeighborhoodMap
        show={showNeighborhoodMap}
        onHide={() => setShowNeighborhoodMap(false)}
        selectedNeighborhoods={selectedAreas}
        onNeighborhoodSelect={setSelectedAreas}
        availableNeighborhoods={uniqueAreas}
      />
    </Container>
  );
};

export default Listings;