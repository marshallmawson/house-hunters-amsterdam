import React, { useState, useEffect, useRef } from 'react';
import { Card, Carousel, Modal, Button, Row, Col, Form, Toast } from 'react-bootstrap';
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
  // When true, the card will not sync the URL with the opened/closed modal.
  // Used for contexts like the Map view where we want the modal to open
  // in-place without navigating away from the current route.
  disableRouting?: boolean;
  onUnsave?: (propertyId: string) => void;
  // Optional callback to trigger a global "login required" prompt
  // when an unauthenticated user tries to save a property.
  onRequireLogin?: () => void;
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

const ListingCard: React.FC<ListingCardProps> = ({
  listing,
  isAnyModalOpen,
  onModalToggle,
  forceOpen,
  disableRouting,
  onUnsave,
  onRequireLogin,
  viewingScheduledAt,
  onAddToGoogleCalendar,
  note,
  onNoteChange,
  isNoteEditing,
  onNoteEditStart,
  onNoteEditCancel
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [showFloorPlanModal, setShowFloorPlanModal] = useState(false);
  const [selectedFloorPlanIndex, setSelectedFloorPlanIndex] = useState(0);
  const [showImageModal, setShowImageModal] = useState(false);
  const [selectedImageModalIndex, setSelectedImageModalIndex] = useState(0);
  const [isModalDescriptionExpanded, setIsModalDescriptionExpanded] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [floorPlanZoom, setFloorPlanZoom] = useState(1);
  const [imageZoom, setImageZoom] = useState(1);
  const [imagePanX, setImagePanX] = useState(0);
  const [imagePanY, setImagePanY] = useState(0);
  const [isManualNavigation, setIsManualNavigation] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [savedPropertyId, setSavedPropertyId] = useState<string | null>(null);
  const [showUnsaveConfirm, setShowUnsaveConfirm] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [showGridView, setShowGridView] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const hasHandledForceOpen = useRef(false);
  const clickedImageIndex = useRef(0);
  const originalSearchParamsRef = useRef<string>(''); // Store original search params when opening modal
  const modalBodyRef = useRef<HTMLDivElement>(null);
  const wasGridViewRef = useRef(false);
  const carouselContainerRef = useRef<HTMLDivElement>(null);
  const modalHeaderRef = useRef<HTMLDivElement>(null);
  const imageModalRef = useRef<HTMLDivElement>(null);
  const floorPlanModalRef = useRef<HTMLDivElement>(null);
  const pinchStartDistanceRef = useRef<number | null>(null);
  const pinchStartZoomRef = useRef<number>(1);
  const floorPlanPinchStartDistanceRef = useRef<number | null>(null);
  const floorPlanPinchStartZoomRef = useRef<number>(1);
  const imageDragStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  
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

  // Scroll to top when switching from grid view back to carousel
  useEffect(() => {
    // Only scroll if we were in grid view and now we're not
    if (wasGridViewRef.current && !showGridView && showModal) {
      // Small delay to ensure view transition is complete before scrolling
      setTimeout(() => {
        const modal = document.querySelector('.modal.show');
        if (modal) {
          // Use scrollIntoView on the header - it will automatically find and scroll the scrollable ancestor
          if (modalHeaderRef.current) {
            modalHeaderRef.current.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'nearest' });
          }
          
          // Also explicitly scroll modal-body and modal-content to ensure we're at the top
          const modalBody = modal.querySelector('.modal-body') as HTMLElement;
          const modalContent = modal.querySelector('.modal-content') as HTMLElement;
          
          if (modalBody) {
            modalBody.scrollTo({ top: 0, behavior: 'smooth' });
          }
          if (modalContent) {
            modalContent.scrollTo({ top: 0, behavior: 'smooth' });
          }
        }
      }, 100);
    }
    // Update the ref to track current state
    wasGridViewRef.current = showGridView;
  }, [showGridView, showModal]);

  // Handle keyboard navigation for image modal
  useEffect(() => {
    if (showImageModal && listing.imageGallery) {
      const handleKeyDown = (e: KeyboardEvent) => {
        // Left arrow or 'a' key - previous image
        if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
          e.preventDefault();
          const prevIndex = selectedImageModalIndex > 0 
            ? selectedImageModalIndex - 1 
            : listing.imageGallery.length - 1;
          setSelectedImageModalIndex(prevIndex);
          setImageZoom(1); // Reset zoom when navigating
          setImagePanX(0); // Reset pan when navigating
          setImagePanY(0);
        }
        // Right arrow or 'd' key - next image
        else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
          e.preventDefault();
          const maxIndex = listing.imageGallery.length - 1;
          const nextIndex = selectedImageModalIndex < maxIndex 
            ? selectedImageModalIndex + 1 
            : 0;
          setSelectedImageModalIndex(nextIndex);
          setImageZoom(1); // Reset zoom when navigating
          setImagePanX(0); // Reset pan when navigating
          setImagePanY(0);
        }
        // Escape key - close modal
        else if (e.key === 'Escape') {
          setShowImageModal(false);
        }
      };

      document.addEventListener('keydown', handleKeyDown);
      return () => {
        document.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [showImageModal, selectedImageModalIndex, listing.imageGallery]);

  // Handle keyboard navigation for floor plan modal
  useEffect(() => {
    if (showFloorPlanModal && listing.floorPlans && listing.floorPlans.length > 0) {
      const handleKeyDown = (e: KeyboardEvent) => {
        // Left arrow or 'a' key - previous floor plan
        if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
          e.preventDefault();
          const prevIndex = selectedFloorPlanIndex > 0 
            ? selectedFloorPlanIndex - 1 
            : listing.floorPlans!.length - 1;
          setSelectedFloorPlanIndex(prevIndex);
          setFloorPlanZoom(1); // Reset zoom when navigating
        }
        // Right arrow or 'd' key - next floor plan
        else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
          e.preventDefault();
          const maxIndex = listing.floorPlans!.length - 1;
          const nextIndex = selectedFloorPlanIndex < maxIndex 
            ? selectedFloorPlanIndex + 1 
            : 0;
          setSelectedFloorPlanIndex(nextIndex);
          setFloorPlanZoom(1); // Reset zoom when navigating
        }
        // Escape key - close modal
        else if (e.key === 'Escape') {
          setShowFloorPlanModal(false);
        }
      };

      document.addEventListener('keydown', handleKeyDown);
      return () => {
        document.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [showFloorPlanModal, selectedFloorPlanIndex, listing.floorPlans]);

  // Prevent page zoom when image modal is open (but allow our custom handlers to work)
  useEffect(() => {
    if (showImageModal && imageModalRef.current) {
      const imageContainer = imageModalRef.current;
      
      // Prevent page zoom on touch devices, but DON'T interfere with image container touches
      // Our custom handlers on the image container will handle pinch-to-zoom
      const preventZoom = (e: TouchEvent) => {
        // Only prevent if we have 2 touches (pinch gesture)
        if (e.touches.length === 2) {
          const target = e.target as HTMLElement;
          // DON'T prevent if the touch is on the image container - let our custom handlers work
          if (!imageContainer.contains(target) && target !== imageContainer) {
            e.preventDefault();
            e.stopPropagation();
          }
          // If it IS on the image container, let it through to our custom handlers
        }
      };

      // Prevent wheel zoom (Ctrl/Cmd + wheel) everywhere except on the image container
      const preventWheelZoom = (e: WheelEvent) => {
        if (e.ctrlKey || e.metaKey) {
          const target = e.target as HTMLElement;
          // Don't prevent if the event is on the image container - let our handler deal with it
          if (!imageContainer.contains(target) && target !== imageContainer) {
            e.preventDefault();
            e.stopPropagation();
          }
          // If it IS on the image container, let our custom handler deal with it
        }
      };

      // Use capture phase to catch events early, but don't stop propagation for image container
      document.addEventListener('touchstart', preventZoom, { passive: false, capture: true });
      document.addEventListener('touchmove', preventZoom, { passive: false, capture: true });
      document.addEventListener('wheel', preventWheelZoom, { passive: false, capture: true });

      return () => {
        document.removeEventListener('touchstart', preventZoom, { capture: true } as EventListenerOptions);
        document.removeEventListener('touchmove', preventZoom, { capture: true } as EventListenerOptions);
        document.removeEventListener('wheel', preventWheelZoom, { capture: true } as EventListenerOptions);
      };
    }
  }, [showImageModal]);

  // Prevent page zoom when floor plan modal is open (but allow our custom handlers to work)
  useEffect(() => {
    if (showFloorPlanModal && floorPlanModalRef.current) {
      const floorPlanContainer = floorPlanModalRef.current;
      
      // Prevent page zoom on touch devices, but DON'T interfere with floor plan container touches
      // Our custom handlers on the floor plan container will handle pinch-to-zoom
      const preventZoom = (e: TouchEvent) => {
        // Only prevent if we have 2 touches (pinch gesture)
        if (e.touches.length === 2) {
          const target = e.target as HTMLElement;
          // DON'T prevent if the touch is on the floor plan container - let our custom handlers work
          if (!floorPlanContainer.contains(target) && target !== floorPlanContainer) {
            e.preventDefault();
            e.stopPropagation();
          }
          // If it IS on the floor plan container, let it through to our custom handlers
        }
      };

      // Prevent wheel zoom (Ctrl/Cmd + wheel) everywhere except on the floor plan container
      const preventWheelZoom = (e: WheelEvent) => {
        if (e.ctrlKey || e.metaKey) {
          const target = e.target as HTMLElement;
          // Don't prevent if the event is on the floor plan container - let our handler deal with it
          if (!floorPlanContainer.contains(target) && target !== floorPlanContainer) {
            e.preventDefault();
            e.stopPropagation();
          }
          // If it IS on the floor plan container, let our custom handler deal with it
        }
      };

      // Use capture phase to catch events early, but don't stop propagation for floor plan container
      document.addEventListener('touchstart', preventZoom, { passive: false, capture: true });
      document.addEventListener('touchmove', preventZoom, { passive: false, capture: true });
      document.addEventListener('wheel', preventWheelZoom, { passive: false, capture: true });

      return () => {
        document.removeEventListener('touchstart', preventZoom, { capture: true } as EventListenerOptions);
        document.removeEventListener('touchmove', preventZoom, { capture: true } as EventListenerOptions);
        document.removeEventListener('wheel', preventWheelZoom, { capture: true } as EventListenerOptions);
      };
    }
  }, [showFloorPlanModal]);

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
      if (onRequireLogin) {
        onRequireLogin();
      } else {
        navigate('/login');
      }
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
          setToastMessage('Removed from Saved Properties');
          setShowToast(true);
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
        setToastMessage('Added to Saved Properties');
        setShowToast(true);
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
      setToastMessage('Removed from Saved Properties');
      setShowToast(true);
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
    // Only navigate if routing is enabled and we're not on the saved properties page
    if (!disableRouting && location.pathname !== '/saved-properties') {
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
    setShowGridView(false);
    hasHandledForceOpen.current = false;
    // Only navigate back if routing is enabled and we navigated from a listings route
    if (!disableRouting && location.pathname !== '/saved-properties') {
      // Restore original search parameters (including search query) when navigating back
      // Use the stored original params instead of current params (which might be missing search)
      navigate(`/${originalSearchParamsRef.current}`);
    }
  };

  const handleGridImageClick = (index: number) => {
    setSelectedImageModalIndex(index);
    setImageZoom(1); // Reset zoom when opening image
    setImagePanX(0); // Reset pan position
    setImagePanY(0); // Reset pan position
    setShowImageModal(true);
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

  const handleImageZoomIn = () => {
    setImageZoom(prev => {
      const newZoom = Math.min(prev + 0.5, 3);
      // Reset pan if zooming out to 1x or less
      if (newZoom <= 1) {
        setImagePanX(0);
        setImagePanY(0);
      }
      return newZoom;
    });
  };

  const handleImageZoomOut = () => {
    setImageZoom(prev => {
      const newZoom = Math.max(prev - 0.5, 0.5);
      // Reset pan if zooming out to 1x or less
      if (newZoom <= 1) {
        setImagePanX(0);
        setImagePanY(0);
      }
      return newZoom;
    });
  };

  // Calculate distance between two touch points
  const getTouchDistance = (touch1: Touch, touch2: Touch): number => {
    const dx = touch2.clientX - touch1.clientX;
    const dy = touch2.clientY - touch1.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  // Setup native touch event listeners for pinch zoom and pan (non-passive)
  useEffect(() => {
    if (showImageModal && imageModalRef.current) {
      const imageContainer = imageModalRef.current;
      
      const handleTouchStart = (e: TouchEvent) => {
        if (e.touches.length === 2) {
          // Pinch gesture - start zoom
          const distance = getTouchDistance(e.touches[0], e.touches[1]);
          pinchStartDistanceRef.current = distance;
          pinchStartZoomRef.current = imageZoom;
          imageDragStartRef.current = null; // Clear drag when pinching
          e.preventDefault();
          e.stopPropagation();
        } else if (e.touches.length === 1 && imageZoom > 1) {
          // Single touch - start pan when zoomed in
          const touch = e.touches[0];
          imageDragStartRef.current = {
            x: touch.clientX,
            y: touch.clientY,
            panX: imagePanX,
            panY: imagePanY
          };
          e.preventDefault();
          e.stopPropagation();
        }
      };

      const handleTouchMove = (e: TouchEvent) => {
        if (e.touches.length === 2 && pinchStartDistanceRef.current !== null) {
          // Pinch gesture - zoom
          const currentDistance = getTouchDistance(e.touches[0], e.touches[1]);
          const scale = currentDistance / pinchStartDistanceRef.current;
          const newZoom = Math.max(0.5, Math.min(3, pinchStartZoomRef.current * scale));
          setImageZoom(newZoom);
          e.preventDefault();
          e.stopPropagation();
        } else if (e.touches.length === 1 && imageDragStartRef.current !== null && imageZoom > 1) {
          // Single touch - pan when zoomed in
          const touch = e.touches[0];
          const deltaX = touch.clientX - imageDragStartRef.current.x;
          const deltaY = touch.clientY - imageDragStartRef.current.y;
          
          // Calculate new pan position with bounds
          // Allow panning up to half the zoomed image size beyond the viewport
          const maxPan = (imageZoom - 1) * 300; // Adjust based on zoom level
          const newPanX = Math.max(-maxPan, Math.min(maxPan, imageDragStartRef.current.panX + deltaX));
          const newPanY = Math.max(-maxPan, Math.min(maxPan, imageDragStartRef.current.panY + deltaY));
          
          setImagePanX(newPanX);
          setImagePanY(newPanY);
          e.preventDefault();
          e.stopPropagation();
        }
      };

      const handleTouchEnd = (e: TouchEvent) => {
        if (e.touches.length < 2) {
          pinchStartDistanceRef.current = null;
        }
        if (e.touches.length === 0) {
          imageDragStartRef.current = null;
        }
      };

      const handleTouchCancel = (e: TouchEvent) => {
        pinchStartDistanceRef.current = null;
        imageDragStartRef.current = null;
      };

      // Mouse events for desktop panning
      const handleMouseDown = (e: MouseEvent) => {
        if (imageZoom > 1 && e.button === 0) { // Left mouse button
          imageDragStartRef.current = {
            x: e.clientX,
            y: e.clientY,
            panX: imagePanX,
            panY: imagePanY
          };
          e.preventDefault();
        }
      };

      const handleMouseMove = (e: MouseEvent) => {
        if (imageDragStartRef.current !== null && imageZoom > 1) {
          const deltaX = e.clientX - imageDragStartRef.current.x;
          const deltaY = e.clientY - imageDragStartRef.current.y;
          
          // Allow panning up to half the zoomed image size beyond the viewport
          const maxPan = (imageZoom - 1) * 300;
          const newPanX = Math.max(-maxPan, Math.min(maxPan, imageDragStartRef.current.panX + deltaX));
          const newPanY = Math.max(-maxPan, Math.min(maxPan, imageDragStartRef.current.panY + deltaY));
          
          setImagePanX(newPanX);
          setImagePanY(newPanY);
          e.preventDefault();
        }
      };

      const handleMouseUp = () => {
        imageDragStartRef.current = null;
      };

      const handleWheel = (e: WheelEvent) => {
        // Check if Ctrl/Cmd is pressed (trackpad pinch gesture)
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          e.stopPropagation();
          
          // Calculate zoom delta from wheel delta
          const zoomDelta = -e.deltaY * 0.01;
          const newZoom = Math.max(0.5, Math.min(3, imageZoom + zoomDelta));
          setImageZoom(newZoom);
          
          // Reset pan when zooming out to 1x
          if (newZoom <= 1) {
            setImagePanX(0);
            setImagePanY(0);
          }
        }
      };

      // Use native event listeners with non-passive option and capture phase
      imageContainer.addEventListener('touchstart', handleTouchStart, { passive: false, capture: true });
      imageContainer.addEventListener('touchmove', handleTouchMove, { passive: false, capture: true });
      imageContainer.addEventListener('touchend', handleTouchEnd, { passive: false, capture: true });
      imageContainer.addEventListener('touchcancel', handleTouchCancel, { passive: false, capture: true });
      imageContainer.addEventListener('mousedown', handleMouseDown, { passive: false });
      imageContainer.addEventListener('mousemove', handleMouseMove, { passive: false });
      imageContainer.addEventListener('mouseup', handleMouseUp);
      imageContainer.addEventListener('mouseleave', handleMouseUp); // Reset on mouse leave
      imageContainer.addEventListener('wheel', handleWheel, { passive: false });

      return () => {
        imageContainer.removeEventListener('touchstart', handleTouchStart, { capture: true } as EventListenerOptions);
        imageContainer.removeEventListener('touchmove', handleTouchMove, { capture: true } as EventListenerOptions);
        imageContainer.removeEventListener('touchend', handleTouchEnd, { capture: true } as EventListenerOptions);
        imageContainer.removeEventListener('touchcancel', handleTouchCancel, { capture: true } as EventListenerOptions);
        imageContainer.removeEventListener('mousedown', handleMouseDown);
        imageContainer.removeEventListener('mousemove', handleMouseMove);
        imageContainer.removeEventListener('mouseup', handleMouseUp);
        imageContainer.removeEventListener('mouseleave', handleMouseUp);
        imageContainer.removeEventListener('wheel', handleWheel);
      };
    }
  }, [showImageModal, imageZoom, imagePanX, imagePanY]);

  // Calculate distance between two touch points for floor plans
  const getFloorPlanTouchDistance = (touch1: Touch, touch2: Touch): number => {
    const dx = touch2.clientX - touch1.clientX;
    const dy = touch2.clientY - touch1.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  // Setup native touch event listeners for floor plan pinch zoom (non-passive)
  useEffect(() => {
    if (showFloorPlanModal && floorPlanModalRef.current) {
      const floorPlanContainer = floorPlanModalRef.current;
      
      const handleTouchStart = (e: TouchEvent) => {
        if (e.touches.length === 2) {
          const distance = getFloorPlanTouchDistance(e.touches[0], e.touches[1]);
          floorPlanPinchStartDistanceRef.current = distance;
          floorPlanPinchStartZoomRef.current = floorPlanZoom;
          e.preventDefault(); // Prevent default pinch behavior
          e.stopPropagation(); // Stop event bubbling
        }
      };

      const handleTouchMove = (e: TouchEvent) => {
        if (e.touches.length === 2 && floorPlanPinchStartDistanceRef.current !== null) {
          const currentDistance = getFloorPlanTouchDistance(e.touches[0], e.touches[1]);
          const scale = currentDistance / floorPlanPinchStartDistanceRef.current;
          const newZoom = Math.max(0.5, Math.min(3, floorPlanPinchStartZoomRef.current * scale));
          setFloorPlanZoom(newZoom);
          e.preventDefault(); // Prevent default pinch behavior
          e.stopPropagation(); // Stop event bubbling
        }
      };

      const handleTouchEnd = (e: TouchEvent) => {
        if (e.touches.length < 2) {
          floorPlanPinchStartDistanceRef.current = null;
        }
      };

      const handleTouchCancel = (e: TouchEvent) => {
        floorPlanPinchStartDistanceRef.current = null;
      };

      const handleWheel = (e: WheelEvent) => {
        // Check if Ctrl/Cmd is pressed (trackpad pinch gesture)
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          e.stopPropagation();
          
          // Calculate zoom delta from wheel delta
          // Negative deltaY means zoom in, positive means zoom out
          const zoomDelta = -e.deltaY * 0.01; // Adjust sensitivity
          const newZoom = Math.max(0.5, Math.min(3, floorPlanZoom + zoomDelta));
          setFloorPlanZoom(newZoom);
        }
      };

      // Use native event listeners with non-passive option and capture phase
      // This ensures we catch events before they bubble
      floorPlanContainer.addEventListener('touchstart', handleTouchStart, { passive: false, capture: true });
      floorPlanContainer.addEventListener('touchmove', handleTouchMove, { passive: false, capture: true });
      floorPlanContainer.addEventListener('touchend', handleTouchEnd, { passive: false, capture: true });
      floorPlanContainer.addEventListener('touchcancel', handleTouchCancel, { passive: false, capture: true });
      floorPlanContainer.addEventListener('wheel', handleWheel, { passive: false });

      return () => {
        floorPlanContainer.removeEventListener('touchstart', handleTouchStart, { capture: true } as EventListenerOptions);
        floorPlanContainer.removeEventListener('touchmove', handleTouchMove, { capture: true } as EventListenerOptions);
        floorPlanContainer.removeEventListener('touchend', handleTouchEnd, { capture: true } as EventListenerOptions);
        floorPlanContainer.removeEventListener('touchcancel', handleTouchCancel, { capture: true } as EventListenerOptions);
        floorPlanContainer.removeEventListener('wheel', handleWheel);
      };
    }
  }, [showFloorPlanModal, floorPlanZoom]);


  const handleCarouselSelect = (selectedIndex: number | null) => {
    setSelectedImageIndex(selectedIndex || 0);
    setIsManualNavigation(true);
    // Reset manual navigation flag after a short delay to allow instant transition
    setTimeout(() => setIsManualNavigation(false), 300);
  };
  return (
    <>
    <Card className="listing-card" style={{ width: '24rem' }}>
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
        {/* Heart Save Button - Top Right Corner (always visible, prompts login when needed) */}
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
      </div>
      <Card.Body style={{ padding: '0.85rem', display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* Header: Address and Price */}
        <div style={{ marginBottom: '0.5rem' }}>
          <div className="d-flex justify-content-between align-items-start">
            <Card.Title 
              style={{ 
                fontSize: '1.05rem', 
                marginRight: '0.75rem', 
                cursor: 'pointer', 
                textDecoration: 'underline',
                marginBottom: '0',
                lineHeight: '1.3',
                fontWeight: '600',
                color: '#4a90e2'
              }}
              onClick={() => handleShowModal()}
            >
              {listing.address}
            </Card.Title>
            <span style={{ 
              fontSize: '1.15rem', 
              fontWeight: 'bold', 
              color: 'black', 
              whiteSpace: 'nowrap'
            }}>
              €{listing.price?.toLocaleString()}
            </span>
          </div>
          
          {/* Neighborhood Badge (left) and Price per m² (right) on same line */}
          <div className="d-flex justify-content-between align-items-center" style={{ marginTop: '0.25rem' }}>
            <div>
              {listing.area && (
                <span className="badge bg-secondary" style={{ 
                  fontSize: '0.7rem', 
                  padding: '0.3rem 0.6rem',
                  borderRadius: '12px',
                  fontWeight: '500'
                }}>
                  {listing.area}
                </span>
              )}
            </div>
            <div>
              {listing.pricePerSquareMeter && (
                <span style={{ 
                  fontSize: '0.75rem', 
                  fontWeight: '500', 
                  color: '#1a202c',
                  whiteSpace: 'nowrap'
                }}>
                  per m² €{listing.pricePerSquareMeter.toLocaleString()}
                </span>
              )}
            </div>
          </div>
        </div>
        
        {/* Main Specs - All inline */}
        <div style={{ 
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.75rem',
          marginBottom: '0.6rem',
          fontSize: '0.8rem',
          fontWeight: '600',
          color: '#1a202c'
        }}>
          {listing.livingArea && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <span style={{ color: '#4a90e2', fontSize: '0.85rem' }}><RulerIcon /></span>
              <span>{listing.livingArea} m²</span>
            </div>
          )}
          {listing.bedrooms && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <span style={{ color: '#4a90e2', fontSize: '0.85rem' }}><BedIcon /></span>
              <span>{listing.bedrooms}</span>
            </div>
          )}
          {listing.bathrooms && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <span style={{ color: '#4a90e2', fontSize: '0.85rem' }}><BathIcon /></span>
              <span>{listing.bathrooms}</span>
            </div>
          )}
          {listing.energyLabel && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <span style={{ color: '#4a90e2', fontSize: '0.85rem' }}><BoltIcon /></span>
              <span>{listing.energyLabel}</span>
            </div>
          )}
        </div>
        
        {/* Floor and Outdoor Info - Same style as main specs */}
        {(listing.apartmentFloor || (listing.numberOfStories && listing.numberOfStories >= 2) || outdoorSpaceString) && (
          <div style={{ 
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.75rem',
            marginBottom: '0.6rem',
            fontSize: '0.75rem',
            fontWeight: '500',
            color: '#1a202c'
          }}>
            {listing.apartmentFloor && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <span style={{ color: '#4a90e2', fontSize: '0.8rem' }}><BuildingIcon /></span>
                <span>
                  {typeof listing.apartmentFloor === 'number'
                    ? `Floor ${listing.apartmentFloor}`
                    : listing.apartmentFloor.toLowerCase().includes('floor')
                    ? listing.apartmentFloor
                    : `${listing.apartmentFloor} floor`}
                </span>
              </div>
            )}
            {listing.numberOfStories && listing.numberOfStories >= 2 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <span style={{ color: '#4a90e2', fontSize: '0.8rem' }}><LayersIcon /></span>
                <span>{listing.numberOfStories} stories</span>
              </div>
            )}
            {outdoorSpaceString && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <span style={{ color: '#4a90e2', fontSize: '0.8rem' }}><LeafIcon /></span>
                <span>{outdoorSpaceString}</span>
              </div>
            )}
          </div>
        )}
        
        {/* Description - Fixed height */}
        <Card.Text style={{ 
          fontSize: '0.8rem', 
          lineHeight: '1.45', 
          marginBottom: '0.5rem', 
          color: '#495057',
          minHeight: '4.6rem',
          maxHeight: '4.6rem',
          overflow: 'hidden',
          display: '-webkit-box',
          WebkitLineClamp: 4,
          WebkitBoxOrient: 'vertical',
          flex: '0 0 auto'
        }}>
          {listing.embeddingText}
        </Card.Text>
        
        {/* Footer: View Details and Date */}
        <div className="d-flex justify-content-between align-items-center" style={{ paddingTop: '0.6rem', borderTop: '1px solid #e9ecef', marginTop: 'auto' }}>
          <Button 
            variant="link" 
            onClick={() => handleShowModal()} 
            style={{ 
              fontSize: '0.75rem', 
              padding: '0', 
              color: '#4a90e2',
              textDecoration: 'none',
              fontWeight: '600'
            }}
            className="p-0"
          >
            View all details →
          </Button>
          <small className="text-muted" style={{ fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
            <CalendarIcon /> {publishedDate?.toLocaleDateString()}
          </small>
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
          <div ref={modalHeaderRef} style={{ width: '100%', paddingRight: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '0.5rem', gap: '0.5rem' }}>
              <Modal.Title style={{ flex: '1 1 auto', minWidth: '0', wordBreak: 'break-word', paddingRight: '0.5rem', fontSize: isMobile ? '0.95rem' : '1.3rem' }}>{listing.address}</Modal.Title>
              <span style={{ fontSize: '1.25rem', fontWeight: 'bold', color: 'black', whiteSpace: 'nowrap', flex: '0 0 auto' }}>
                €{listing.price?.toLocaleString()}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
              <div>
                {listing.area && <span className="badge bg-secondary">{listing.area}</span>}
              </div>
              <div>
                {listing.pricePerSquareMeter && (
                  <span style={{ fontSize: '0.9rem', fontWeight: '500', color: '#1a202c', whiteSpace: 'nowrap' }}>
                    per m² €{listing.pricePerSquareMeter.toLocaleString()}
                  </span>
                )}
              </div>
            </div>
          </div>
        </Modal.Header>
        <Modal.Body>
          <div ref={modalBodyRef} style={{ position: 'relative' }}>
            {showGridView ? (
              // Grid view
              <div style={{ paddingBottom: '1rem' }}>
                <div className="d-flex justify-content-between align-items-center mb-3">
                  <h6 style={{ margin: 0, fontWeight: 'bold' }}>
                    Photos {listing.imageGallery?.length || 0}
                  </h6>
                  <Button
                    variant="link"
                    onClick={() => setShowGridView(false)}
                    style={{
                      fontSize: '0.85rem',
                      padding: 0,
                      textDecoration: 'none',
                      color: '#6c757d'
                    }}
                  >
                    ← Back to carousel
                  </Button>
                </div>
                <div 
                  style={{
                    display: 'grid',
                    gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)',
                    gap: '8px'
                  }}
                >
                  {listing.imageGallery && listing.imageGallery.map((url: string, index: number) => (
                    <img
                      key={index}
                      src={url}
                      alt={`${listing.address} - ${index + 1}`}
                      style={{
                        width: '100%',
                        height: '200px',
                        objectFit: 'cover',
                        cursor: 'pointer',
                        borderRadius: '4px',
                        transition: 'transform 0.2s ease, box-shadow 0.2s ease'
                      }}
                      onClick={() => {
                        handleGridImageClick(index);
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'scale(1.02)';
                        e.currentTarget.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.2)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'scale(1)';
                        e.currentTarget.style.boxShadow = 'none';
                      }}
                      onLoad={(e) => {
                        const img = e.target as HTMLImageElement;
                        if (img.naturalHeight > img.naturalWidth) {
                          img.style.objectFit = 'contain';
                          img.style.backgroundColor = 'white';
                        }
                      }}
                    />
                  ))}
                </div>
              </div>
            ) : (
              // Carousel view
              <>
                <div ref={carouselContainerRef}>
                  <Carousel 
                    className={`mb-4 listing-image-carousel ${isManualNavigation ? 'carousel-no-transition' : ''}`}
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
                        objectFit: 'cover',
                        cursor: 'pointer'
                      }}
                      onClick={(e) => {
                        // Only open if clicking directly on the image, not on carousel controls
                        if (e.target === e.currentTarget || (e.target as HTMLElement).tagName === 'IMG') {
                          handleGridImageClick(index);
                        }
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
                </div>
                {/* Heart Save Button - Top Right Corner in Modal (always visible, prompts login when needed) */}
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
                {/* Image counter and "All images" link */}
                <div
                  style={{
                    position: 'absolute',
                    bottom: '10px',
                    left: '10px',
                    right: '10px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    zIndex: 10
                  }}
                >
                  {listing.imageGallery && listing.imageGallery.length > 1 && (
                    <div
                      style={{
                        backgroundColor: 'rgba(255, 255, 255, 0.85)',
                        color: '#212529',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        fontWeight: '500'
                      }}
                    >
                      {selectedImageIndex + 1} / {listing.imageGallery.length}
                    </div>
                  )}
                  <Button
                    variant="link"
                    onClick={() => setShowGridView(true)}
                    style={{
                      backgroundColor: 'rgba(255, 255, 255, 0.85)',
                      color: '#212529',
                      padding: '4px 12px',
                      borderRadius: '4px',
                      fontSize: '0.75rem',
                      fontWeight: '500',
                      textDecoration: 'none',
                      border: 'none'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.95)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.85)';
                    }}
                  >
                    <span style={{ marginRight: '6px' }}>📷</span>
                    All images
                  </Button>
                </div>
              </>
            )}
          </div>
          <Row>
            <Col md={6}>
              <h5 style={{ 
                fontFamily: 'Playfair Display, serif', 
                fontSize: '1.25rem', 
                fontWeight: '600',
                marginBottom: '0.75rem',
                color: '#1a202c'
              }}>Details</h5>
              
              {/* Property Specifications - Grid Layout */}
              <div style={{ 
                display: 'grid',
                gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                gap: '0.5rem',
                marginBottom: '0.75rem'
              }}>
                {/* Top row: Living Area, Energy Label */}
                {listing.livingArea && (
                  <div style={{ 
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.5rem',
                    backgroundColor: '#f8f9fa',
                    borderRadius: '6px',
                    border: '1px solid #e9ecef'
                  }}>
                    <span style={{ fontSize: '1rem', color: '#4a90e2' }}><RulerIcon /></span>
                    <div style={{ lineHeight: '1.2' }}>
                      <div style={{ fontSize: '0.95rem', fontWeight: '600', color: '#1a202c' }}>
                        {listing.livingArea} m²
                      </div>
                      <div style={{ fontSize: '0.7rem', color: '#6c757d' }}>Living Area</div>
                    </div>
                  </div>
                )}
                
                {listing.energyLabel && (
                  <div style={{ 
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.5rem',
                    backgroundColor: '#f8f9fa',
                    borderRadius: '6px',
                    border: '1px solid #e9ecef'
                  }}>
                    <span style={{ fontSize: '1rem', color: '#4a90e2' }}><BoltIcon /></span>
                    <div style={{ lineHeight: '1.2' }}>
                      <div style={{ fontSize: '0.95rem', fontWeight: '600', color: '#1a202c' }}>
                        {listing.energyLabel}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: '#6c757d' }}>Energy Label</div>
                    </div>
                  </div>
                )}
                
                {/* Bottom row: Bedrooms, Bathrooms */}
                {listing.bedrooms && (
                  <div style={{ 
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.5rem',
                    backgroundColor: '#f8f9fa',
                    borderRadius: '6px',
                    border: '1px solid #e9ecef'
                  }}>
                    <span style={{ fontSize: '1rem', color: '#4a90e2' }}><BedIcon /></span>
                    <div style={{ lineHeight: '1.2' }}>
                      <div style={{ fontSize: '0.95rem', fontWeight: '600', color: '#1a202c' }}>
                        {listing.bedrooms}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: '#6c757d' }}>Bedrooms</div>
                    </div>
                  </div>
                )}
                
                {listing.bathrooms && (
                  <div style={{ 
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.5rem',
                    backgroundColor: '#f8f9fa',
                    borderRadius: '6px',
                    border: '1px solid #e9ecef'
                  }}>
                    <span style={{ fontSize: '1rem', color: '#4a90e2' }}><BathIcon /></span>
                    <div style={{ lineHeight: '1.2' }}>
                      <div style={{ fontSize: '0.95rem', fontWeight: '600', color: '#1a202c' }}>
                        {listing.bathrooms}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: '#6c757d' }}>Bathrooms</div>
                    </div>
                  </div>
                )}
              </div>

              {/* Outdoor Space */}
              {outdoorSpaceString && (
                <div style={{ 
                  marginBottom: '0.75rem',
                  padding: '0.5rem',
                  backgroundColor: '#f8f9fa',
                  borderRadius: '6px',
                  border: '1px solid #e9ecef'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '1rem', color: '#4a90e2', flexShrink: 0 }}><LeafIcon /></span>
                    <div style={{ lineHeight: '1.2', flex: 1 }}>
                      <div style={{ fontSize: '0.7rem', fontWeight: '600', color: '#6c757d', marginBottom: '0.15rem' }}>
                        Outdoor Space
                      </div>
                      <div style={{ fontSize: '0.85rem', color: '#495057', fontWeight: '600' }}>
                        {outdoorSpaceString}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Property Information - 2x2 Grid */}
              {(listing.apartmentFloor || listing.numberOfStories || listing.yearBuilt || listing.vveContribution) && (
                <div style={{ 
                  marginBottom: '0.75rem',
                  padding: '0.65rem',
                  backgroundColor: '#ffffff',
                  borderRadius: '6px',
                  border: '1px solid #e9ecef'
                }}>
                  <div style={{ 
                    fontSize: '0.7rem', 
                    fontWeight: '600', 
                    color: '#6c757d',
                    marginBottom: '0.5rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                  }}>Property Info</div>
                  <div style={{ 
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, 1fr)',
                    gap: '0.5rem'
                  }}>
                    {listing.apartmentFloor && (
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '0.4rem',
                        padding: '0.4rem',
                        backgroundColor: '#f8f9fa',
                        borderRadius: '4px'
                      }}>
                        <span style={{ fontSize: '0.9rem', color: '#4a90e2' }}><BuildingIcon /></span>
                        <span style={{ fontSize: '0.8rem', color: '#495057', lineHeight: '1.2' }}>
                          {typeof listing.apartmentFloor === 'number'
                            ? `Floor ${listing.apartmentFloor}`
                            : listing.apartmentFloor.toLowerCase().includes('floor')
                            ? listing.apartmentFloor
                            : `${listing.apartmentFloor} floor`}
                        </span>
                      </div>
                    )}
                    {listing.numberOfStories && listing.numberOfStories >= 2 && (
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '0.4rem',
                        padding: '0.4rem',
                        backgroundColor: '#f8f9fa',
                        borderRadius: '4px'
                      }}>
                        <span style={{ fontSize: '0.9rem', color: '#4a90e2' }}><LayersIcon /></span>
                        <span style={{ fontSize: '0.8rem', color: '#495057', lineHeight: '1.2' }}>
                          {listing.numberOfStories} stories
                        </span>
                      </div>
                    )}
                    {listing.yearBuilt && (
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '0.4rem',
                        padding: '0.4rem',
                        backgroundColor: '#f8f9fa',
                        borderRadius: '4px'
                      }}>
                        <span style={{ fontSize: '0.9rem', color: '#4a90e2' }}><CalendarIcon /></span>
                        <span style={{ fontSize: '0.8rem', color: '#495057', lineHeight: '1.2' }}>
                          Built {listing.yearBuilt}
                        </span>
                      </div>
                    )}
                    {listing.vveContribution && (
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '0.4rem',
                        padding: '0.4rem',
                        backgroundColor: '#f8f9fa',
                        borderRadius: '4px'
                      }}>
                        <span style={{ fontSize: '0.9rem', color: '#4a90e2' }}>€</span>
                        <span style={{ fontSize: '0.8rem', color: '#495057', lineHeight: '1.2' }}>
                          VVE €{listing.vveContribution}/mo
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Agent Info */}
              <div style={{ 
                marginBottom: '0.5rem',
                fontSize: '0.85rem',
                color: '#495057'
              }}>
                <strong style={{ color: '#1a202c' }}>Agent:</strong>{' '}
                {listing.agentUrl ? (
                  <a 
                    href={listing.agentUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    style={{ color: '#4a90e2', textDecoration: 'none' }}
                  >
                    {listing.agentName}
                  </a>
                ) : listing.agentName}
              </div>

              <a 
                href={listing.url} 
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-block',
                  padding: '0.5rem 1.25rem',
                  backgroundColor: '#4a90e2',
                  color: 'white',
                  textDecoration: 'none',
                  borderRadius: '6px',
                  fontSize: '0.85rem',
                  fontWeight: '600',
                  transition: 'all 0.2s ease',
                  marginBottom: '0.75rem'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#357abd';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(74, 144, 226, 0.3)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#4a90e2';
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                View on Funda →
              </a>
            </Col>
            <Col md={6}>
              {mapUrl && (
                <>
                  <h5 style={{ 
                    fontFamily: 'Playfair Display, serif', 
                    fontSize: '1.25rem', 
                    fontWeight: '600',
                    marginBottom: '0.75rem',
                    color: '#1a202c'
                  }}>Location</h5>
                  <iframe
                    src={mapUrl}
                    width="100%"
                    height="300"
                    style={{ border: 0, borderRadius: '6px', marginBottom: '0.5rem' }}
                    allowFullScreen={false}
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    title={`Map of ${listing.address}`}
                  ></iframe>
                  
                  {/* Neighborhood info directly below map */}
                  {listing.neighborhood && (
                    <div style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '0.4rem',
                      marginBottom: '0.75rem',
                      fontSize: '0.85rem',
                      color: '#495057'
                    }}>
                      <span style={{ fontSize: '0.9rem', color: '#4a90e2' }}><GlobeIcon /></span>
                      <span>
                        <strong style={{ color: '#1a202c' }}>Neighborhood:</strong> {listing.neighborhood}
                      </span>
                    </div>
                  )}
                </>
              )}
            </Col>
          </Row>

          {/* Full Description and Floor Plans Row - Aligned */}
          <Row style={{ marginTop: '1.5rem' }}>
            <Col md={6}>
              <div style={{ 
                borderTop: '1px solid #e9ecef',
                paddingTop: '0.75rem'
              }}>
                <h5 style={{ 
                  fontFamily: 'Playfair Display, serif', 
                  fontSize: '1.25rem', 
                  fontWeight: '600',
                  marginBottom: '0.5rem',
                  color: '#1a202c'
                }}>Full Description</h5>
                <div style={{ 
                  fontSize: '0.9rem', 
                  lineHeight: '1.6',
                  color: '#495057',
                  fontFamily: 'Inter, sans-serif'
                }}>
                  {listing.cleanedDescription && (
                    <>
                      {(() => {
                        const characterLimit = isMobile ? 500 : 1000;
                        const shouldShowButton = listing.cleanedDescription.length > characterLimit;
                        
                        return (
                          <>
                            {isModalDescriptionExpanded 
                              ? listing.cleanedDescription 
                              : `${listing.cleanedDescription.substring(0, characterLimit)}${shouldShowButton ? '...' : ''}`
                            }
                            {shouldShowButton && (
                              <Button 
                                variant="link" 
                                onClick={() => setIsModalDescriptionExpanded(!isModalDescriptionExpanded)} 
                                style={{ 
                                  fontSize: '0.85rem', 
                                  padding: '0.25rem 0',
                                  marginLeft: '0.5rem',
                                  color: '#4a90e2',
                                  textDecoration: 'none',
                                  fontWeight: '600'
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.textDecoration = 'underline';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.textDecoration = 'none';
                                }}
                              >
                                {isModalDescriptionExpanded ? 'Show Less ↑' : 'Show More ↓'}
                              </Button>
                            )}
                          </>
                        );
                      })()}
                    </>
                  )}
                </div>
              </div>
            </Col>

            <Col md={6}>
              {listing.floorPlans && listing.floorPlans.length > 0 && (
                <div style={{ 
                  borderTop: '1px solid #e9ecef',
                  paddingTop: '0.75rem'
                }}>
                  <h5 style={{ 
                    fontFamily: 'Playfair Display, serif', 
                    fontSize: '1.25rem', 
                    fontWeight: '600',
                    marginBottom: '0.75rem',
                    color: '#1a202c'
                  }}>Floor Plans</h5>
                  <Carousel indicators={listing.floorPlans.length > 1} controls={listing.floorPlans.length > 1}>
                    {listing.floorPlans.map((url, index) => (
                      <Carousel.Item key={index}>
                        <img
                          className="d-block w-100"
                          src={url}
                          alt={`Floor Plan ${index + 1}`}
                          style={{ maxHeight: '350px', objectFit: 'contain', cursor: 'pointer', borderRadius: '6px' }}
                          onClick={() => handleFloorPlanClick(index)}
                        />
                      </Carousel.Item>
                    ))}
                  </Carousel>
                </div>
              )}
            </Col>
          </Row>
        </Modal.Body>
      </Modal>

      {/* Image Modal */}
      <Modal 
        show={showImageModal} 
        onHide={() => setShowImageModal(false)} 
        size="xl" 
        centered
        style={{ touchAction: 'manipulation' }}
      >
        <Modal.Header closeButton>
          <Modal.Title style={{ fontSize: '0.9rem', fontWeight: '500' }}>
            Photo {selectedImageModalIndex + 1}
            {listing.imageGallery && listing.imageGallery.length > 1 && ` of ${listing.imageGallery.length}`}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body 
          className="text-center" 
          style={{ 
            overflow: 'auto', 
            maxHeight: '80vh', 
            position: 'relative',
            touchAction: 'manipulation' // Prevent double-tap zoom and other gestures
          }}
        >
          {listing.imageGallery && listing.imageGallery[selectedImageModalIndex] && (
            <>
              <div 
                ref={imageModalRef}
                style={{ 
                  transform: `translate(${imagePanX}px, ${imagePanY}px) scale(${imageZoom})`, 
                  transformOrigin: 'center', 
                  transition: (pinchStartDistanceRef.current === null && imageDragStartRef.current === null) ? 'transform 0.2s ease' : 'none',
                  touchAction: 'none', // Prevent all default touch behaviors on the image container
                  cursor: imageZoom > 1 ? 'move' : 'default'
                }}
              >
                <img
                  src={listing.imageGallery[selectedImageModalIndex]}
                  alt={`Photo ${selectedImageModalIndex + 1}`}
                  style={{ 
                    maxWidth: '100%', 
                    maxHeight: '80vh', 
                    objectFit: 'contain',
                    cursor: 'move',
                    touchAction: 'none', // Prevent default touch behaviors
                    userSelect: 'none' // Prevent text selection
                  }}
                  draggable={false}
                  onLoad={(e) => {
                    const img = e.target as HTMLImageElement;
                    if (img.naturalHeight > img.naturalWidth) {
                      img.style.objectFit = 'contain';
                      img.style.backgroundColor = 'white';
                    }
                  }}
                />
              </div>
              
              {/* Carousel navigation for multiple images */}
              {listing.imageGallery && listing.imageGallery.length > 1 && (
                <>
                  <button
                    onClick={() => {
                      const prevIndex = selectedImageModalIndex > 0 ? selectedImageModalIndex - 1 : (listing.imageGallery?.length || 1) - 1;
                      setSelectedImageModalIndex(prevIndex);
                      setImageZoom(1);
                      setImagePanX(0);
                      setImagePanY(0);
                    }}
                    style={{
                      position: 'absolute',
                      left: '20px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      backgroundColor: 'rgba(255, 255, 255, 0.9)',
                      border: '1px solid rgba(0, 0, 0, 0.2)',
                      borderRadius: '4px',
                      width: '40px',
                      height: '40px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      fontSize: '1.5rem',
                      color: '#212529',
                      zIndex: 10,
                      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 1)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.9)';
                    }}
                  >
                    ‹
                  </button>
                  <button
                    onClick={() => {
                      const maxIndex = (listing.imageGallery?.length || 1) - 1;
                      const nextIndex = selectedImageModalIndex < maxIndex ? selectedImageModalIndex + 1 : 0;
                      setSelectedImageModalIndex(nextIndex);
                      setImageZoom(1);
                      setImagePanX(0);
                      setImagePanY(0);
                    }}
                    style={{
                      position: 'absolute',
                      right: '20px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      backgroundColor: 'rgba(255, 255, 255, 0.9)',
                      border: '1px solid rgba(0, 0, 0, 0.2)',
                      borderRadius: '4px',
                      width: '40px',
                      height: '40px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      fontSize: '1.5rem',
                      color: '#212529',
                      zIndex: 10,
                      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 1)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.9)';
                    }}
                  >
                    ›
                  </button>
                </>
              )}
              
              {/* Zoom controls in bottom right (map-style) */}
              <div
                style={{
                  position: 'absolute',
                  bottom: '20px',
                  right: '20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '2px',
                  zIndex: 10
                }}
              >
                <button
                  onClick={handleImageZoomIn}
                  disabled={imageZoom >= 3}
                  style={{
                    backgroundColor: 'white',
                    border: '1px solid rgba(0, 0, 0, 0.2)',
                    borderRadius: '4px 4px 0 0',
                    width: '36px',
                    height: '36px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: imageZoom >= 3 ? 'not-allowed' : 'pointer',
                    fontSize: '1.2rem',
                    fontWeight: 'bold',
                    color: imageZoom >= 3 ? '#ccc' : '#212529',
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
                    opacity: imageZoom >= 3 ? 0.5 : 1
                  }}
                  onMouseEnter={(e) => {
                    if (imageZoom < 3) {
                      e.currentTarget.style.backgroundColor = '#f8f9fa';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (imageZoom < 3) {
                      e.currentTarget.style.backgroundColor = 'white';
                    }
                  }}
                >
                  +
                </button>
                <button
                  onClick={handleImageZoomOut}
                  disabled={imageZoom <= 0.5}
                  style={{
                    backgroundColor: 'white',
                    border: '1px solid rgba(0, 0, 0, 0.2)',
                    borderRadius: '0 0 4px 4px',
                    width: '36px',
                    height: '36px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: imageZoom <= 0.5 ? 'not-allowed' : 'pointer',
                    fontSize: '1.2rem',
                    fontWeight: 'bold',
                    color: imageZoom <= 0.5 ? '#ccc' : '#212529',
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
                    opacity: imageZoom <= 0.5 ? 0.5 : 1
                  }}
                  onMouseEnter={(e) => {
                    if (imageZoom > 0.5) {
                      e.currentTarget.style.backgroundColor = '#f8f9fa';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (imageZoom > 0.5) {
                      e.currentTarget.style.backgroundColor = 'white';
                    }
                  }}
                >
                  −
                </button>
              </div>
            </>
          )}
        </Modal.Body>
      </Modal>

      {/* Floor Plan Modal */}
      <Modal show={showFloorPlanModal} onHide={() => setShowFloorPlanModal(false)} size="xl" centered>
        <Modal.Header closeButton>
          <Modal.Title style={{ fontSize: '0.9rem', fontWeight: '500' }}>
            Floor Plan {selectedFloorPlanIndex + 1}
            {listing.floorPlans && listing.floorPlans.length > 1 && ` of ${listing.floorPlans.length}`}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body 
          className="text-center" 
          style={{ 
            overflow: 'auto', 
            maxHeight: '80vh', 
            position: 'relative',
            touchAction: 'manipulation' // Prevent double-tap zoom and other gestures
          }}
        >
          {listing.floorPlans && listing.floorPlans[selectedFloorPlanIndex] && (
            <>
              <div 
                ref={floorPlanModalRef}
                style={{ 
                  transform: `scale(${floorPlanZoom})`, 
                  transformOrigin: 'center', 
                  transition: floorPlanPinchStartDistanceRef.current === null ? 'transform 0.2s ease' : 'none',
                  touchAction: 'none' // Prevent all default touch behaviors on the floor plan container
                }}
              >
                <img
                  src={listing.floorPlans[selectedFloorPlanIndex]}
                  alt={`Floor Plan ${selectedFloorPlanIndex + 1}`}
                  style={{ 
                    maxWidth: '100%', 
                    maxHeight: '80vh', 
                    objectFit: 'contain',
                    cursor: 'move',
                    touchAction: 'none', // Prevent default touch behaviors
                    userSelect: 'none' // Prevent text selection
                  }}
                  draggable={false}
                />
              </div>
              
              {/* Carousel navigation for multiple floor plans */}
              {listing.floorPlans && listing.floorPlans.length > 1 && (
                <>
                  <button
                    onClick={() => {
                      const prevIndex = selectedFloorPlanIndex > 0 ? selectedFloorPlanIndex - 1 : (listing.floorPlans?.length || 1) - 1;
                      setSelectedFloorPlanIndex(prevIndex);
                      setFloorPlanZoom(1);
                    }}
                    style={{
                      position: 'absolute',
                      left: '20px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      backgroundColor: 'rgba(255, 255, 255, 0.9)',
                      border: '1px solid rgba(0, 0, 0, 0.2)',
                      borderRadius: '4px',
                      width: '40px',
                      height: '40px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      fontSize: '1.5rem',
                      color: '#212529',
                      zIndex: 10,
                      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 1)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.9)';
                    }}
                  >
                    ‹
                  </button>
                  <button
                    onClick={() => {
                      const maxIndex = (listing.floorPlans?.length || 1) - 1;
                      const nextIndex = selectedFloorPlanIndex < maxIndex ? selectedFloorPlanIndex + 1 : 0;
                      setSelectedFloorPlanIndex(nextIndex);
                      setFloorPlanZoom(1);
                    }}
                    style={{
                      position: 'absolute',
                      right: '20px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      backgroundColor: 'rgba(255, 255, 255, 0.9)',
                      border: '1px solid rgba(0, 0, 0, 0.2)',
                      borderRadius: '4px',
                      width: '40px',
                      height: '40px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      fontSize: '1.5rem',
                      color: '#212529',
                      zIndex: 10,
                      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 1)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.9)';
                    }}
                  >
                    ›
                  </button>
                </>
              )}
              
              {/* Zoom controls in bottom right (map-style) */}
              <div
                style={{
                  position: 'absolute',
                  bottom: '20px',
                  right: '20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '2px',
                  zIndex: 10
                }}
              >
                <button
                  onClick={handleZoomIn}
                  disabled={floorPlanZoom >= 3}
                  style={{
                    backgroundColor: 'white',
                    border: '1px solid rgba(0, 0, 0, 0.2)',
                    borderRadius: '4px 4px 0 0',
                    width: '36px',
                    height: '36px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: floorPlanZoom >= 3 ? 'not-allowed' : 'pointer',
                    fontSize: '1.2rem',
                    fontWeight: 'bold',
                    color: floorPlanZoom >= 3 ? '#ccc' : '#212529',
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
                    opacity: floorPlanZoom >= 3 ? 0.5 : 1
                  }}
                  onMouseEnter={(e) => {
                    if (floorPlanZoom < 3) {
                      e.currentTarget.style.backgroundColor = '#f8f9fa';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (floorPlanZoom < 3) {
                      e.currentTarget.style.backgroundColor = 'white';
                    }
                  }}
                >
                  +
                </button>
                <button
                  onClick={handleZoomOut}
                  disabled={floorPlanZoom <= 0.5}
                  style={{
                    backgroundColor: 'white',
                    border: '1px solid rgba(0, 0, 0, 0.2)',
                    borderRadius: '0 0 4px 4px',
                    width: '36px',
                    height: '36px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: floorPlanZoom <= 0.5 ? 'not-allowed' : 'pointer',
                    fontSize: '1.2rem',
                    fontWeight: 'bold',
                    color: floorPlanZoom <= 0.5 ? '#ccc' : '#212529',
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
                    opacity: floorPlanZoom <= 0.5 ? 0.5 : 1
                  }}
                  onMouseEnter={(e) => {
                    if (floorPlanZoom > 0.5) {
                      e.currentTarget.style.backgroundColor = '#f8f9fa';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (floorPlanZoom > 0.5) {
                      e.currentTarget.style.backgroundColor = 'white';
                    }
                  }}
                >
                  −
                </button>
              </div>
            </>
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

      {/* Toast Notification */}
      <div
        style={{
          position: 'fixed',
          bottom: '20px',
          right: '20px',
          zIndex: 9999
        }}
      >
        <Toast
          show={showToast}
          onClose={() => setShowToast(false)}
          delay={3000}
          autohide
          style={{
            backgroundColor: '#2d3748',
            color: 'white',
            border: 'none',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
            minWidth: 'auto',
            maxWidth: 'fit-content'
          }}
        >
          <Toast.Body style={{ color: 'white', fontWeight: '500', fontSize: '0.9rem', padding: '0.75rem 1rem' }}>
            {toastMessage}
          </Toast.Body>
        </Toast>
      </div>
    </>
  );
};

export default ListingCard;
