import React, { useState, useEffect, useRef } from 'react';
import { Carousel, Modal, Button, Row, Col, Dropdown, Toast } from 'react-bootstrap';
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
import { useNavigate } from 'react-router-dom';
import { useSavedProperty } from '../hooks/useSavedProperty';
import { loadGoogleMapsAPI } from '../config/maps';

interface ListingDetailContentProps {
  listing: Listing;
  isMobile: boolean;
  onRequireLogin?: () => void;
  onUnsave?: (propertyId: string) => void;
  // 'page' = standalone detail page; 'modal' = rendered inside a modal (e.g. map view)
  context: 'page' | 'modal';
  // Called when the user closes the modal (only relevant for context='modal')
  onClose?: () => void;
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

const ListingDetailContent: React.FC<ListingDetailContentProps> = ({
  listing,
  isMobile,
  onRequireLogin,
  onUnsave,
  context,
  onClose,
}) => {
  const navigate = useNavigate();

  // Image carousel / grid view state
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [showGridView, setShowGridView] = useState(false);
  const [isManualNavigation, setIsManualNavigation] = useState(false);
  const wasGridViewRef = useRef(false);

  // Description expand/collapse
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);

  // Fullscreen image modal
  const [showImageModal, setShowImageModal] = useState(false);
  const [selectedImageModalIndex, setSelectedImageModalIndex] = useState(0);
  const [imageZoom, setImageZoom] = useState(1);
  const [imagePanX, setImagePanX] = useState(0);
  const [imagePanY, setImagePanY] = useState(0);

  // Fullscreen floor plan modal
  const [showFloorPlanModal, setShowFloorPlanModal] = useState(false);
  const [selectedFloorPlanIndex, setSelectedFloorPlanIndex] = useState(0);
  const [floorPlanZoom, setFloorPlanZoom] = useState(1);
  const [floorPlanPanX, setFloorPlanPanX] = useState(0);
  const [floorPlanPanY, setFloorPlanPanY] = useState(0);

  // Share menu
  const [showShareMenu, setShowShareMenu] = useState(false);

