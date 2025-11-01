import React, { useState, useEffect, useRef } from 'react';
import { Card, Carousel, Modal, Button, Row, Col, Form } from 'react-bootstrap';
import { Listing } from '../types';
import BedIcon from './icons/BedIcon';
import BathIcon from './icons/BathIcon';
import RulerIcon from './icons/RulerIcon';
import LeafIcon from './icons/LeafIcon';
import BoltIcon from './icons/BoltIcon';
import CalendarIcon from './icons/CalendarIcon';
import LayersIcon from './icons/LayersIcon';
import { BuildingIcon } from './icons/BuildingIcon';
import { GlobeIcon } from './icons/GlobeIcon';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { collection, query, where, getDocs, doc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

interface ListingCardProps {
  listing: Listing;
  isAnyModalOpen: boolean;
  onModalToggle: (isOpen: boolean) => void;
  forceOpen?: boolean;
  onUnsave?: (propertyId: string) => void;
  viewingScheduledAt?: {
    seconds: number;
    nanoseconds: number;
    toDate: () => Date;
  };
  onAddToGoogleCalendar?: () => void;
  note?: string;
  onNoteChange?: (note: string) => void;
  isNoteEditing?: boolean;
  onNoteEditStart?: () => void;
  onNoteEditCancel?: () => void;
}

const getOutdoorSpaceString = (listing: Listing) => {
  const outdoorSpaces = [];
  if (listing.hasGarden) outdoorSpaces.push('Garden');
  if (listing.hasRooftopTerrace) outdoorSpaces.push('Rooftop Terrace');
  if (listing.hasBalcony) outdoorSpaces.push('Balcony');

  if (outdoorSpaces.length === 0) return null;

  const area = listing.outdoorSpaceArea ? ` (${listing.outdoorSpaceArea} m²)` : '';
  return `${outdoorSpaces.join(' + ')}${area}`;
};

const ListingCard: React.FC<ListingCardProps> = ({ listing, isAnyModalOpen, onModalToggle, forceOpen, onUnsave, viewingScheduledAt, onAddToGoogleCalendar, note, onNoteChange, isNoteEditing, onNoteEditStart, onNoteEditCancel }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [showFloorPlanModal, setShowFloorPlanModal] = useState(false);
  const [selectedFloorPlanIndex, setSelectedFloorPlanIndex] = useState(0);
  const [isModalDescriptionExpanded, setIsModalDescriptionExpanded] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [floorPlanZoom, setFloorPlanZoom] = useState(1);
  const [isManualNavigation, setIsManualNavigation] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [savedPropertyId, setSavedPropertyId] = useState<string | null>(null);
  const [showUnsaveConfirm, setShowUnsaveConfirm] = useState(false);
  const [noteText, setNoteText] = useState('');
  const hasHandledForceOpen = useRef(false);
  const clickedImageIndex = useRef(0);
  const originalSearchParamsRef = useRef<string>(''); // Store original search params when opening modal
  
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { currentUser } = useAuth();
  const publishedDate = listing.publishedDate ? listing.publishedDate.toDate() : null;
  const outdoorSpaceString = getOutdoorSpaceString(listing);
  
  // Check if address or outdoor space is long to adjust summary text length
  const hasLongAddress = listing.address && listing.address.length > 28;
  const hasLongOutdoorSpace = outdoorSpaceString && outdoorSpaceString.length > 20;
  const shouldReduceSummaryText = hasLongAddress || hasLongOutdoorSpace;
  
  // Adjust summary text length based on content
  const summaryTextLength = shouldReduceSummaryText ? 180 : 220;

  const mapUrl = listing.coordinates?.lat && listing.coordinates?.lon
    ? `https://maps.google.com/maps?q=${listing.coordinates.lat},${listing.coordinates.lon}&z=15&output=embed`
    : listing.googleMapsUrl;

  // Initialize original search params from URL if modal is opened via URL
  useEffect(() => {
    // If we're on a listing page and haven't stored original params yet, use current URL params
    if (location.pathname.startsWith('/listings/') && !originalSearchParamsRef.current && location.search) {
      // Extract params but remove the listing ID path - we want the base params
      // When on listing page, we need to figure out what the original page params were
      // For now, just store the current params minus any listing-specific ones
      originalSearchParamsRef.current = location.search;
    }
  }, [location.pathname, location.search]);

  // Sync noteText with note prop when editing starts
  useEffect(() => {
    if (isNoteEditing && note !== undefined) {
      setNoteText(note || '');
    }
  }, [isNoteEditing, note]);

  useEffect(() => {
    if (forceOpen && !hasHandledForceOpen.current) {
      handleShowModal(clickedImageIndex.current);
      hasHandledForceOpen.current = true;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forceOpen]);

  // Detect mobile screen size
  useEffect(() => {
    const checkIsMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    
    checkIsMobile();
    window.addEventListener('resize', checkIsMobile);
    
    return () => window.removeEventListener('resize', checkIsMobile);
  }, []);

  // Check if property is saved
  useEffect(() => {
    const checkIfSaved = async () => {
      if (!currentUser) {
        setIsSaved(false);
        return;
      }

      try {
        const q = query(
          collection(db, 'savedProperties'),
          where('userId', '==', currentUser.uid),
          where('listingId', '==', listing.id)
        );
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
          setIsSaved(true);
          setSavedPropertyId(querySnapshot.docs[0].id);
        } else {
          setIsSaved(false);
          setSavedPropertyId(null);
        }
      } catch (error) {
        console.error('Error checking if saved:', error);
      }
    };

    checkIfSaved();
  }, [currentUser, listing.id]);

  const handleSave = async () => {
    if (!currentUser) {
      alert('Please log in to save properties');
      navigate('/login');
      return;
    }

    try {
      if (isSaved && savedPropertyId) {
        // Unsave - show confirmation if onUnsave callback is provided (saved properties page)
        if (onUnsave) {
          setShowUnsaveConfirm(true);
        } else {
          // Direct unsave for main listings page
          await deleteDoc(doc(db, 'savedProperties', savedPropertyId));
          setIsSaved(false);
          setSavedPropertyId(null);
        }
      } else {
        // Save
        const savedPropertyRef = doc(collection(db, 'savedProperties'));
        await setDoc(savedPropertyRef, {
          userId: currentUser.uid,
          listingId: listing.id,
          status: 'to contact',
          addedAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        setIsSaved(true);
        setSavedPropertyId(savedPropertyRef.id);
      }
    } catch (error) {
      console.error('Error saving/unsaving property:', error);
      alert('Failed to save property');
    }
  };

  const handleConfirmUnsave = async () => {
    if (!savedPropertyId || !onUnsave) return;
    
    try {
      onUnsave(savedPropertyId);
      setIsSaved(false);
      setSavedPropertyId(null);
      setShowUnsaveConfirm(false);
    } catch (error) {
      console.error('Error unsaving property:', error);
      alert('Failed to unsave property');
    }
  };

  const handleShowModal = (imageIndex: number = 0) => {
    clickedImageIndex.current = imageIndex;
    setSelectedImageIndex(imageIndex);
    setShowModal(true);
    onModalToggle(true);
    setIsManualNavigation(false);
    // Only navigate if we're not on the saved properties page
    if (location.pathname !== '/saved-properties') {
      // Store original search params (including search query) before navigation
      // Use location.search to get the actual URL query string, not searchParams which might be missing params
      originalSearchParamsRef.current = location.search;
      // Preserve all current search parameters when navigating to listing
      // If location.search exists, use it; otherwise construct from searchParams
      const paramsString = location.search ? location.search.substring(1) : searchParams.toString();
      navigate(`/listings/${listing.id}${paramsString ? `?${paramsString}` : ''}`);
    }
  };

  const handleHideModal = () => {
    setShowModal(false);
    onModalToggle(false);
    setIsModalDescriptionExpanded(false);
    setIsManualNavigation(false);
    hasHandledForceOpen.current = false;
    // Only navigate back to home if we navigated from home
    if (location.pathname !== '/saved-properties') {
      // Restore original search parameters (including search query) when navigating back
      // Use the stored original params instead of current params (which might be missing search)
      navigate(`/${originalSearchParamsRef.current}`);
    }
  };

  const handleFloorPlanClick = (index: number) => {
    setSelectedFloorPlanIndex(index);
    setFloorPlanZoom(1); // Reset zoom when opening floor plan
    setShowFloorPlanModal(true);
  };

  const handleZoomIn = () => {
    setFloorPlanZoom(prev => Math.min(prev + 0.5, 3)); // Max zoom 3x
  };

  const handleZoomOut = () => {
    setFloorPlanZoom(prev => Math.max(prev - 0.5, 0.5)); // Min zoom 0.5x
  };

  const handleZoomReset = () => {
    setFloorPlanZoom(1);
  };

  const handleCarouselSelect = (selectedIndex: number | null) => {
    setSelectedImageIndex(selectedIndex || 0);
    setIsManualNavigation(true);
    // Reset manual navigation flag after a short delay to allow instant transition
    setTimeout(() => setIsManualNavigation(false), 300);
  };
  return (
    <>
    <Card className="listing-card" style={{ width: '24rem', margin: '1rem' }}>
      <div style={{ position: 'relative' }}>
        <Carousel interval={isAnyModalOpen ? null : 5000}>
          {listing.imageGallery && listing.imageGallery.slice(0, 10).map((url: string, index: number) => (
            <Carousel.Item key={index}>
              <img
                className="d-block w-100 listing-image"
                src={url}
                alt={`Slide ${index}`}
                style={{ 
                  height: '280px', 
                  objectFit: 'cover',
                  cursor: 'pointer' 
                }}
                onClick={() => handleShowModal(index)}
                onLoad={(e) => {
                  const img = e.target as HTMLImageElement;
                  if (img.naturalHeight > img.naturalWidth) {
                    img.style.objectFit = 'contain';
                    img.style.backgroundColor = 'white';
                  }
                }}
              />
            </Carousel.Item>
          ))}
        </Carousel>
        {/* Heart Save Button - Top Right Corner */}
        {currentUser && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleSave();
            }}
            style={{
              position: 'absolute',
              top: '10px',
              right: '10px',
              backgroundColor: 'white',
              border: 'none',
              borderRadius: '50%',
              width: '40px',
              height: '40px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
              transition: 'all 0.2s ease',
              zIndex: 5,
              padding: 0
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.boxShadow = '0 2px 12px rgba(0, 0, 0, 0.25)';
              e.currentTarget.style.transform = 'scale(1.05)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.15)';
              e.currentTarget.style.transform = 'scale(1)';
            }}
            title={isSaved ? 'Remove from saved' : 'Save property'}
          >
            <svg
              width="20"
              height="18"
              viewBox="0 0 24 21"
              fill={isSaved ? '#dc3545' : 'none'}
              stroke={isSaved ? '#dc3545' : '#212529'}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ transition: 'all 0.2s ease' }}
            >
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
          </button>
        )}
      </div>
      <Card.Body>
        <div className="d-flex justify-content-between align-items-baseline">
          <Card.Title 
            style={{ fontSize: '1.1rem', marginRight: '1rem', cursor: 'pointer', textDecoration: 'underline' }}
            onClick={() => handleShowModal()}
          >
            {listing.address}
          </Card.Title>
          <span style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'black', whiteSpace: 'nowrap' }}>
            €{listing.price?.toLocaleString()}
          </span>
        </div>
        {listing.area && <span className="badge bg-secondary mb-2">{listing.area}</span>}
        <div className="mb-2" style={{ fontSize: '0.9rem', fontWeight: 'bold', color: 'black' }}>
          {listing.livingArea && <span style={{ marginRight: '1rem' }}><RulerIcon /> {listing.livingArea} m²</span>}
          {listing.bedrooms && <span style={{ marginRight: '1rem' }}><BedIcon /> {listing.bedrooms}</span>}
          {listing.bathrooms && <span style={{ marginRight: '1rem' }}><BathIcon /> {listing.bathrooms}</span>}
          {listing.energyLabel && <span style={{ marginRight: '1rem' }}><BoltIcon /> {listing.energyLabel}</span>}
        </div>
        <div className="mb-2" style={{ fontSize: '0.9rem', fontWeight: 'bold', color: 'black' }}>
          {listing.apartmentFloor && (
            <span style={{ marginRight: '1rem' }}>
              <BuildingIcon />{' '}
              {typeof listing.apartmentFloor === 'number'
                ? `Floor ${listing.apartmentFloor}`
                : listing.apartmentFloor.toLowerCase().includes('floor')
                ? listing.apartmentFloor
                : `${listing.apartmentFloor} floor`}
            </span>
          )}
          {listing.numberOfStories && listing.numberOfStories >= 2 && (
            <span style={{ marginRight: '1rem' }}><LayersIcon /> {listing.numberOfStories} stories</span>
          )}
          {outdoorSpaceString && <span style={{ marginRight: '0.5rem' }}><LeafIcon /> {outdoorSpaceString}</span>}
        </div>
        <Card.Text style={{ fontSize: '0.85rem' }}>
          {isExpanded ? listing.embeddingText : `${listing.embeddingText.substring(0, summaryTextLength)}...`}
          <Button variant="link" onClick={() => setIsExpanded(!isExpanded)} style={{ fontSize: '0.8rem', verticalAlign: 'baseline', padding: '0 0.2rem' }}>
            {isExpanded ? 'Show Less' : 'Show More'}
          </Button>
        </Card.Text>
        <div className="d-flex justify-content-between align-items-center">
            <Button 
              variant="link" 
              onClick={() => handleShowModal()} 
              style={{ 
                fontSize: '0.8rem', 
                padding: '0', 
                color: '#6c757d',
                textDecoration: 'none'
              }}
              className="p-0"
            >
              View all details
            </Button>
            <small className="text-muted"><CalendarIcon /> {publishedDate?.toLocaleDateString()}</small>
        </div>
        
        {/* Viewing Scheduled Section - Inside Card */}
        {viewingScheduledAt && onAddToGoogleCalendar && (
          <div 
            style={{ 
              borderTop: '1px solid #dee2e6',
              backgroundColor: '#f8f9fa',
              padding: '1rem',
              marginTop: '1rem'
            }}
          >
            <div className="mb-2">
              <small style={{ fontSize: '0.85rem', color: '#495057' }}>
                <strong>Viewing scheduled:</strong>{' '}
                {viewingScheduledAt.toDate().toLocaleString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: false
                }).replace(/,/g, '')}
              </small>
            </div>
            <Button
              variant="outline-primary"
              size="sm"
              onClick={onAddToGoogleCalendar}
              style={{ fontSize: '0.85rem' }}
            >
              📅 Add to Google Calendar
            </Button>
          </div>
        )}

        {/* Personal Note Section - Inside Card */}
        {onNoteChange && (
          <div 
            style={{ 
              borderTop: '1px solid #dee2e6',
              backgroundColor: '#f8f9fa',
              padding: '1rem',
              marginTop: viewingScheduledAt ? '0.5rem' : '1rem'
            }}
          >
            {isNoteEditing ? (
              <div>
                <Form.Control
                  as="textarea"
                  rows={3}
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  placeholder="add a note"
                  style={{
                    fontSize: '0.85rem',
                    marginBottom: '0.5rem',
                    resize: 'vertical',
                    fontFamily: 'system-ui, -apple-system, sans-serif'
                  }}
                />
                <div className="d-flex gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      onNoteChange(noteText);
                      if (onNoteEditCancel) onNoteEditCancel();
                      setNoteText('');
                    }}
                    style={{ fontSize: '0.85rem' }}
                  >
                    Save
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setNoteText(note || '');
                      if (onNoteEditCancel) onNoteEditCancel();
                    }}
                    style={{ fontSize: '0.85rem' }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="d-flex justify-content-between align-items-start">
                <div style={{ flex: 1 }}>
                  {note ? (
                    <p style={{ fontSize: '0.85rem', color: '#495057', margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
                      {note}
                    </p>
                  ) : (
                    <p style={{ fontSize: '0.85rem', color: '#6c757d', margin: 0, fontStyle: 'italic', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
                      Add a note
                    </p>
                  )}
                </div>
                <button
                  onClick={() => {
                    if (onNoteEditStart) {
                      setNoteText(note || '');
                      onNoteEditStart();
                    }
                  }}
                  style={{
                    backgroundColor: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '0.25rem',
                    marginLeft: '0.5rem',
                    display: 'flex',
                    alignItems: 'center',
                    color: '#6c757d'
                  }}
                  title={note ? 'Edit note' : 'Add note'}
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
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                </button>
              </div>
            )}
          </div>
        )}
      </Card.Body>
    </Card>

    <Modal show={showModal} onHide={handleHideModal} size="lg" centered>
        <Modal.Header closeButton>
          <div className="d-flex justify-content-between align-items-center w-100 pr-3">
            <div>
              <Modal.Title>{listing.address}</Modal.Title>
              {listing.area && <span className="badge bg-secondary mt-1">{listing.area}</span>}
            </div>
            <span style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'black', whiteSpace: 'nowrap' }}>
              €{listing.price?.toLocaleString()}
            </span>
          </div>
        </Modal.Header>
        <Modal.Body>
          <div style={{ position: 'relative' }}>
            <Carousel 
              className={`mb-4 ${isManualNavigation ? 'carousel-no-transition' : ''}`}
              activeIndex={selectedImageIndex} 
              onSelect={handleCarouselSelect}
            >
              {listing.imageGallery && listing.imageGallery.map((url: string, index: number) => (
                <Carousel.Item key={index}>
                <img
                  className="d-block w-100 modal-image"
                  src={url}
                  alt={`Slide ${index}`}
                  style={{ 
                    height: '450px',
                    objectFit: 'cover'
                  }}
                  onLoad={(e) => {
                    const img = e.target as HTMLImageElement;
                    if (img.naturalHeight > img.naturalWidth) {
                      img.style.objectFit = 'contain';
                      img.style.backgroundColor = 'white';
                    }
                  }}
                />
                </Carousel.Item>
              ))}
            </Carousel>
            {/* Heart Save Button - Top Right Corner in Modal */}
            {currentUser && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleSave();
                }}
                style={{
                  position: 'absolute',
                  top: '15px',
                  right: '15px',
                  backgroundColor: 'white',
                  border: 'none',
                  borderRadius: '50%',
                  width: '45px',
                  height: '45px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
                  transition: 'all 0.2s ease',
                  zIndex: 10,
                  padding: 0
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = '0 2px 12px rgba(0, 0, 0, 0.25)';
                  e.currentTarget.style.transform = 'scale(1.05)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.15)';
                  e.currentTarget.style.transform = 'scale(1)';
                }}
                title={isSaved ? 'Remove from saved' : 'Save property'}
              >
                <svg
                  width="22"
                  height="20"
                  viewBox="0 0 24 21"
                  fill={isSaved ? '#dc3545' : 'none'}
                  stroke={isSaved ? '#dc3545' : '#212529'}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ transition: 'all 0.2s ease' }}
                >
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                </svg>
              </button>
            )}
            {/* Image counter */}
            {listing.imageGallery && listing.imageGallery.length > 1 && (
              <div
                style={{
                  position: 'absolute',
                  bottom: '10px',
                  right: '10px',
                  backgroundColor: 'rgba(0, 0, 0, 0.7)',
                  color: 'white',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  fontSize: '0.75rem',
                  fontWeight: '500',
                  zIndex: 10
                }}
              >
                {selectedImageIndex + 1} / {listing.imageGallery.length}
              </div>
            )}
          </div>
          <Row>
            <Col md={6}>
              <h5>Details</h5>
              
              {/* Property Specifications */}
              <div className="mb-3">
                <div className="mb-2" style={{ fontSize: '0.9rem', color: 'black' }}>
                  {listing.livingArea && <span style={{ marginRight: '1rem' }}><RulerIcon /> {listing.livingArea} m²</span>}
                  {listing.bedrooms && <span style={{ marginRight: '1rem' }}><BedIcon /> {listing.bedrooms}</span>}
                  {listing.bathrooms && <span style={{ marginRight: '1rem' }}><BathIcon /> {listing.bathrooms}</span>}
                  {listing.energyLabel && <span style={{ marginRight: '1rem' }}><BoltIcon /> {listing.energyLabel}</span>}
                </div>
                <div className="mb-2" style={{ fontSize: '0.9rem', color: 'black' }}>
                  {listing.apartmentFloor && (
                    <span style={{ marginRight: '1rem' }}>
                      <BuildingIcon />{' '}
                      {typeof listing.apartmentFloor === 'number'
                        ? `Floor ${listing.apartmentFloor}`
                        : listing.apartmentFloor.toLowerCase().includes('floor')
                        ? listing.apartmentFloor
                        : `${listing.apartmentFloor} floor`}
                    </span>
                  )}
                  {listing.numberOfStories && listing.numberOfStories >= 2 && (
                    <span style={{ marginRight: '1rem' }}><LayersIcon /> {listing.numberOfStories} stories</span>
                  )}
                  {listing.yearBuilt && <span style={{ marginRight: '1rem' }}><CalendarIcon /> Built {listing.yearBuilt}</span>}
                </div>
                {outdoorSpaceString && (
                  <div className="mb-2" style={{ fontSize: '0.9rem', color: 'black' }}>
                    <span style={{ marginRight: '0.5rem' }}><LeafIcon /> {outdoorSpaceString}</span>
                  </div>
                )}
              </div>

              {/* Additional Information */}
              <div className="mb-3">
                {listing.neighborhood && (
                  <p className="mb-2" style={{ fontSize: '0.9rem' }}>
                    <strong><GlobeIcon /> Neighborhood:</strong> {listing.neighborhood}
                  </p>
                )}
                {listing.vveContribution && (
                  <p className="mb-2" style={{ fontSize: '0.9rem' }}>
                    <strong>VVE Contribution:</strong> €{listing.vveContribution} per month
                  </p>
                )}
                <p className="mb-2" style={{ fontSize: '0.9rem' }}>
                  <strong>Agent:</strong> {listing.agentUrl ? <a href={listing.agentUrl} target="_blank" rel="noopener noreferrer">{listing.agentName}</a> : listing.agentName}
                </p>
                <Card.Link href={listing.url} target="_blank">View on Funda</Card.Link>
              </div>
              
              <hr />
              
              <h5>Full Description</h5>
              <p style={{ fontSize: '0.9rem', lineHeight: '1.5' }}>
                {listing.cleanedDescription && (
                  <>
                    {(() => {
                      const characterLimit = isMobile ? 500 : 1000;
                      const shouldShowButton = listing.cleanedDescription.length > characterLimit;
                      
                      return (
                        <>
                          {isModalDescriptionExpanded 
                            ? listing.cleanedDescription 
                            : `${listing.cleanedDescription.substring(0, characterLimit)}...`
                          }
                          {shouldShowButton && (
                            <Button 
                              variant="link" 
                              onClick={() => setIsModalDescriptionExpanded(!isModalDescriptionExpanded)} 
                              style={{ fontSize: '0.85rem', verticalAlign: 'baseline', padding: '0 0.2rem' }}
                            >
                              {isModalDescriptionExpanded ? 'Show Less' : 'Show More'}
                            </Button>
                          )}
                        </>
                      );
                    })()}
                  </>
                )}
              </p>
            </Col>
            <Col md={6}>
              {mapUrl && (
                <>
                  <h5>Location</h5>
                  <iframe
                    src={mapUrl}
                    width="100%"
                    height="300"
                    style={{ border: 0 }}
                    allowFullScreen={false}
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    title={`Map of ${listing.address}`}
                  ></iframe>
                </>
              )}
              {listing.floorPlans && listing.floorPlans.length > 0 && (
                <>
                  <h5 className="mt-4">Floor Plans</h5>
                  <Carousel indicators={listing.floorPlans.length > 1} controls={listing.floorPlans.length > 1}>
                    {listing.floorPlans.map((url, index) => (
                      <Carousel.Item key={index}>
                        <img
                          className="d-block w-100"
                          src={url}
                          alt={`Floor Plan ${index + 1}`}
                          style={{ maxHeight: '350px', objectFit: 'contain', cursor: 'pointer' }}
                          onClick={() => handleFloorPlanClick(index)}
                        />
                      </Carousel.Item>
                    ))}
                  </Carousel>
                </>
              )}
            </Col>
          </Row>
        </Modal.Body>
      </Modal>

      {/* Floor Plan Modal */}
      <Modal show={showFloorPlanModal} onHide={() => setShowFloorPlanModal(false)} size="xl" centered>
        <Modal.Header closeButton>
          <div className="d-flex justify-content-between align-items-center w-100">
            <Modal.Title>Floor Plan {selectedFloorPlanIndex + 1}</Modal.Title>
            <div className="d-flex gap-2">
              <Button variant="outline-secondary" size="sm" onClick={handleZoomOut} disabled={floorPlanZoom <= 0.5}>
                🔍-
              </Button>
              <Button variant="outline-secondary" size="sm" onClick={handleZoomReset}>
                Reset ({Math.round(floorPlanZoom * 100)}%)
              </Button>
              <Button variant="outline-secondary" size="sm" onClick={handleZoomIn} disabled={floorPlanZoom >= 3}>
                🔍+
              </Button>
            </div>
          </div>
        </Modal.Header>
        <Modal.Body className="text-center" style={{ overflow: 'auto', maxHeight: '80vh' }}>
          {listing.floorPlans && listing.floorPlans[selectedFloorPlanIndex] && (
            <div style={{ transform: `scale(${floorPlanZoom})`, transformOrigin: 'center', transition: 'transform 0.2s ease' }}>
              <img
                src={listing.floorPlans[selectedFloorPlanIndex]}
                alt={`Floor Plan ${selectedFloorPlanIndex + 1}`}
                style={{ 
                  maxWidth: '100%', 
                  maxHeight: '80vh', 
                  objectFit: 'contain',
                  cursor: 'move'
                }}
                draggable={false}
              />
            </div>
          )}
        </Modal.Body>
      </Modal>

      {/* Unsave Confirmation Modal */}
      <Modal show={showUnsaveConfirm} onHide={() => setShowUnsaveConfirm(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Remove from Saved?</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p>Are you sure you want to remove this property from your saved properties?</p>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowUnsaveConfirm(false)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleConfirmUnsave}>
            Remove
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
};

export default ListingCard;
