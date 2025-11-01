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

const Listings = () => {
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
  const [isModalOpen, setIsModalOpen] = useState(!!modalListingId);
  const [showFilters, setShowFilters] = useState(false);
  const [showNeighborhoodMap, setShowNeighborhoodMap] = useState(false);
  const [allNeighborhoods, setAllNeighborhoods] = useState<string[]>([]);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;

  // Load saved preferences on mount if logged in and no URL params
  useEffect(() => {
    if (preferencesLoading || preferencesLoadedRef.current) return;
    
    const hasURLParams = searchParams.get('minPrice') || searchParams.get('maxPrice') || 
                         searchParams.get('bedrooms') || searchParams.get('floor') || 
                         searchParams.get('outdoor') || searchParams.get('minSize') || 
                         searchParams.get('areas') || searchParams.get('sort') || searchParams.get('search');
    
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
      if (savedPreferences.searchQuery) {
        setSearchQuery(savedPreferences.searchQuery);
      }
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
      const q = query(
        collection(db, "listings"), 
        where("status", "==", "processed"),
        where("available", "==", true)
      );
      const querySnapshot = await getDocs(q);
      const listingsData = querySnapshot.docs
        .map(doc => {
          const { publishDate, ...rest } = doc.data();
          let finalPublishedDate;

          if (typeof publishDate === 'string') {
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
    };

    fetchListings();
  }, []);

  // URL params update function (for filter changes, not search queries)
  const updateURLParams = useCallback(() => {
    const params = new URLSearchParams();
    if (sortOrder !== 'date-new-old') params.set('sort', sortOrder);
    if (priceRange.min !== 400000) params.set('minPrice', priceRange.min.toString());
    if (priceRange.max !== 1250000) params.set('maxPrice', priceRange.max.toString());
    if (bedrooms !== '1+') params.set('bedrooms', bedrooms);
    if (floorLevel !== 'any') params.set('floor', floorLevel);
    if (selectedOutdoorSpaces.length > 0) params.set('outdoor', selectedOutdoorSpaces.join(','));
    if (minSize) params.set('minSize', minSize);
    if (selectedAreas.length > 0) params.set('areas', selectedAreas.join(','));
    // Keep existing search query if present
    const currentSearch = searchParams.get('search');
    if (currentSearch) params.set('search', currentSearch);
    setSearchParams(params, { replace: true });
  }, [sortOrder, priceRange, bedrooms, floorLevel, selectedOutdoorSpaces, minSize, selectedAreas, setSearchParams, searchParams]);

  // Separate function for updating URL with search query
  const updateURLWithSearch = useCallback((query: string) => {
    const params = new URLSearchParams();
    if (sortOrder !== 'date-new-old') params.set('sort', sortOrder);
    if (priceRange.min !== 400000) params.set('minPrice', priceRange.min.toString());
    if (priceRange.max !== 1250000) params.set('maxPrice', priceRange.max.toString());
    if (bedrooms !== '1+') params.set('bedrooms', bedrooms);
    if (floorLevel !== 'any') params.set('floor', floorLevel);
    if (selectedOutdoorSpaces.length > 0) params.set('outdoor', selectedOutdoorSpaces.join(','));
    if (minSize) params.set('minSize', minSize);
    if (selectedAreas.length > 0) params.set('areas', selectedAreas.join(','));
    if (query) params.set('search', query);
    setSearchParams(params, { replace: true });
  }, [sortOrder, priceRange, bedrooms, floorLevel, selectedOutdoorSpaces, minSize, selectedAreas, setSearchParams]);

  // AI Search function
  const performAISearch = useCallback(async (query: string) => {
    console.log('performAISearch called with:', query);
    
    // Prevent concurrent searches
    if (searchInProgressRef.current) {
      console.log('Search already in progress, skipping...');
      return;
    }
    
    if (!query.trim() || query.trim().length < 3) {
      console.log('Query too short, clearing results');
      setSearchResults([]);
      setUseAISearch(false);
      return;
    }

    console.log('Starting AI search...');
    searchInProgressRef.current = true;
    setIsSearching(true);
    
    // Convert bedroom filter to numeric value for backend compatibility
    const bedroomFilter = bedrooms === 'any' ? 'any' : 
                         bedrooms === '1+' ? '1' :
                         bedrooms === '2+' ? '2' : 
                         bedrooms;
    
    // Check if any filters are active (not default values)
    const hasActiveFilters = bedrooms !== '1+' || 
                            priceRange.min !== 400000 || 
                            priceRange.max !== 1250000 || 
                            floorLevel !== 'any' || 
                            selectedOutdoorSpaces.length > 0 || 
                            minSize !== '' || 
                            selectedAreas.length > 0;
    
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
        areas: selectedAreas
      },
      search_type: hasActiveFilters ? 'filtered' : 'semantic'
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
      
      // Update URL with search query after successful search
      updateURLWithSearch(query.trim());
    } catch (error) {
      console.error('AI Search error:', error);
      setSearchResults([]);
      setUseAISearch(false);
    } finally {
      console.log('Search completed, setting isSearching to false');
      setIsSearching(false);
      searchInProgressRef.current = false;
    }
  }, [priceRange.min, priceRange.max, bedrooms, floorLevel, selectedOutdoorSpaces, minSize, selectedAreas]);

  // Trigger search when component loads with a search query in URL
  useEffect(() => {
    console.log('Component mounted, searchQuery:', searchQuery, 'isSearching:', isSearching, 'hasPerformedInitialSearch:', hasPerformedInitialSearch.current);
    if (searchQuery.trim() && !isSearching && !hasPerformedInitialSearch.current) {
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
  }, [priceRange.min, priceRange.max, bedrooms, floorLevel, selectedOutdoorSpaces, minSize, selectedAreas]);

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
      // Filter out listings without images
      const hasImages = listing.imageGallery && listing.imageGallery.length > 0;
      

      return passesPrice && passesBedrooms && passesFloorLevel && passesOutdoorSpace && passesMinSize && passesArea && hasImages;
    });
    }

    setFilteredListings(result);
    // Reset to first page when filters change
    setCurrentPage(1);
  }, [listings, searchResults, useAISearch, sortOrder, priceRange, bedrooms, floorLevel, selectedOutdoorSpaces, minSize, selectedAreas]);

  // Separate useEffect to update URL parameters only when filter values change
  useEffect(() => {
    updateURLParams();
  }, [sortOrder, priceRange, bedrooms, floorLevel, selectedOutdoorSpaces, minSize, selectedAreas, updateURLParams]);

  // Note: Removed duplicate effect - filter changes are already handled by the effect on lines 337-344

  // Save preferences when they change (debounced)
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
        searchQuery,
        sortOrder
      });
    }, 2000); // Debounce 2 seconds

    return () => clearTimeout(timeoutId);
  }, [priceRange, bedrooms, floorLevel, selectedOutdoorSpaces, minSize, selectedAreas, searchQuery, sortOrder, savePreferences]);

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
    <Container>

      {/* Modern Filter Section - Overlapping Header */}
      <div className="mb-4 p-4 filters-section" style={{ 
        backgroundColor: '#f8f9fa', 
        borderRadius: '12px',
        border: '1px solid #e9ecef',
        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
        marginTop: '-100px',
        position: 'relative',
        zIndex: 10
      }}>
        <div className="d-flex justify-content-between align-items-center mb-3">
          <h6 className="text-muted fw-semibold mb-0" style={{ fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Filter houses
          </h6>
          <div className="d-flex gap-2">
            <Button 
              variant="outline-secondary" 
              size="sm" 
              className="d-md-none filters-toggle-btn"
              onClick={() => setShowFilters(!showFilters)}
              style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
            >
              🔍 {showFilters ? 'Hide' : 'Show'} Filters
            </Button>
          </div>
        </div>
        <div className={`filters-content ${showFilters ? 'show' : ''}`}>
          <Form>
            <Row className="g-2">
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
                <Form.Control 
                  as="select" 
                  value={bedrooms} 
                  onChange={e => setBedrooms(e.target.value)}
                  style={{ 
                    backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3e%3cpath fill='none' stroke='%23343a40' stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='m1 6 7 7 7-7'/%3e%3c/svg%3e")`,
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'right 0.5rem center',
                    backgroundSize: '12px 8px',
                    paddingRight: '1.5rem',
                    borderRadius: '8px',
                    border: '1px solid #dee2e6',
                    fontSize: '0.8rem'
                  }}
                >
                  <option value="any">Any</option>
                  <option value="1+">1+</option>
                  <option value="2+">2+</option>
                  <option value="3+">3+</option>
                  <option value="4+">4+</option>
                </Form.Control>
              </FormGroup>
            </Col>

            {/* Min Size */}
            <Col lg={1} md={6}>
              <FormGroup>
                <Form.Label className="fw-medium mb-2" style={{ fontSize: '0.85rem' }}>Min Size (m²)</Form.Label>
                <Form.Control 
                  type="number"
                  placeholder="Any"
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
                <Form.Control 
                  as="select" 
                  value={floorLevel} 
                  onChange={e => setFloorLevel(e.target.value)}
                  style={{ 
                    backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3e%3cpath fill='none' stroke='%23343a40' stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='m1 6 7 7 7-7'/%3e%3c/svg%3e")`,
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'right 0.5rem center',
                    backgroundSize: '12px 8px',
                    paddingRight: '1.5rem',
                    borderRadius: '8px',
                    border: '1px solid #dee2e6',
                    fontSize: '0.8rem'
                  }}
                >
                  <option value="any">Any</option>
                  <option value="top">Upper</option>
                  <option value="ground">Ground</option>
                </Form.Control>
              </FormGroup>
            </Col>


            {/* Area */}
            <Col lg={2} md={12}>
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

            {/* Clear Filters Button */}
            <Col lg={1} md={12}>
              <FormGroup>
                <Form.Label className="fw-medium mb-2" style={{ fontSize: '0.85rem' }}>&nbsp;</Form.Label>
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
                    setSearchQuery('');
                    setUseAISearch(false);
                    setSearchResults([]);
                  }}
                  style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem', width: '100%' }}
                >
                  Clear Filters
                </Button>
              </FormGroup>
            </Col>
            </Row>
            
            {/* AI-Powered Search */}
            <Row className="mt-3">
              <Col lg={9} md={12}>
                <FormGroup>
                  <Form.Label className="fw-medium mb-2" style={{ fontSize: '0.85rem' }}>
                    🔍 AI-Powered Search (optional)
                  </Form.Label>
                  <div className="d-flex gap-2">
                    <Form.Control
                      type="text"
                      placeholder="Try: 'newly renovated apartment with garden' or 'quiet street with canal views'..."
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
                        setSearchQuery('');
                        setUseAISearch(false);
                        setSearchResults([]);
                        updateURLWithSearch('');
                      }}
                      style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                    >
                      Clear Search
                    </Button>
                  </div>
                </FormGroup>
              </Col>
            </Row>
          </Form>
        </div>
      </div>
      {/* Sort and Pagination info */}
      {filteredListings.length > 0 && (
        <Row className="mb-3">
          <Col>
            <div className="d-flex justify-content-between align-items-center flex-wrap gap-3">
              <div className="d-flex align-items-center gap-3">
                <div>
                  <strong>Showing {startIndex + 1}-{Math.min(endIndex, filteredListings.length)} of {filteredListings.length} listings</strong>
                </div>
                {totalPages > 1 && (
                  <div className="text-muted">
                    Page {currentPage} of {totalPages}
                  </div>
                )}
              </div>
              <div className="d-flex align-items-center gap-2">
                <Form.Label className="mb-0 me-2"><strong>Sort by:</strong></Form.Label>
                <Form.Control 
                  as="select" 
                  value={sortOrder} 
                  onChange={e => setSortOrder(e.target.value)}
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
                </Form.Control>
              </div>
            </div>
          </Col>
        </Row>
      )}

      {/* Listings */}
      <Row>
        {currentListings.map(listing => (
          <Col key={listing.id} sm={12} md={6} lg={6} xl={4}>
            <ListingCard 
              listing={listing} 
              isAnyModalOpen={isModalOpen}
              onModalToggle={handleModalToggle} 
              forceOpen={listing.id === modalListingId}
            />
          </Col>
        ))}
      </Row>

      {/* Pagination controls */}
      {totalPages > 1 && (
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
      {filteredListings.length === 0 && (
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