  // Toast
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastHasLink, setToastHasLink] = useState(false);

  // Refs for touch/pan interactions
  const imageModalRef = useRef<HTMLDivElement>(null);
  const floorPlanModalRef = useRef<HTMLDivElement>(null);
  const carouselContainerRef = useRef<HTMLDivElement>(null);
  const contentTopRef = useRef<HTMLDivElement>(null);
  const pinchStartDistanceRef = useRef<number | null>(null);
  const pinchStartZoomRef = useRef<number>(1);
  const floorPlanPinchStartDistanceRef = useRef<number | null>(null);
  const floorPlanPinchStartZoomRef = useRef<number>(1);
  const floorPlanDragStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const imageDragStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);

  // Detail page map
  const detailMapRef = useRef<HTMLDivElement>(null);
  const detailMapInstanceRef = useRef<google.maps.Map | null>(null);
  const detailMapLocationMarkerRef = useRef<google.maps.Marker | null>(null);
  const [detailMapLocationState, setDetailMapLocationState] = useState<'idle' | 'loading' | 'active' | 'denied'>('idle');

  // Save functionality
  const {
    isSaved,
    showUnsaveConfirm,
    setShowUnsaveConfirm,
    handleSave,
    handleConfirmUnsave,
  } = useSavedProperty(listing.id, { onRequireLogin, onUnsave });

  const outdoorSpaceString = getOutdoorSpaceString(listing);
  const getListingUrl = () => `https://www.huishunters.com/listings/${listing.id}`;

  // Scroll to top when switching from grid view back to carousel
  useEffect(() => {
    if (wasGridViewRef.current && !showGridView && contentTopRef.current) {
      setTimeout(() => {
        contentTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
    wasGridViewRef.current = showGridView;
  }, [showGridView]);

  // Initialize JS API map on listing detail page — deferred until map div is in view
  // so Google Maps cannot steal focus and scroll the page on mobile before the user
  // has scrolled down to the map section.
  useEffect(() => {
    if (!detailMapRef.current || !listing.coordinates?.lat || !listing.coordinates?.lon) return;

    const container = detailMapRef.current;
    const lat = listing.coordinates.lat;
    const lng = listing.coordinates.lon;

    const initMap = () => {
      loadGoogleMapsAPI().then(() => {
        if (!detailMapRef.current || detailMapInstanceRef.current) return;

        const map = new google.maps.Map(detailMapRef.current, {
          zoom: 15,
          center: { lat, lng },
          mapTypeId: google.maps.MapTypeId.ROADMAP,
          gestureHandling: 'greedy',
          styles: [{ featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] }],
          zoomControl: true,
          zoomControlOptions: { position: google.maps.ControlPosition.RIGHT_BOTTOM },
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
        });

        detailMapInstanceRef.current = map;

        new google.maps.Marker({
          position: { lat, lng },
          map,
          title: listing.address,
          icon: {
            url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(
              `<svg width="32" height="40" viewBox="0 0 32 40" xmlns="http://www.w3.org/2000/svg">
                <path d="M16 0C7.163 0 0 7.163 0 16c0 11.045 16 24 16 24s16-12.955 16-24C32 7.163 24.837 0 16 0z" fill="#4a90e2" stroke="#fff" stroke-width="2"/>
                <circle cx="16" cy="16" r="6" fill="#fff"/>
              </svg>`
            ),
            scaledSize: new google.maps.Size(32, 40),
            anchor: new google.maps.Point(16, 40),
          },
        });
      }).catch(() => {});
    };

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          observer.disconnect();
          initMap();
        }
      },
      { rootMargin: '200px' }
    );

    observer.observe(container);

    return () => {
      observer.disconnect();
      if (detailMapLocationMarkerRef.current) {
        detailMapLocationMarkerRef.current.setMap(null);
        detailMapLocationMarkerRef.current = null;
      }
      detailMapInstanceRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keyboard navigation for fullscreen image modal
  useEffect(() => {
    if (!showImageModal || !listing.imageGallery) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        const prevIndex = selectedImageModalIndex > 0 ? selectedImageModalIndex - 1 : listing.imageGallery.length - 1;
        setSelectedImageModalIndex(prevIndex);
        setImageZoom(1); setImagePanX(0); setImagePanY(0);
      } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        const nextIndex = selectedImageModalIndex < listing.imageGallery.length - 1 ? selectedImageModalIndex + 1 : 0;
        setSelectedImageModalIndex(nextIndex);
        setImageZoom(1); setImagePanX(0); setImagePanY(0);
      } else if (e.key === 'Escape') {
        setShowImageModal(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [showImageModal, selectedImageModalIndex, listing.imageGallery]);

  // Keyboard navigation for fullscreen floor plan modal
  useEffect(() => {
    if (!showFloorPlanModal || !listing.floorPlans?.length) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        const prevIndex = selectedFloorPlanIndex > 0 ? selectedFloorPlanIndex - 1 : listing.floorPlans!.length - 1;
        setSelectedFloorPlanIndex(prevIndex);
        setFloorPlanZoom(1); setFloorPlanPanX(0); setFloorPlanPanY(0);
      } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        const nextIndex = selectedFloorPlanIndex < listing.floorPlans!.length - 1 ? selectedFloorPlanIndex + 1 : 0;
        setSelectedFloorPlanIndex(nextIndex);
        setFloorPlanZoom(1); setFloorPlanPanX(0); setFloorPlanPanY(0);
      } else if (e.key === 'Escape') {
        setShowFloorPlanModal(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [showFloorPlanModal, selectedFloorPlanIndex, listing.floorPlans]);

  // Prevent page zoom when image modal is open
  useEffect(() => {
    if (!showImageModal || !imageModalRef.current) return;
    const imageContainer = imageModalRef.current;
    const preventZoom = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        const target = e.target as HTMLElement;
        if (!imageContainer.contains(target) && target !== imageContainer) {
          e.preventDefault(); e.stopPropagation();
        }
      }
    };
    const preventWheelZoom = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        const target = e.target as HTMLElement;
        if (!imageContainer.contains(target) && target !== imageContainer) {
          e.preventDefault(); e.stopPropagation();
        }
      }
    };
    document.addEventListener('touchstart', preventZoom, { passive: false, capture: true });
    document.addEventListener('touchmove', preventZoom, { passive: false, capture: true });
    document.addEventListener('wheel', preventWheelZoom, { passive: false, capture: true });
    return () => {
      document.removeEventListener('touchstart', preventZoom, { capture: true } as EventListenerOptions);
      document.removeEventListener('touchmove', preventZoom, { capture: true } as EventListenerOptions);
      document.removeEventListener('wheel', preventWheelZoom, { capture: true } as EventListenerOptions);
    };
  }, [showImageModal]);

  // Prevent page zoom when floor plan modal is open
  useEffect(() => {
    if (!showFloorPlanModal || !floorPlanModalRef.current) return;
    const floorPlanContainer = floorPlanModalRef.current;
    const preventZoom = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        const target = e.target as HTMLElement;
        if (!floorPlanContainer.contains(target) && target !== floorPlanContainer) {
          e.preventDefault(); e.stopPropagation();
        }
      }
    };
    const preventWheelZoom = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        const target = e.target as HTMLElement;
        if (!floorPlanContainer.contains(target) && target !== floorPlanContainer) {
          e.preventDefault(); e.stopPropagation();
        }
      }
    };
    document.addEventListener('touchstart', preventZoom, { passive: false, capture: true });
    document.addEventListener('touchmove', preventZoom, { passive: false, capture: true });
    document.addEventListener('wheel', preventWheelZoom, { passive: false, capture: true });
    return () => {
      document.removeEventListener('touchstart', preventZoom, { capture: true } as EventListenerOptions);
      document.removeEventListener('touchmove', preventZoom, { capture: true } as EventListenerOptions);
      document.removeEventListener('wheel', preventWheelZoom, { capture: true } as EventListenerOptions);
    };
  }, [showFloorPlanModal]);

  // Reset floor plan pan when zoom goes back to 1x
  useEffect(() => {
    if (floorPlanZoom <= 1) { setFloorPlanPanX(0); setFloorPlanPanY(0); }
  }, [floorPlanZoom]);

  // Touch/mouse events for image fullscreen modal
  useEffect(() => {
    if (!showImageModal || !imageModalRef.current) return;
    const imageContainer = imageModalRef.current;
    const getTouchDistance = (t1: Touch, t2: Touch) => Math.sqrt((t2.clientX - t1.clientX) ** 2 + (t2.clientY - t1.clientY) ** 2);

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        pinchStartDistanceRef.current = getTouchDistance(e.touches[0], e.touches[1]);
        pinchStartZoomRef.current = imageZoom;
        imageDragStartRef.current = null;
        e.preventDefault(); e.stopPropagation();
      } else if (e.touches.length === 1 && imageZoom > 1) {
        const touch = e.touches[0];
        imageDragStartRef.current = { x: touch.clientX, y: touch.clientY, panX: imagePanX, panY: imagePanY };
        e.preventDefault(); e.stopPropagation();
      }
    };
    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && pinchStartDistanceRef.current !== null) {
        const scale = getTouchDistance(e.touches[0], e.touches[1]) / pinchStartDistanceRef.current;
        setImageZoom(Math.max(0.5, Math.min(3, pinchStartZoomRef.current * scale)));
        e.preventDefault(); e.stopPropagation();
      } else if (e.touches.length === 1 && imageDragStartRef.current !== null && imageZoom > 1) {
        const touch = e.touches[0];
        const maxPan = (imageZoom - 1) * 300;
        setImagePanX(Math.max(-maxPan, Math.min(maxPan, imageDragStartRef.current.panX + touch.clientX - imageDragStartRef.current.x)));
        setImagePanY(Math.max(-maxPan, Math.min(maxPan, imageDragStartRef.current.panY + touch.clientY - imageDragStartRef.current.y)));
        e.preventDefault(); e.stopPropagation();
      }
    };
    const handleTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) pinchStartDistanceRef.current = null;
      if (e.touches.length === 0) imageDragStartRef.current = null;
    };
    const handleTouchCancel = () => { pinchStartDistanceRef.current = null; imageDragStartRef.current = null; };
    const handleMouseDown = (e: MouseEvent) => {
      if (imageZoom > 1 && e.button === 0) {
        imageDragStartRef.current = { x: e.clientX, y: e.clientY, panX: imagePanX, panY: imagePanY };
        e.preventDefault();
      }
    };
    const handleMouseMove = (e: MouseEvent) => {
      if (imageDragStartRef.current !== null && imageZoom > 1) {
        const maxPan = (imageZoom - 1) * 300;
        setImagePanX(Math.max(-maxPan, Math.min(maxPan, imageDragStartRef.current.panX + e.clientX - imageDragStartRef.current.x)));
        setImagePanY(Math.max(-maxPan, Math.min(maxPan, imageDragStartRef.current.panY + e.clientY - imageDragStartRef.current.y)));
        e.preventDefault();
      }
    };
    const handleMouseUp = () => { imageDragStartRef.current = null; };
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault(); e.stopPropagation();
        const newZoom = Math.max(0.5, Math.min(3, imageZoom + (-e.deltaY * 0.01)));
        setImageZoom(newZoom);
        if (newZoom <= 1) { setImagePanX(0); setImagePanY(0); }
      }
    };
    imageContainer.addEventListener('touchstart', handleTouchStart, { passive: false, capture: true });
    imageContainer.addEventListener('touchmove', handleTouchMove, { passive: false, capture: true });
    imageContainer.addEventListener('touchend', handleTouchEnd, { passive: false, capture: true });
    imageContainer.addEventListener('touchcancel', handleTouchCancel, { passive: false, capture: true });
    imageContainer.addEventListener('mousedown', handleMouseDown, { passive: false });
    imageContainer.addEventListener('mousemove', handleMouseMove, { passive: false });
    imageContainer.addEventListener('mouseup', handleMouseUp);
    imageContainer.addEventListener('mouseleave', handleMouseUp);
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
  }, [showImageModal, imageZoom, imagePanX, imagePanY]);

  // Touch/mouse events for floor plan fullscreen modal
  useEffect(() => {
    if (!showFloorPlanModal || !floorPlanModalRef.current) return;
    const floorPlanContainer = floorPlanModalRef.current;
    const getTouchDistance = (t1: Touch, t2: Touch) => Math.sqrt((t2.clientX - t1.clientX) ** 2 + (t2.clientY - t1.clientY) ** 2);

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        floorPlanPinchStartDistanceRef.current = getTouchDistance(e.touches[0], e.touches[1]);
        floorPlanPinchStartZoomRef.current = floorPlanZoom;
        floorPlanDragStartRef.current = null;
        e.preventDefault(); e.stopPropagation();
      } else if (e.touches.length === 1 && floorPlanZoom > 1) {
        const touch = e.touches[0];
        floorPlanDragStartRef.current = { x: touch.clientX, y: touch.clientY, panX: floorPlanPanX, panY: floorPlanPanY };
        e.preventDefault(); e.stopPropagation();
      }
    };
    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && floorPlanPinchStartDistanceRef.current !== null) {
        const scale = getTouchDistance(e.touches[0], e.touches[1]) / floorPlanPinchStartDistanceRef.current;
        setFloorPlanZoom(Math.max(0.5, Math.min(3, floorPlanPinchStartZoomRef.current * scale)));
        e.preventDefault(); e.stopPropagation();
      } else if (e.touches.length === 1 && floorPlanDragStartRef.current !== null && floorPlanZoom > 1) {
        const touch = e.touches[0];
        const maxPan = (floorPlanZoom - 1) * 300;
        setFloorPlanPanX(Math.max(-maxPan, Math.min(maxPan, floorPlanDragStartRef.current.panX + touch.clientX - floorPlanDragStartRef.current.x)));
        setFloorPlanPanY(Math.max(-maxPan, Math.min(maxPan, floorPlanDragStartRef.current.panY + touch.clientY - floorPlanDragStartRef.current.y)));
        e.preventDefault(); e.stopPropagation();
      }
    };
    const handleTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) floorPlanPinchStartDistanceRef.current = null;
      if (e.touches.length === 0) floorPlanDragStartRef.current = null;
    };
    const handleTouchCancel = () => { floorPlanPinchStartDistanceRef.current = null; floorPlanDragStartRef.current = null; };
    const handleMouseDown = (e: MouseEvent) => {
      if (floorPlanZoom > 1 && e.button === 0) {
        floorPlanDragStartRef.current = { x: e.clientX, y: e.clientY, panX: floorPlanPanX, panY: floorPlanPanY };
        e.preventDefault();
      }
    };
    const handleMouseMove = (e: MouseEvent) => {
      if (floorPlanDragStartRef.current !== null && floorPlanZoom > 1) {
        const maxPan = (floorPlanZoom - 1) * 300;
        setFloorPlanPanX(Math.max(-maxPan, Math.min(maxPan, floorPlanDragStartRef.current.panX + e.clientX - floorPlanDragStartRef.current.x)));
        setFloorPlanPanY(Math.max(-maxPan, Math.min(maxPan, floorPlanDragStartRef.current.panY + e.clientY - floorPlanDragStartRef.current.y)));
        e.preventDefault();
      }
    };
    const handleMouseUp = () => { floorPlanDragStartRef.current = null; };
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault(); e.stopPropagation();
        const newZoom = Math.max(0.5, Math.min(3, floorPlanZoom + (-e.deltaY * 0.01)));
        setFloorPlanZoom(newZoom);
        if (newZoom <= 1) { setFloorPlanPanX(0); setFloorPlanPanY(0); }
      }
    };
    floorPlanContainer.addEventListener('touchstart', handleTouchStart, { passive: false, capture: true });
    floorPlanContainer.addEventListener('touchmove', handleTouchMove, { passive: false, capture: true });
    floorPlanContainer.addEventListener('touchend', handleTouchEnd, { passive: false, capture: true });
    floorPlanContainer.addEventListener('touchcancel', handleTouchCancel, { passive: false, capture: true });
    floorPlanContainer.addEventListener('mousedown', handleMouseDown);
    floorPlanContainer.addEventListener('mousemove', handleMouseMove);
    floorPlanContainer.addEventListener('mouseup', handleMouseUp);
    floorPlanContainer.addEventListener('mouseleave', handleMouseUp);
    floorPlanContainer.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      floorPlanContainer.removeEventListener('touchstart', handleTouchStart, { capture: true } as EventListenerOptions);
      floorPlanContainer.removeEventListener('touchmove', handleTouchMove, { capture: true } as EventListenerOptions);
      floorPlanContainer.removeEventListener('touchend', handleTouchEnd, { capture: true } as EventListenerOptions);
      floorPlanContainer.removeEventListener('touchcancel', handleTouchCancel, { capture: true } as EventListenerOptions);
      floorPlanContainer.removeEventListener('mousedown', handleMouseDown);
      floorPlanContainer.removeEventListener('mousemove', handleMouseMove);
      floorPlanContainer.removeEventListener('mouseup', handleMouseUp);
      floorPlanContainer.removeEventListener('mouseleave', handleMouseUp);
      floorPlanContainer.removeEventListener('wheel', handleWheel);
    };
  }, [showFloorPlanModal, floorPlanZoom, floorPlanPanX, floorPlanPanY]);

  // ---- Event handlers ----

  const handleCarouselSelect = (selectedIndex: number | null) => {
    setSelectedImageIndex(selectedIndex || 0);
    setIsManualNavigation(true);
    setTimeout(() => setIsManualNavigation(false), 300);
  };

  const handleGridImageClick = (index: number) => {
    setSelectedImageModalIndex(index);
    setImageZoom(1); setImagePanX(0); setImagePanY(0);
    setShowImageModal(true);
  };

  const handleFloorPlanClick = (index: number) => {
    setSelectedFloorPlanIndex(index);
    setFloorPlanZoom(1); setFloorPlanPanX(0); setFloorPlanPanY(0);
    setShowFloorPlanModal(true);
  };

  const handleZoomIn = () => setFloorPlanZoom(prev => Math.min(prev + 0.5, 3));
  const handleZoomOut = () => setFloorPlanZoom(prev => Math.max(prev - 0.5, 0.5));
  const handleImageZoomIn = () => setImageZoom(prev => { const n = Math.min(prev + 0.5, 3); if (n <= 1) { setImagePanX(0); setImagePanY(0); } return n; });
  const handleImageZoomOut = () => setImageZoom(prev => { const n = Math.max(prev - 0.5, 0.5); if (n <= 1) { setImagePanX(0); setImagePanY(0); } return n; });

  const handleCopyURL = async () => {
    try {
      await navigator.clipboard.writeText(getListingUrl());
      setToastMessage('URL copied to clipboard!'); setToastHasLink(false); setShowToast(true); setShowShareMenu(false);
    } catch {
      setToastMessage('Failed to copy URL'); setToastHasLink(false); setShowToast(true);
    }
  };

  const handleShareWhatsApp = () => {
    const url = getListingUrl();
    window.open(`https://wa.me/?text=${encodeURIComponent(`Check out this property: ${listing.address} - €${listing.price?.toLocaleString()} ${url}`)}`, '_blank');
    setShowShareMenu(false);
  };

  const handleShareGmail = () => {
    const url = getListingUrl();
    const subject = `Property Listing: ${listing.address}`;
    const body = `Check out this property:\n\n${listing.address}\nPrice: €${listing.price?.toLocaleString()}\n${listing.bedrooms ? `${listing.bedrooms} bedrooms` : ''}${listing.bathrooms ? `, ${listing.bathrooms} bathrooms` : ''}${listing.livingArea ? `, ${listing.livingArea} m²` : ''}\n\nView listing: ${url}`;
    const link = document.createElement('a');
    link.href = `https://mail.google.com/mail/u/0/?view=cm&fs=1&tf=cm&to=&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    link.target = '_blank'; link.rel = 'noopener noreferrer';
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
    setShowShareMenu(false);
  };

  const handleSaveClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const result = await handleSave();
    if (result) { setToastMessage(result.message); setToastHasLink(result.hasLink); setShowToast(true); }
  };

  const handleConfirmUnsaveClick = async () => {
    const result = await handleConfirmUnsave();
    if (result) { setToastMessage(result.message); setToastHasLink(result.hasLink); setShowToast(true); }
  };

  // ---- Shared header (address, share, save, price) ----
  const renderHeader = () => (
    <div style={{ width: '100%', position: 'relative' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '0.5rem', gap: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: '1 1 auto', minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: isMobile ? '0.95rem' : '1.3rem', wordBreak: 'break-word', lineHeight: '1.3', flex: '0 1 auto', fontFamily: 'inherit', fontWeight: 600 }}>
            {listing.address}
          </h2>
          {/* Share Button */}
          <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
            <Dropdown show={showShareMenu} onToggle={setShowShareMenu}>
              <Dropdown.Toggle variant="link" className="share-dropdown-toggle" style={{ backgroundColor: 'transparent', border: 'none', padding: '0.25rem', color: '#6c757d', textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '24px', height: '24px', borderRadius: '4px', transition: 'background-color 0.2s ease', flexShrink: 0 }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#f8f9fa'; e.currentTarget.style.color = '#495057'; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#6c757d'; }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}>
                  <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
                  <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                </svg>
              </Dropdown.Toggle>
              <Dropdown.Menu align="start">
                <Dropdown.Item onClick={handleCopyURL}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
                    Copy URL
                  </div>
                </Dropdown.Item>
                <Dropdown.Item onClick={handleShareWhatsApp}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>
                    Share on WhatsApp
                  </div>
                </Dropdown.Item>
                <Dropdown.Item onClick={handleShareGmail}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z"/></svg>
                    Share on Gmail
                  </div>
                </Dropdown.Item>
              </Dropdown.Menu>
            </Dropdown>
          </div>
        </div>
        <span style={{ fontSize: '1.25rem', fontWeight: 'bold', color: 'black', whiteSpace: 'nowrap', flex: '0 0 auto', paddingRight: context === 'modal' ? '1.75rem' : undefined }}>
          €{listing.price?.toLocaleString()}
        </span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
        <div>{listing.area && <span className="badge bg-secondary">{listing.area}</span>}</div>
        <div style={{ paddingRight: context === 'modal' ? '1.75rem' : undefined }}>
          {listing.pricePerSquareMeter && (
            <span style={{ fontSize: '0.9rem', fontWeight: '500', color: '#1a202c', whiteSpace: 'nowrap' }}>
              per m² €{listing.pricePerSquareMeter.toLocaleString()}
            </span>
          )}
        </div>
      </div>
    </div>
  );

  // ---- Image carousel / grid view ----
  const renderCarousel = () => (
    <div ref={contentTopRef} style={{ position: 'relative' }} className={context === 'page' ? 'listing-detail-carousel-wrapper' : undefined}>
      {showGridView ? (
          <div style={{ paddingBottom: '1rem' }}>
            <div className="d-flex justify-content-between align-items-center mb-3">
              <h6 style={{ margin: 0, fontWeight: 'bold' }}>Photos {listing.imageGallery?.length || 0}</h6>
              <Button variant="link" onClick={() => setShowGridView(false)} style={{ fontSize: '0.85rem', padding: 0, textDecoration: 'none', color: '#6c757d' }}>
                ← Back to carousel
              </Button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)', gap: '8px' }}>
              {listing.imageGallery && listing.imageGallery.map((url: string, index: number) => (
                <img key={index} src={url} alt={`${listing.address} - ${index + 1}`}
                  style={{ width: '100%', height: '200px', objectFit: 'cover', cursor: 'pointer', borderRadius: '4px', transition: 'transform 0.2s ease, box-shadow 0.2s ease' }}
                  onClick={() => handleGridImageClick(index)}
                  onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.02)'; e.currentTarget.style.boxShadow = '0 4px 8px rgba(0,0,0,0.2)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = 'none'; }}
                  onLoad={(e) => { const img = e.target as HTMLImageElement; if (img.naturalHeight > img.naturalWidth) { img.style.objectFit = 'contain'; img.style.backgroundColor = 'white'; } }}
                />
              ))}
            </div>
          </div>
        ) : (
          <div ref={carouselContainerRef} style={{ position: 'relative' }}>
              <Carousel indicators={false} className={`mb-4 listing-image-carousel ${isManualNavigation ? 'carousel-no-transition' : ''}`} activeIndex={selectedImageIndex} onSelect={handleCarouselSelect}>
                {listing.imageGallery && listing.imageGallery.map((url: string, index: number) => (
                  <Carousel.Item key={index}>
                    <img className="d-block w-100 modal-image" src={url} alt={`Slide ${index}`}
                      style={context === 'page'
                        ? { height: isMobile ? '300px' : '500px', objectFit: 'cover', cursor: 'pointer' }
                        : { height: isMobile ? '260px' : '450px', objectFit: 'cover', cursor: 'pointer' }}
                      onClick={(e) => { if (e.target === e.currentTarget || (e.target as HTMLElement).tagName === 'IMG') handleGridImageClick(index); }}
                      onLoad={(e) => { const img = e.target as HTMLImageElement; if (img.naturalHeight > img.naturalWidth) { img.style.objectFit = 'contain'; img.style.backgroundColor = 'white'; } }}
                    />
                  </Carousel.Item>
                ))}
              </Carousel>
              {/* Heart Save Button */}
              <button onClick={handleSaveClick}
                style={{ position: 'absolute', top: '15px', right: '15px', backgroundColor: 'white', border: 'none', borderRadius: '50%', width: '45px', height: '45px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.15)', transition: 'all 0.2s ease', zIndex: 10, padding: 0 }}
                onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.25)'; e.currentTarget.style.transform = 'scale(1.05)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)'; e.currentTarget.style.transform = 'scale(1)'; }}
                title={isSaved ? 'Remove from saved' : 'Save property'}
              >
                <svg width="22" height="20" viewBox="0 0 24 21" fill={isSaved ? '#dc3545' : 'none'} stroke={isSaved ? '#dc3545' : '#212529'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transition: 'all 0.2s ease' }}>
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                </svg>
              </button>
              {/* Image counter and All images */}
              <div style={{ position: 'absolute', bottom: '10px', left: '10px', right: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 10 }}>
                {listing.imageGallery && listing.imageGallery.length > 1 && (
                  <div style={{ backgroundColor: 'rgba(255,255,255,0.85)', color: '#212529', padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: '500' }}>
                    {selectedImageIndex + 1} / {listing.imageGallery.length}
                  </div>
                )}
                <Button variant="link" onClick={() => setShowGridView(true)}
                  style={{ backgroundColor: 'rgba(255,255,255,0.85)', color: '#212529', padding: '4px 12px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: '500', textDecoration: 'none', border: 'none' }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.95)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.85)'; }}
                >
                  <span style={{ marginRight: '6px' }}>📷</span>All images
                </Button>
              </div>
            </div>
        )}
      </div>
  );

  // ---- Details, location, description, floor plans ----
  const renderDetails = () => (
    <>
      <Row>
        <Col md={6}>
          <h5 style={{ fontFamily: 'Playfair Display, serif', fontSize: '1.25rem', fontWeight: '600', marginBottom: '0.75rem', color: '#1a202c' }}>Details</h5>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.5rem', marginBottom: '0.75rem' }}>
            {listing.livingArea && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem', backgroundColor: '#f8f9fa', borderRadius: '6px', border: '1px solid #e9ecef' }}>
                <span style={{ fontSize: '1rem', color: '#4a90e2' }}><RulerIcon /></span>
                <div style={{ lineHeight: '1.2' }}><div style={{ fontSize: '0.95rem', fontWeight: '600', color: '#1a202c' }}>{listing.livingArea} m²</div><div style={{ fontSize: '0.7rem', color: '#6c757d' }}>Living Area</div></div>
              </div>
            )}
            {listing.energyLabel && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem', backgroundColor: '#f8f9fa', borderRadius: '6px', border: '1px solid #e9ecef' }}>
                <span style={{ fontSize: '1rem', color: '#4a90e2' }}><BoltIcon /></span>
                <div style={{ lineHeight: '1.2' }}><div style={{ fontSize: '0.95rem', fontWeight: '600', color: '#1a202c' }}>{listing.energyLabel}</div><div style={{ fontSize: '0.7rem', color: '#6c757d' }}>Energy Label</div></div>
              </div>
            )}
            {listing.bedrooms && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem', backgroundColor: '#f8f9fa', borderRadius: '6px', border: '1px solid #e9ecef' }}>
                <span style={{ fontSize: '1rem', color: '#4a90e2' }}><BedIcon /></span>
                <div style={{ lineHeight: '1.2' }}><div style={{ fontSize: '0.95rem', fontWeight: '600', color: '#1a202c' }}>{listing.bedrooms}</div><div style={{ fontSize: '0.7rem', color: '#6c757d' }}>Bedrooms</div></div>
              </div>
            )}
            {listing.bathrooms && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem', backgroundColor: '#f8f9fa', borderRadius: '6px', border: '1px solid #e9ecef' }}>
                <span style={{ fontSize: '1rem', color: '#4a90e2' }}><BathIcon /></span>
                <div style={{ lineHeight: '1.2' }}><div style={{ fontSize: '0.95rem', fontWeight: '600', color: '#1a202c' }}>{listing.bathrooms}</div><div style={{ fontSize: '0.7rem', color: '#6c757d' }}>Bathrooms</div></div>
              </div>
            )}
          </div>

          {outdoorSpaceString && (
            <div style={{ marginBottom: '0.75rem', padding: '0.5rem', backgroundColor: '#f8f9fa', borderRadius: '6px', border: '1px solid #e9ecef' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '1rem', color: '#4a90e2', flexShrink: 0 }}><LeafIcon /></span>
                <div style={{ lineHeight: '1.2', flex: 1 }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: '600', color: '#6c757d', marginBottom: '0.15rem' }}>Outdoor Space</div>
                  <div style={{ fontSize: '0.85rem', color: '#495057', fontWeight: '600' }}>{outdoorSpaceString}</div>
                </div>
              </div>
            </div>
          )}

          {(listing.apartmentFloor || listing.numberOfStories || listing.yearBuilt || listing.vveContribution) && (
            <div style={{ marginBottom: '0.75rem', padding: '0.65rem', backgroundColor: '#ffffff', borderRadius: '6px', border: '1px solid #e9ecef' }}>
              <div style={{ fontSize: '0.7rem', fontWeight: '600', color: '#6c757d', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Property Info</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem' }}>
                {listing.apartmentFloor && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
                    <span style={{ fontSize: '0.9rem', color: '#4a90e2' }}><BuildingIcon /></span>
                    <span style={{ fontSize: '0.8rem', color: '#495057', lineHeight: '1.2' }}>
                      {typeof listing.apartmentFloor === 'number' ? `Floor ${listing.apartmentFloor}` : listing.apartmentFloor.toLowerCase().includes('floor') ? listing.apartmentFloor : `${listing.apartmentFloor} floor`}
                    </span>
                  </div>
                )}
                {listing.numberOfStories && listing.numberOfStories >= 2 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
                    <span style={{ fontSize: '0.9rem', color: '#4a90e2' }}><LayersIcon /></span>
                    <span style={{ fontSize: '0.8rem', color: '#495057', lineHeight: '1.2' }}>{listing.numberOfStories} stories</span>
                  </div>
                )}
                {listing.yearBuilt && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
                    <span style={{ fontSize: '0.9rem', color: '#4a90e2' }}><CalendarIcon /></span>
                    <span style={{ fontSize: '0.8rem', color: '#495057', lineHeight: '1.2' }}>Built {listing.yearBuilt}</span>
                  </div>
                )}
                {listing.vveContribution && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
                    <span style={{ fontSize: '0.9rem', color: '#4a90e2' }}>€</span>
                    <span style={{ fontSize: '0.8rem', color: '#495057', lineHeight: '1.2' }}>VVE €{listing.vveContribution}/mo</span>
                  </div>
                )}
              </div>
            </div>
          )}

          <div style={{ marginBottom: '1.5rem', fontSize: '0.85rem', color: '#495057', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>
              <strong style={{ color: '#1a202c' }}>Agent:</strong>{' '}
              {listing.agentUrl ? (
                <a href={listing.agentUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#4a90e2', textDecoration: 'none' }}>{listing.agentName}</a>
              ) : listing.agentName}
            </span>
            {listing.publishedDate && (
              <span style={{ color: '#6c757d', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                <CalendarIcon /> {listing.publishedDate.toDate().toLocaleDateString()}
              </span>
            )}
          </div>

          <a href={listing.url} target="_blank" rel="noopener noreferrer"
            style={{ display: 'inline-block', padding: '0.5rem 1.25rem', backgroundColor: '#4a90e2', color: 'white', textDecoration: 'none', borderRadius: '6px', fontSize: '0.85rem', fontWeight: '600', transition: 'all 0.2s ease', marginBottom: '0.75rem' }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#357abd'; e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(74,144,226,0.3)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#4a90e2'; e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}
          >
            View original listing →
          </a>
        </Col>
        <Col md={6}>
          {(listing.coordinates?.lat && listing.coordinates?.lon) && (
            <>
              <h5 style={{ fontFamily: 'Playfair Display, serif', fontSize: '1.25rem', fontWeight: '600', marginBottom: '0.75rem', color: '#1a202c' }}>Location</h5>
              <div style={{ position: 'relative', borderRadius: '6px', overflow: 'hidden', marginBottom: '0.5rem' }}>
                <div ref={detailMapRef} style={{ width: '100%', height: '300px' }} />
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(listing.postalCode ? `${listing.address}, ${listing.postalCode}` : `${listing.address}, Amsterdam`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    position: 'absolute',
                    top: '10px',
                    left: '10px',
                    backgroundColor: 'white',
                    color: '#4a90e2',
                    fontSize: '0.75rem',
                    fontWeight: '600',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
                    textDecoration: 'none',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Open in Maps →
                </a>
                {typeof navigator !== 'undefined' && 'geolocation' in navigator && (
                  <button
                    onClick={() => {
                      if (!detailMapInstanceRef.current) return;
                      setDetailMapLocationState('loading');
                      navigator.geolocation.getCurrentPosition(
                        (pos) => {
                          const userLat = pos.coords.latitude;
                          const userLng = pos.coords.longitude;
                          const map = detailMapInstanceRef.current!;

                          if (detailMapLocationMarkerRef.current) {
                            detailMapLocationMarkerRef.current.setPosition({ lat: userLat, lng: userLng });
                          } else {
                            detailMapLocationMarkerRef.current = new google.maps.Marker({
                              position: { lat: userLat, lng: userLng },
                              map,
                              title: 'Your location',
                              icon: {
                                url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(
                                  `<svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                    <circle cx="12" cy="12" r="12" fill="#8b5cf6" fill-opacity="0.15"/>
                                    <circle cx="12" cy="12" r="7" fill="#fff" stroke="#8b5cf6" stroke-width="3"/>
                                  </svg>`
                                ),
                                scaledSize: new google.maps.Size(24, 24),
                                anchor: new google.maps.Point(12, 12),
                              },
                            });
                          }

                          map.panTo({ lat: userLat, lng: userLng });
                          if ((map.getZoom() ?? 0) < 15) map.setZoom(15);

                          setDetailMapLocationState('active');
                        },
                        () => setDetailMapLocationState('denied'),
                        { enableHighAccuracy: true }
                      );
                    }}
                    title={
                      detailMapLocationState === 'denied' ? 'Location access denied' :
                      detailMapLocationState === 'active' ? 'Location shown' : 'Show my location'
                    }
                    style={{
                      position: 'absolute',
                      bottom: '10px',
                      left: '10px',
                      width: '36px',
                      height: '36px',
                      borderRadius: '4px',
                      border: 'none',
                      backgroundColor: 'white',
                      boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
                      cursor: detailMapLocationState === 'loading' ? 'wait' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: 0,
                    }}
                  >
                    {detailMapLocationState === 'loading' ? (
                      <div className="spinner-border spinner-border-sm text-primary" role="status" style={{ width: '16px', height: '16px', borderWidth: '2px' }} />
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <circle cx="12" cy="12" r="3.5"
                          fill={detailMapLocationState === 'active' ? '#8b5cf6' : 'none'}
                          stroke={detailMapLocationState === 'denied' ? '#dc3545' : '#8b5cf6'}
                          strokeWidth="2"
                        />
                        <path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke={detailMapLocationState === 'denied' ? '#dc3545' : '#8b5cf6'} strokeWidth="2" strokeLinecap="round"/>
                      </svg>
                    )}
                  </button>
                )}
              </div>
              {listing.neighborhood && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.75rem', fontSize: '0.85rem', color: '#495057' }}>
                  <span style={{ fontSize: '0.9rem', color: '#4a90e2' }}><GlobeIcon /></span>
                  <span><strong style={{ color: '#1a202c' }}>Neighborhood:</strong> {listing.neighborhood}</span>
                </div>
              )}
            </>
          )}
        </Col>
      </Row>

      <Row style={{ marginTop: '1.5rem' }}>
        <Col md={6}>
          <div style={{ borderTop: '1px solid #e9ecef', paddingTop: '0.75rem' }}>
            <h5 style={{ fontFamily: 'Playfair Display, serif', fontSize: '1.25rem', fontWeight: '600', marginBottom: '0.5rem', color: '#1a202c' }}>Full Description</h5>
            <div style={{ fontSize: '0.9rem', lineHeight: '1.6', color: '#495057', fontFamily: 'Inter, sans-serif' }}>
              {listing.cleanedDescription && (() => {
                const characterLimit = isMobile ? 500 : 1000;
                const shouldShowButton = listing.cleanedDescription.length > characterLimit;
                return (
                  <>
                    {isDescriptionExpanded ? listing.cleanedDescription : `${listing.cleanedDescription.substring(0, characterLimit)}${shouldShowButton ? '...' : ''}`}
                    {shouldShowButton && (
                      <Button variant="link" onClick={() => setIsDescriptionExpanded(!isDescriptionExpanded)}
                        style={{ fontSize: '0.85rem', padding: '0.25rem 0', marginLeft: '0.5rem', color: '#4a90e2', textDecoration: 'none', fontWeight: '600' }}
                        onMouseEnter={(e) => { e.currentTarget.style.textDecoration = 'underline'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.textDecoration = 'none'; }}
                      >
                        {isDescriptionExpanded ? 'Show Less ↑' : 'Show More ↓'}
                      </Button>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        </Col>
        <Col md={6}>
          {listing.floorPlans && listing.floorPlans.length > 0 && (
            <div style={{ borderTop: '1px solid #e9ecef', paddingTop: '0.75rem' }}>
              <h5 style={{ fontFamily: 'Playfair Display, serif', fontSize: '1.25rem', fontWeight: '600', marginBottom: '0.75rem', color: '#1a202c' }}>
                {listing.floorPlans.length === 1 ? 'Floor Plan' : 'Floor Plans'}
              </h5>
              <Carousel indicators={listing.floorPlans.length > 1} controls={listing.floorPlans.length > 1}>
                {listing.floorPlans.map((url, index) => (
                  <Carousel.Item key={index}>
                    <img className="d-block w-100" src={url} alt={`Floor Plan ${index + 1}`}
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
    </>
  );

  // ---- Sub-modals (fullscreen image, floor plan, unsave confirm) ----
  const renderSubModals = () => (
    <>
      {/* Fullscreen Image Modal */}
      <Modal show={showImageModal} onHide={() => setShowImageModal(false)} size="xl" centered style={{ touchAction: 'manipulation' }}>
        <Modal.Header closeButton>
          <Modal.Title style={{ fontSize: '0.9rem', fontWeight: '500' }}>
            Photo {selectedImageModalIndex + 1}{listing.imageGallery && listing.imageGallery.length > 1 && ` of ${listing.imageGallery.length}`}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body className="text-center" style={{ overflow: 'auto', maxHeight: '85vh', position: 'relative', touchAction: 'manipulation' }}>
          {listing.imageGallery && listing.imageGallery[selectedImageModalIndex] && (
            <>
              <div ref={imageModalRef} style={{ transform: `translate(${imagePanX}px, ${imagePanY}px) scale(${imageZoom})`, transformOrigin: 'center', transition: (pinchStartDistanceRef.current === null && imageDragStartRef.current === null) ? 'transform 0.2s ease' : 'none', touchAction: 'none', cursor: imageZoom > 1 ? 'move' : 'default' }}>
                <img src={listing.imageGallery[selectedImageModalIndex]} alt={`${selectedImageModalIndex + 1} of ${listing.imageGallery.length}`}
                  style={{ maxWidth: '100%', maxHeight: 'calc(85vh - 100px)', objectFit: 'contain', cursor: 'move', touchAction: 'none', userSelect: 'none' }} draggable={false}
                  onLoad={(e) => { const img = e.target as HTMLImageElement; if (img.naturalHeight > img.naturalWidth) { img.style.objectFit = 'contain'; img.style.backgroundColor = 'white'; } }}
                />
              </div>
              {listing.imageGallery && listing.imageGallery.length > 1 && (
                <>
                  <button onClick={() => { const prev = selectedImageModalIndex > 0 ? selectedImageModalIndex - 1 : (listing.imageGallery?.length || 1) - 1; setSelectedImageModalIndex(prev); setImageZoom(1); setImagePanX(0); setImagePanY(0); }} style={{ position: 'absolute', left: '20px', top: '50%', transform: 'translateY(-50%)', backgroundColor: 'rgba(255,255,255,0.9)', border: '1px solid rgba(0,0,0,0.2)', borderRadius: '4px', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: '1.5rem', color: '#212529', zIndex: 10, boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }} onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,1)'; }} onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.9)'; }}>‹</button>
                  <button onClick={() => { const max = (listing.imageGallery?.length || 1) - 1; const next = selectedImageModalIndex < max ? selectedImageModalIndex + 1 : 0; setSelectedImageModalIndex(next); setImageZoom(1); setImagePanX(0); setImagePanY(0); }} style={{ position: 'absolute', right: '20px', top: '50%', transform: 'translateY(-50%)', backgroundColor: 'rgba(255,255,255,0.9)', border: '1px solid rgba(0,0,0,0.2)', borderRadius: '4px', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: '1.5rem', color: '#212529', zIndex: 10, boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }} onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,1)'; }} onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.9)'; }}>›</button>
                </>
              )}
              <div style={{ position: 'absolute', bottom: '20px', right: '20px', display: 'flex', flexDirection: 'column', gap: '2px', zIndex: 10 }}>
                <button onClick={handleImageZoomIn} disabled={imageZoom >= 3} style={{ backgroundColor: 'white', border: '1px solid rgba(0,0,0,0.2)', borderRadius: '4px 4px 0 0', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: imageZoom >= 3 ? 'not-allowed' : 'pointer', fontSize: '1.2rem', fontWeight: 'bold', color: imageZoom >= 3 ? '#ccc' : '#212529', boxShadow: '0 2px 8px rgba(0,0,0,0.15)', opacity: imageZoom >= 3 ? 0.5 : 1 }}>+</button>
                <button onClick={handleImageZoomOut} disabled={imageZoom <= 0.5} style={{ backgroundColor: 'white', border: '1px solid rgba(0,0,0,0.2)', borderRadius: '0 0 4px 4px', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: imageZoom <= 0.5 ? 'not-allowed' : 'pointer', fontSize: '1.2rem', fontWeight: 'bold', color: imageZoom <= 0.5 ? '#ccc' : '#212529', boxShadow: '0 2px 8px rgba(0,0,0,0.15)', opacity: imageZoom <= 0.5 ? 0.5 : 1 }}>−</button>
              </div>
            </>
          )}
        </Modal.Body>
      </Modal>

      {/* Fullscreen Floor Plan Modal */}
      <Modal show={showFloorPlanModal} onHide={() => setShowFloorPlanModal(false)} size="xl" centered>
        <Modal.Header closeButton>
          <Modal.Title style={{ fontSize: '0.9rem', fontWeight: '500' }}>
            {listing.floorPlans && listing.floorPlans.length === 1 ? 'Floor Plan' : listing.floorPlans && listing.floorPlans.length > 1 ? `Floor Plan ${selectedFloorPlanIndex + 1} of ${listing.floorPlans.length}` : 'Floor Plan'}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body className="text-center" style={{ overflow: 'auto', maxHeight: '80vh', position: 'relative', touchAction: 'manipulation' }}>
          {listing.floorPlans && listing.floorPlans[selectedFloorPlanIndex] && (
            <>
              <div ref={floorPlanModalRef} style={{ transform: `translate(${floorPlanPanX}px, ${floorPlanPanY}px) scale(${floorPlanZoom})`, transformOrigin: 'center', transition: (floorPlanPinchStartDistanceRef.current === null && floorPlanDragStartRef.current === null) ? 'transform 0.2s ease' : 'none', touchAction: 'none', cursor: floorPlanZoom > 1 ? 'move' : 'default' }}>
                <img src={listing.floorPlans[selectedFloorPlanIndex]} alt={`Floor Plan ${selectedFloorPlanIndex + 1}`} style={{ maxWidth: '100%', maxHeight: '80vh', objectFit: 'contain', cursor: 'move', touchAction: 'none', userSelect: 'none' }} draggable={false} />
              </div>
              {listing.floorPlans && listing.floorPlans.length > 1 && (
                <>
                  <button onClick={() => { const prev = selectedFloorPlanIndex > 0 ? selectedFloorPlanIndex - 1 : (listing.floorPlans?.length || 1) - 1; setSelectedFloorPlanIndex(prev); setFloorPlanZoom(1); setFloorPlanPanX(0); setFloorPlanPanY(0); }} style={{ position: 'absolute', left: '20px', top: '50%', transform: 'translateY(-50%)', backgroundColor: 'rgba(255,255,255,0.9)', border: '1px solid rgba(0,0,0,0.2)', borderRadius: '4px', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: '1.5rem', color: '#212529', zIndex: 10, boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }} onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,1)'; }} onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.9)'; }}>‹</button>
                  <button onClick={() => { const max = (listing.floorPlans?.length || 1) - 1; const next = selectedFloorPlanIndex < max ? selectedFloorPlanIndex + 1 : 0; setSelectedFloorPlanIndex(next); setFloorPlanZoom(1); setFloorPlanPanX(0); setFloorPlanPanY(0); }} style={{ position: 'absolute', right: '20px', top: '50%', transform: 'translateY(-50%)', backgroundColor: 'rgba(255,255,255,0.9)', border: '1px solid rgba(0,0,0,0.2)', borderRadius: '4px', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: '1.5rem', color: '#212529', zIndex: 10, boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }} onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,1)'; }} onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.9)'; }}>›</button>
                </>
              )}
              <div style={{ position: 'absolute', bottom: '20px', right: '20px', display: 'flex', flexDirection: 'column', gap: '2px', zIndex: 10 }}>
                <button onClick={handleZoomIn} disabled={floorPlanZoom >= 3} style={{ backgroundColor: 'white', border: '1px solid rgba(0,0,0,0.2)', borderRadius: '4px 4px 0 0', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: floorPlanZoom >= 3 ? 'not-allowed' : 'pointer', fontSize: '1.2rem', fontWeight: 'bold', color: floorPlanZoom >= 3 ? '#ccc' : '#212529', boxShadow: '0 2px 8px rgba(0,0,0,0.15)', opacity: floorPlanZoom >= 3 ? 0.5 : 1 }}>+</button>
                <button onClick={handleZoomOut} disabled={floorPlanZoom <= 0.5} style={{ backgroundColor: 'white', border: '1px solid rgba(0,0,0,0.2)', borderRadius: '0 0 4px 4px', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: floorPlanZoom <= 0.5 ? 'not-allowed' : 'pointer', fontSize: '1.2rem', fontWeight: 'bold', color: floorPlanZoom <= 0.5 ? '#ccc' : '#212529', boxShadow: '0 2px 8px rgba(0,0,0,0.15)', opacity: floorPlanZoom <= 0.5 ? 0.5 : 1 }}>−</button>
              </div>
            </>
          )}
        </Modal.Body>
      </Modal>

      {/* Unsave Confirmation Modal */}
      <Modal show={showUnsaveConfirm} onHide={() => setShowUnsaveConfirm(false)} centered>
        <Modal.Header closeButton><Modal.Title>Remove from Saved?</Modal.Title></Modal.Header>
        <Modal.Body><p>Are you sure you want to remove this property from your saved properties?</p></Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowUnsaveConfirm(false)}>Cancel</Button>
          <Button variant="danger" onClick={handleConfirmUnsaveClick}>Remove</Button>
        </Modal.Footer>
      </Modal>

      {/* Toast Notification */}
      <div style={{ position: 'fixed', bottom: '20px', right: '20px', zIndex: 9999 }}>
        <Toast show={showToast} onClose={() => setShowToast(false)} delay={3000} autohide style={{ backgroundColor: '#2d3748', color: 'white', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', minWidth: 'auto', maxWidth: 'fit-content' }}>
          <Toast.Body style={{ color: 'white', fontWeight: '500', fontSize: '0.9rem', padding: '0.75rem 1rem' }}>
            {toastHasLink ? (
              <>Added to{' '}<a href="/saved-properties" onClick={(e) => { e.preventDefault(); navigate('/saved-properties'); setShowToast(false); }} style={{ color: 'white', textDecoration: 'underline', fontWeight: '600', cursor: 'pointer' }}>Saved Properties</a></>
            ) : toastMessage}
          </Toast.Body>
        </Toast>
      </div>
    </>
  );

  // ---- Render: page context vs modal context ----

  if (context === 'modal') {
    return (
      <>
        <Modal.Header style={{ position: 'relative' }}>
          <button onClick={onClose} style={{ position: 'absolute', top: '10px', right: '10px', backgroundColor: '#e9ecef', border: 'none', borderRadius: '50%', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', zIndex: 10, color: '#495057', fontSize: '16px', lineHeight: '1', padding: 0 }} onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#dee2e6'; }} onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#e9ecef'; }}>×</button>
          {renderHeader()}
        </Modal.Header>
        <Modal.Body>
          {renderCarousel()}
          {renderDetails()}
        </Modal.Body>
        {renderSubModals()}
      </>
    );
  }

  // Page context: carousel first, then header info, then rest of details
  return (
    <>
      {renderCarousel()}
      <div className="listing-detail-header">
        {renderHeader()}
      </div>
      <div className="listing-detail-body">
        {renderDetails()}
      </div>
      {renderSubModals()}
    </>
  );
};

export default ListingDetailContent;
