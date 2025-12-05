import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import ListingCard from './ListingCard';
import NeighborhoodMap from './NeighborhoodMap';
import { Container, Row, Col, Form, FormGroup, Pagination, Button, Dropdown } from 'react-bootstrap';
import { Listing } from '../types';
import Slider from 'rc-slider';
import 'rc-slider/assets/index.css';
import { useSearchParams, useParams, useNavigate } from 'react-router-dom';
import { useUserPreferences } from '../hooks/useUserPreferences';
import { parseKMLNeighborhoods } from '../utils/neighborhoodParser';
import { extractFiltersFromQuery } from '../utils/queryFilterExtractor';

interface ListingsProps {
  // Optional callback to trigger the global login required prompt
  onRequireLogin?: () => void;
}

const Listings: React.FC<ListingsProps> = ({ onRequireLogin }) => {
  const [listings, setListings] = useState<Listing[]>([]);
  const [filteredListings, setFilteredListings] = useState<Listing[]>([]);
  const [searchParams, setSearchParams] = useSearchParams();
  const { id: modalListingId } = useParams();
  const navigate = useNavigate();
  const { preferences: savedPreferences, loading: preferencesLoading, savePreferences } = useUserPreferences();
  const preferencesLoadedRef = useRef(false);

  // AI Search state
  const [searchQuery, setSearchQuery] = useState(searchParams.get('search') || '');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<Listing[]>([]);
  const [useAISearch, setUseAISearch] = useState(!!searchQuery);
  const hasPerformedInitialSearch = useRef(false);
  const initialSearchQueryRef = useRef(searchParams.get('search') || '');
  const searchInProgressRef = useRef(false); // Prevent concurrent searches

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
  const [isModalOpen, setIsModalOpen] = useState(!!modalListingId);
  const [showFilters, setShowFilters] = useState(false);
  const [showNeighborhoodMap, setShowNeighborhoodMap] = useState(false);
  const [allNeighborhoods, setAllNeighborhoods] = useState<string[]>([]);
  const [hasLoadedInitialListings, setHasLoadedInitialListings] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;
  
  // Detect mobile screen size
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768); // Bootstrap's md breakpoint
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

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

  useEffect(() => {
    const fetchListings = async () => {
      try {
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
            // Filter out listings without images
            return listing.imageGallery && listing.imageGallery.length > 0;
          });
        setListings(listingsData);
      } finally {
        // Ensure we mark the initial load as complete even if the request fails,
        // so the UI doesn't get stuck in a "pre-load" visual state.
        setHasLoadedInitialListings(true);
      }
    };

    fetchListings();
  }, []);

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
    
    setSearchParams(params, { replace: true });
  }, [sortOrder, priceRange, bedrooms, floorLevel, selectedOutdoorSpaces, minSize, selectedAreas, publishedWithin, setSearchParams, searchParams, searchQuery]);

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
    
    setSearchParams(params, { replace: true });
  }, [sortOrder, priceRange, bedrooms, floorLevel, selectedOutdoorSpaces, minSize, selectedAreas, publishedWithin, setSearchParams, searchParams]);

  // AI Search function
  const performAISearch = useCallback(async (query: string) => {
    console.log('performAISearch called with:', query);

    // Mark that a search has been performed so that future filter changes
    // can safely trigger auto-search. This covers both URL-initialized
    // searches and user-initiated searches (Enter key or button click).
    if (!hasPerformedInitialSearch.current) {
      hasPerformedInitialSearch.current = true;
    }
    
    // Prevent concurrent searches
    if (searchInProgressRef.current) {
      console.log('Search already in progress, skipping...');
      return;
    }
    
    // Extract filters from query FIRST
    // Pass available neighborhoods for matching
    const extractedFilters = extractFiltersFromQuery(query, allNeighborhoods);
    console.log('Extracted filters from query:', extractedFilters);
    
    // Use cleaned query for search (without filter terms)
    const cleanedQuery = extractedFilters.cleanedQuery.trim();
    
    console.log('Original query:', query);
    console.log('Cleaned query:', cleanedQuery);
    
    // Check if we have a valid search query after filter extraction
    // If no cleaned query and no filters extracted, check original query length
    if (!cleanedQuery && !extractedFilters.bedrooms && !extractedFilters.floor && (!extractedFilters.outdoor || extractedFilters.outdoor.length === 0)) {
      // No filters extracted, check original query length
      if (!query.trim() || query.trim().length < 3) {
        console.log('Query too short, clearing results');
        setSearchResults([]);
        setUseAISearch(false);
        return;
      }
    }
    
    // Apply extracted filters to state
    let filtersChanged = false;
    
    if (extractedFilters.bedrooms) {
      // Map extracted bedroom value to our format
      // Dropdown expects: "any", "1+", "2+", "3+", "4+"
      const bedroomValue = extractedFilters.bedrooms;
      let newBedrooms: string;
      if (bedroomValue === '1') {
        newBedrooms = '1+';
      } else if (bedroomValue === '2') {
        newBedrooms = '2+';
      } else if (bedroomValue === '3') {
        newBedrooms = '3+';
      } else if (bedroomValue === '4') {
        newBedrooms = '4+';
      } else if (bedroomValue === '5') {
        // No 5+ option, use 4+ as max
        newBedrooms = '4+';
      } else {
        // Default to 1+ for other values
        newBedrooms = '1+';
      }
      if (newBedrooms !== bedrooms) {
        setBedrooms(newBedrooms);
        filtersChanged = true;
      }
    }
    
    if (extractedFilters.floor) {
      if (extractedFilters.floor !== floorLevel) {
        setFloorLevel(extractedFilters.floor);
        filtersChanged = true;
      }
    }
    
    if (extractedFilters.outdoor && extractedFilters.outdoor.length > 0) {
      // Merge with existing outdoor spaces (don't override, just add)
      const newOutdoor = Array.from(new Set([...selectedOutdoorSpaces, ...extractedFilters.outdoor]));
      if (JSON.stringify(newOutdoor.sort()) !== JSON.stringify(selectedOutdoorSpaces.sort())) {
        setSelectedOutdoorSpaces(newOutdoor);
        filtersChanged = true;
      }
    }
    
    if (extractedFilters.areas && extractedFilters.areas.length > 0) {
      // Merge with existing areas (don't override, just add)
      const newAreas = Array.from(new Set([...selectedAreas, ...extractedFilters.areas]));
      if (JSON.stringify(newAreas.sort()) !== JSON.stringify(selectedAreas.sort())) {
        setSelectedAreas(newAreas);
        filtersChanged = true;
      }
    }
    
    // Use cleaned query for search (without filter terms)
    // If cleaned query is empty or only contains common words, use empty string
    // This allows searching with just filters (no semantic search, just filter results)
    const searchQueryToUse = cleanedQuery && cleanedQuery.trim() ? cleanedQuery.trim() : '';
    
    console.log('Filters changed:', filtersChanged);
    console.log('Search query to use:', searchQueryToUse);
    
    // If no cleaned query and no filters changed, can't search
    if (!searchQueryToUse && !filtersChanged) {
      console.log('No search query after filter extraction and no filters changed');
      return;
    }

    console.log('Starting AI search...');
    searchInProgressRef.current = true;
    setIsSearching(true);
    
    // Use current filter state (which may have been updated above)
    // But we need to use the updated values, so we'll re-read them after a brief delay
    // Actually, React state updates are async, so we'll use the extracted filters directly
    const effectiveBedrooms = extractedFilters.bedrooms 
      ? (extractedFilters.bedrooms === '1' ? '1+' : 
         extractedFilters.bedrooms === '2' ? '2+' : 
         extractedFilters.bedrooms === '3' ? '3+' :
         extractedFilters.bedrooms === '4' ? '4+' :
         extractedFilters.bedrooms === '5' ? '4+' : // Max is 4+
         '1+')
      : bedrooms;
    const effectiveFloor = extractedFilters.floor || floorLevel;
    const effectiveOutdoor = extractedFilters.outdoor && extractedFilters.outdoor.length > 0
      ? Array.from(new Set([...selectedOutdoorSpaces, ...extractedFilters.outdoor]))
      : selectedOutdoorSpaces;
    const effectiveAreas = extractedFilters.areas && extractedFilters.areas.length > 0
      ? Array.from(new Set([...selectedAreas, ...extractedFilters.areas]))
      : selectedAreas;
    
    // Convert bedroom filter to numeric value for backend compatibility
    // Backend expects '1', '2', '3', '4', '5', or 'any', not '1+', '2+', etc.
    const bedroomFilter = effectiveBedrooms === 'any' ? 'any' : 
                         effectiveBedrooms === '1+' ? '1' :
                         effectiveBedrooms === '2+' ? '2' : 
                         effectiveBedrooms === '3+' ? '3' :
                         effectiveBedrooms === '4+' ? '4' :
                         effectiveBedrooms === '5+' ? '5' :
                         // If it's already a number without '+', use it
                         effectiveBedrooms;
    
    // Check if any filters are active (not default values)
    const hasActiveFilters = effectiveBedrooms !== '1+' || 
                            priceRange.min !== 400000 || 
                            priceRange.max !== 1250000 || 
                            effectiveFloor !== 'any' || 
                            effectiveOutdoor.length > 0 || 
                            minSize !== '' || 
                            effectiveAreas.length > 0;
    
    const requestBody = {
      query: searchQueryToUse,
      limit: 100,
      filters: {
        minPrice: priceRange.min,
        maxPrice: priceRange.max,
        bedrooms: bedroomFilter,
        floor: effectiveFloor,
        outdoor: effectiveOutdoor,
        minSize: minSize,
        areas: effectiveAreas,
        publishedWithinDays: publishedWithin !== 'all' ? parseInt(publishedWithin, 10) : null
      },
      // If we have filters but no search query, use 'filtered' type (just filters, no search)
      // If we have a search query, use appropriate search type based on filters
      search_type: searchQueryToUse 
        ? (hasActiveFilters ? 'filtered' : 'semantic')
        : (hasActiveFilters ? 'filtered' : 'semantic') // If no query but filters exist, use filtered
    };
    
    console.log('Request body:', JSON.stringify(requestBody, null, 2));
    
    try {
        // Use local search API in development, Cloud Run in production
        const searchApiUrl = process.env.REACT_APP_SEARCH_API_URL || 'http://localhost:8080';
        const response = await fetch(`${searchApiUrl}/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        console.error('Search request failed:', response.status, response.statusText);
        throw new Error('Search request failed');
      }

      const data = await response.json();
      console.log('Search response received:', data);
      console.log('Response results length:', data.results ? data.results.length : 'no results property');
      console.log('Full response structure:', JSON.stringify(data, null, 2));
      
      // Convert search results to Listing format
      const formattedResults: Listing[] = data.results
        .filter((result: any) => {
          // Filter out listings without images
          return result.imageGallery && result.imageGallery.length > 0;
        })
        .map((result: any) => {
        // Transform publishedDate to match the format expected by ListingCard
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

      console.log('Setting search results:', formattedResults.length, 'results');
      setSearchResults(formattedResults);
      setUseAISearch(true);
      
      // Keep the original query in the search input field for user visibility
      // Only use cleaned query for actual search and URL
      // Don't update searchQuery state - let user see what they typed
      
      // Update URL with cleaned search query and extracted filters after successful search
      // Note: Filter state updates will trigger URL update via updateURLParams effect
      // But we need to update search query in URL
      const params = new URLSearchParams();
      if (sortOrder !== 'date-new-old') params.set('sort', sortOrder);
      if (priceRange.min !== 400000) params.set('minPrice', priceRange.min.toString());
      if (priceRange.max !== 1250000) params.set('maxPrice', priceRange.max.toString());
      
      // Use effective values (extracted or existing)
      const finalBedrooms = extractedFilters.bedrooms 
        ? (extractedFilters.bedrooms === '1' ? '1+' : 
           extractedFilters.bedrooms === '2' ? '2+' : 
           extractedFilters.bedrooms === '3' ? '3+' :
           extractedFilters.bedrooms === '4' ? '4+' :
           extractedFilters.bedrooms === '5' ? '4+' : // Max is 4+
           '1+')
        : bedrooms;
      const finalFloor = extractedFilters.floor || floorLevel;
      const finalOutdoor = extractedFilters.outdoor && extractedFilters.outdoor.length > 0
        ? Array.from(new Set([...selectedOutdoorSpaces, ...extractedFilters.outdoor]))
        : selectedOutdoorSpaces;
      const finalAreas = extractedFilters.areas && extractedFilters.areas.length > 0
        ? Array.from(new Set([...selectedAreas, ...extractedFilters.areas]))
        : selectedAreas;
      
      if (finalBedrooms !== '1+') params.set('bedrooms', finalBedrooms);
      if (finalFloor !== 'any') params.set('floor', finalFloor);
      if (finalOutdoor.length > 0) params.set('outdoor', finalOutdoor.join(','));
      if (minSize) params.set('minSize', minSize);
      if (finalAreas.length > 0) params.set('areas', finalAreas.join(','));
      // Only add search query to URL if it's not empty after cleanup
      // Keep the original query in the input field for user visibility
      // Always add search query if it exists, even if short (backend will handle it)
      if (searchQueryToUse && searchQueryToUse.trim()) {
        params.set('search', searchQueryToUse.trim());
      }
      
      setSearchParams(params, { replace: true });
    } catch (error) {
      console.error('AI Search error:', error);
      setSearchResults([]);
      setUseAISearch(false);
    } finally {
      console.log('Search completed, setting isSearching to false');
      setIsSearching(false);
      searchInProgressRef.current = false;
    }
  }, [priceRange.min, priceRange.max, bedrooms, floorLevel, selectedOutdoorSpaces, minSize, selectedAreas, publishedWithin]);

  // Trigger search when component loads with a search query in URL
  useEffect(() => {
    console.log('Component mounted, searchQuery:', searchQuery, 'isSearching:', isSearching, 'hasPerformedInitialSearch:', hasPerformedInitialSearch.current);
    const trimmedSearchQuery = searchQuery.trim();
    const initialTrimmedQuery = (initialSearchQueryRef.current || '').trim();

    // Only auto-trigger an initial search if:
    // - There is a non-empty search query
    // - No search has been performed yet
    // - The current searchQuery still matches the initial URL search value
    //   (prevents auto-searching when the user starts typing from an empty box)
    if (
      trimmedSearchQuery &&
      !isSearching &&
      !hasPerformedInitialSearch.current &&
      trimmedSearchQuery === initialTrimmedQuery
    ) {
      console.log('Triggering initial search for:', searchQuery);
      hasPerformedInitialSearch.current = true;
      performAISearch(searchQuery);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]); // Only run when searchQuery changes

  // Trigger search when filters change (if there's an active search query)
  // Only trigger if initial search has already been performed (prevents duplicate initial searches)
  useEffect(() => {
    if (!hasPerformedInitialSearch.current) {
      return; // Don't trigger on initial mount, wait for initial search to complete
    }
    console.log('Filters changed, searchQuery:', searchQuery, 'isSearching:', isSearching);
    if (searchQuery.trim() && !isSearching) {
      console.log('Triggering search due to filter change for:', searchQuery);
      performAISearch(searchQuery);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priceRange.min, priceRange.max, bedrooms, floorLevel, selectedOutdoorSpaces, minSize, selectedAreas, publishedWithin]);

  useEffect(() => {
    // Use AI search results if available, otherwise use regular listings
    let result = useAISearch ? [...searchResults] : [...listings];

    // Sorting (skip for AI search results as they're already ranked by relevance)
    if (!useAISearch) {
      result.sort((a, b) => {
      switch (sortOrder) {
        case 'price-low-high':
          return (a.price || 0) - (b.price || 0);
        case 'date-new-old':
          // Primary sort: Date (day only) DESC (newest day first)
          const dateA = new Date((a.publishedDate?.seconds || 0) * 1000);
          const dateB = new Date((b.publishedDate?.seconds || 0) * 1000);
          
          // Normalize to day level (remove time component)
          const dayA = new Date(dateA.getFullYear(), dateA.getMonth(), dateA.getDate()).getTime();
          const dayB = new Date(dateB.getFullYear(), dateB.getMonth(), dateB.getDate()).getTime();
          const dayDiff = dayB - dayA;
          
          // Secondary sort: Price ASC (lowest first) when on same day
          if (dayDiff !== 0) return dayDiff;
          return (a.price || 0) - (b.price || 0);
        case 'date-old-new':
          // Primary sort: Date ASC (oldest first)
          const dateA_old = a.publishedDate?.seconds || 0;
          const dateB_old = b.publishedDate?.seconds || 0;
          return dateA_old - dateB_old;
        default:
          // Default: Date (day only) DESC, then Price DESC
          const defaultDateA = new Date((a.publishedDate?.seconds || 0) * 1000);
          const defaultDateB = new Date((b.publishedDate?.seconds || 0) * 1000);
          
          // Normalize to day level (remove time component)
          const defaultDayA = new Date(defaultDateA.getFullYear(), defaultDateA.getMonth(), defaultDateA.getDate()).getTime();
          const defaultDayB = new Date(defaultDateB.getFullYear(), defaultDateB.getMonth(), defaultDateB.getDate()).getTime();
          const defaultDayDiff = defaultDayB - defaultDayA;
          
          // Secondary sort: Price ASC when on same day
          if (defaultDayDiff !== 0) return defaultDayDiff;
          return (a.price || 0) - (b.price || 0);
      }
      });
    }

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

        // Filter out listings without images
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
    // Reset to first page when filters change
    setCurrentPage(1);
  }, [listings, searchResults, useAISearch, sortOrder, priceRange, bedrooms, floorLevel, selectedOutdoorSpaces, minSize, selectedAreas, publishedWithin]);

  // Separate useEffect to update URL parameters only when filter values change
  useEffect(() => {
    updateURLParams();
  }, [sortOrder, priceRange, bedrooms, floorLevel, selectedOutdoorSpaces, minSize, selectedAreas, publishedWithin, updateURLParams]);

  // Note: Removed duplicate effect - filter changes are already handled by the effect on lines 337-344

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

  const handleModalToggle = (isOpen: boolean) => {
    setIsModalOpen(isOpen);
    if (!isOpen) {
      navigate('/');
    }
  };

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
    <Container fluid="xl" style={{ position: 'relative', paddingTop: '0', marginTop: '0' }}>
      {/* Mobile Filters and Map Buttons - Floating over hero
          Only show after the initial listings load has completed to avoid
          any visible vertical "jump" as data and layout settle. */}
      {hasLoadedInitialListings && (
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

            {/* Clear Filters button */}
            <Col lg={1} md={6} className="clear-filters-col">
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
                    setUseAISearch(false);
                    setSearchResults([]);
                  }}
                  style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem', width: '100%', borderRadius: '8px' }}
                >
                  Clear Filters
                </Button>
              </FormGroup>
            </Col>

            </Row>
            
            {/* AI-Powered Search + Map view (desktop/tablet) */}
            <Row className="mt-3 ai-search-row align-items-end">
              <Col lg={8} md={8} sm={12}>
                <FormGroup>
                  <Form.Label className="fw-medium mb-2" style={{ fontSize: '0.85rem' }}>
                    🔍 AI-Powered Search (optional)
                  </Form.Label>
                  <div className="d-flex gap-2">
                    <Form.Control
                      type="text"
                      placeholder={isMobile ? "Search anything…" : "Describe your ideal home (e.g. 'renovated with garden')"}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyPress={(e) => {
                        if (e.key === 'Enter') {
                          performAISearch(searchQuery);
                        }
                      }}
                      style={{
                        borderRadius: '8px',
                        border: '1px solid #dee2e6',
                        fontSize: '0.9rem',
                        padding: '8px 12px'
                      }}
                    />
                    <Button
                      variant="primary"
                      onClick={() => performAISearch(searchQuery)}
                      disabled={isSearching || searchQuery.trim().length < 3}
                      style={{ borderRadius: '8px', padding: '8px 16px' }}
                    >
                      {isSearching ? 'Searching...' : 'Search'}
                    </Button>
                    <Button
                      variant="outline-secondary"
                      size="sm"
                      onClick={() => {
                        // Clear search only, keep filters
                        setSearchQuery('');
                        setUseAISearch(false);
                        setSearchResults([]);
                        
                        // Update URL with cleared search but preserve current filters
                        updateURLWithSearch('');
                      }}
                      style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                    >
                      Clear Search
                    </Button>
                  </div>
                </FormGroup>
              </Col>
              <Col lg={4} md={4} sm={12} className="mt-2 mt-md-0 d-none d-md-flex justify-content-md-end">
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
          </Form>
        </div>
      </div>
      
      {/* Mobile Sort Bar */}
      {hasLoadedInitialListings && filteredListings.length > 0 && (
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
              {sortOrder === 'date-new-old' ? (useAISearch ? 'Best match' : 'Date & Price') :
               sortOrder === 'date-old-new' ? 'Oldest first' :
               sortOrder === 'price-low-high' ? 'Price: Low-High' : 'Price: High-Low'}
            </Dropdown.Toggle>
            <Dropdown.Menu align="end">
              <Dropdown.Item onClick={() => setSortOrder('date-new-old')} active={sortOrder === 'date-new-old'}>
                {useAISearch ? 'Best match' : 'Date & Price'}
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
      {hasLoadedInitialListings && filteredListings.length > 0 && (
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
                  <option value="date-new-old">{useAISearch ? 'Best match' : 'Date & Price'}</option>
                  <option value="date-old-new">Date (Old to New)</option>
                  <option value="price-low-high">Price (Low to High)</option>
                  <option value="price-high-low">Price (High to Low)</option>
                </Form.Control>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Loading message */}
      {!hasLoadedInitialListings && (
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
      {hasLoadedInitialListings && (
        <Row className="listings-grid-row">
          {currentListings.map(listing => (
            <Col key={listing.id} sm={12} md={6} lg={6} xl={4} className="mb-4">
              <ListingCard 
                listing={listing} 
                isAnyModalOpen={isModalOpen}
                onModalToggle={handleModalToggle} 
                forceOpen={listing.id === modalListingId}
                onRequireLogin={onRequireLogin}
              />
            </Col>
          ))}
        </Row>
      )}

      {/* Pagination controls */}
      {hasLoadedInitialListings && totalPages > 1 && (
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
      {filteredListings.length === 0 && 
       ((!useAISearch && hasLoadedInitialListings) || (useAISearch && !isSearching)) && (
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