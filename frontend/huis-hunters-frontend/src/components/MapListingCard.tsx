import React, { useState, useEffect, useRef } from 'react';
import { Carousel, Button, Toast } from 'react-bootstrap';
import { Listing } from '../types';
import BedIcon from './icons/BedIcon';
import BathIcon from './icons/BathIcon';
import RulerIcon from './icons/RulerIcon';
import BoltIcon from './icons/BoltIcon';
import CalendarIcon from './icons/CalendarIcon';
import { BuildingIcon } from './icons/BuildingIcon';
import LayersIcon from './icons/LayersIcon';
import LeafIcon from './icons/LeafIcon';
import ListingCard from './ListingCard';
import { useAuth } from '../contexts/AuthContext';
import { collection, query, where, getDocs, doc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

interface MapListingCardProps {
  listing: Listing;
  onClose: () => void;
  onModalToggle: (isOpen: boolean) => void;
  isAnyModalOpen: boolean;
  // Optional callback to trigger the global login required prompt
  onRequireLogin?: () => void;
  // Function to check if a marker was just clicked (to prevent backdrop from closing)
  wasMarkerJustClicked?: () => boolean;
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

const MapListingCard: React.FC<MapListingCardProps> = ({ listing, onClose, onModalToggle, isAnyModalOpen, onRequireLogin, wasMarkerJustClicked }) => {
  const [showFullModal, setShowFullModal] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [isSaved, setIsSaved] = useState(false);
  const [savedPropertyId, setSavedPropertyId] = useState<string | null>(null);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const { currentUser } = useAuth();
  const outdoorSpaceString = getOutdoorSpaceString(listing);
  const publishedDate = listing.publishedDate ? listing.publishedDate.toDate() : null;
  const backdropRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const cardOpenedAtRef = useRef<number>(Date.now());

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Prevent page zoom (Ctrl/Cmd + wheel) when card is open, but allow map zoom
  useEffect(() => {
    const cardElement = cardRef.current;
    
    // Handler for card - prevent page zoom when scrolling directly on card
    const handleCardWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    // Global handler to prevent page zoom but allow map zoom
    const handleGlobalWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        const target = e.target as HTMLElement;
        const isOnCard = cardElement && cardElement.contains(target);
        const isOnBackdrop = backdropRef.current && (backdropRef.current === target || backdropRef.current.contains(target));
        
        if (!isOnCard) {
          // Temporarily disable backdrop to see what's underneath
          let elementAtPoint: Element | null = null;
          if (isOnBackdrop && backdropRef.current) {
            const originalPE = backdropRef.current.style.pointerEvents;
            backdropRef.current.style.pointerEvents = 'none';
            elementAtPoint = document.elementFromPoint(e.clientX, e.clientY);
            backdropRef.current.style.pointerEvents = originalPE;
          } else {
            elementAtPoint = document.elementFromPoint(e.clientX, e.clientY);
          }
          
          const isOverMap = elementAtPoint && (
            elementAtPoint.closest('.gm-style') !== null ||
            elementAtPoint.tagName === 'CANVAS' ||
            (elementAtPoint as HTMLElement).classList.toString().includes('gm-')
          );
          
          if (isOverMap && elementAtPoint) {
            // Over map - prevent page zoom but forward event to map
            e.preventDefault();
            // Forward the event to the map element
            const mapEvent = new WheelEvent('wheel', {
              bubbles: true,
              cancelable: true,
              clientX: e.clientX,
              clientY: e.clientY,
              deltaX: e.deltaX,
              deltaY: e.deltaY,
              deltaZ: e.deltaZ,
              deltaMode: e.deltaMode,
              ctrlKey: e.ctrlKey,
              metaKey: e.metaKey,
              shiftKey: e.shiftKey,
              altKey: e.altKey
            });
            elementAtPoint.dispatchEvent(mapEvent);
          } else {
            // Not over map - prevent page zoom
            e.preventDefault();
            e.stopPropagation();
          }
        }
      }
    };

    if (cardElement) {
      cardElement.addEventListener('wheel', handleCardWheel, { passive: false });
    }
    
    // Add global handler in bubble phase (not capture) so map receives it first
    document.addEventListener('wheel', handleGlobalWheel, { passive: false });
    
    return () => {
      if (cardElement) {
        cardElement.removeEventListener('wheel', handleCardWheel);
      }
      document.removeEventListener('wheel', handleGlobalWheel);
    };
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
      if (onRequireLogin) {
        onRequireLogin();
      }
      return;
    }

    try {
      if (isSaved && savedPropertyId) {
        await deleteDoc(doc(db, 'savedProperties', savedPropertyId));
        setIsSaved(false);
        setSavedPropertyId(null);
        setToastMessage('Removed from Saved Properties');
        setShowToast(true);
      } else {
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
    }
  };

  // Track when card was opened to prevent immediate modal opening
  useEffect(() => {
    cardOpenedAtRef.current = Date.now();
  }, [listing.id]);

  const handleCardClick = () => {
    // On mobile, prevent immediate opening if card was just opened (within 300ms)
    // This prevents the touch event from marker click from opening modal directly
    const timeSinceOpen = Date.now() - cardOpenedAtRef.current;
    if (isMobile && timeSinceOpen < 300) {
      return; // Ignore clicks immediately after card opens on mobile
    }
    setShowFullModal(true);
    onModalToggle(true);
  };

  const handleModalClose = () => {
    setShowFullModal(false);
    onModalToggle(false);
  };

  return (
    <>
      {/* Backdrop - handles clicks but allows drag events through */}
      <div
        ref={backdropRef}
        onMouseDown={(e) => {
          // Desktop: Handle clicks and panning
          if (!isMobile) {
            // Check if click is on the card
            const target = e.target as HTMLElement;
            const isClickOnCard = cardRef.current && (
              target === cardRef.current || 
              cardRef.current.contains(target)
            );
            
            if (isClickOnCard) {
              return; // Don't handle if clicking on card
            }
            
            // Only handle if clicking directly on backdrop
            if (e.target !== e.currentTarget) {
              return;
            }
            
            const startX = e.clientX;
            const startY = e.clientY;
            let moved = false;
            
            // Check what's underneath by temporarily disabling pointer events
            const originalPE = backdropRef.current?.style.pointerEvents;
            if (backdropRef.current) {
              backdropRef.current.style.pointerEvents = 'none';
            }
            const elementUnder = document.elementFromPoint(e.clientX, e.clientY);
            
            // If over map, keep pointer events disabled to allow marker clicks
            const isOverMap = elementUnder && (
              elementUnder.closest('.gm-style') !== null ||
              elementUnder.tagName === 'CANVAS' ||
              (elementUnder as HTMLElement).classList.toString().includes('gm-')
            );
            
            if (isOverMap && elementUnder) {
              // Forward mousedown to map element so panning works
              const mapEvent = new MouseEvent('mousedown', {
                bubbles: true,
                cancelable: true,
                clientX: e.clientX,
                clientY: e.clientY,
                button: e.button,
                buttons: e.buttons,
                ctrlKey: e.ctrlKey,
                shiftKey: e.shiftKey,
                altKey: e.altKey,
                metaKey: e.metaKey
              });
              elementUnder.dispatchEvent(mapEvent);
              
              // Re-enable pointer events after a short delay to allow marker clicks but be ready for next click
              setTimeout(() => {
                if (backdropRef.current) {
                  backdropRef.current.style.pointerEvents = 'auto';
                }
              }, 100);
              
              // Track mouse movement to detect if it's a click vs drag
              const handleMouseMove = () => {
                moved = true;
              };
              
              const handleMouseUp = (upEvent: MouseEvent) => {
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);
                
                // Re-enable pointer events immediately so backdrop is ready for next click
                if (backdropRef.current) {
                  backdropRef.current.style.pointerEvents = 'auto';
                }
                
                // If mouse didn't move much, it was a click - close the card
                if (!moved) {
                  const deltaX = Math.abs(upEvent.clientX - startX);
                  const deltaY = Math.abs(upEvent.clientY - startY);
                  if (deltaX < 5 && deltaY < 5) {
                    // It was a click, not a drag
                    // Forward click event to map so marker clicks can fire
                    const clickEvent = new MouseEvent('click', {
                      bubbles: true,
                      cancelable: true,
                      clientX: upEvent.clientX,
                      clientY: upEvent.clientY,
                      button: upEvent.button,
                      buttons: upEvent.buttons,
                      ctrlKey: upEvent.ctrlKey,
                      shiftKey: upEvent.shiftKey,
                      altKey: upEvent.altKey,
                      metaKey: upEvent.metaKey
                    });
                    if (elementUnder) {
                      elementUnder.dispatchEvent(clickEvent);
                    }
                    
                    // Use requestAnimationFrame to ensure marker click handler runs first
                    requestAnimationFrame(() => {
                      requestAnimationFrame(() => {
                        // Don't close if a marker was just clicked
                        if (wasMarkerJustClicked && wasMarkerJustClicked()) {
                          return;
                        }
                        // Close the card
                        onClose();
                      });
                    });
                  }
                }
              };
              
              document.addEventListener('mousemove', handleMouseMove);
              document.addEventListener('mouseup', handleMouseUp);
            } else {
              // Not over map - restore pointer events and handle click on backdrop
              if (backdropRef.current) {
                backdropRef.current.style.pointerEvents = originalPE || 'auto';
              }
              
              const handleMouseUp = (upEvent: MouseEvent) => {
                document.removeEventListener('mouseup', handleMouseUp);
                
                const deltaX = Math.abs(upEvent.clientX - startX);
                const deltaY = Math.abs(upEvent.clientY - startY);
                if (deltaX < 5 && deltaY < 5) {
                  // It was a click - close immediately
                  onClose();
                }
              };
              
              document.addEventListener('mouseup', handleMouseUp);
            }
          }
        }}
        onTouchStart={(e) => {
          // Mobile: handle taps on backdrop or map to close card
          if (!isMobile) return;
          
          // Check if touch is on the card - if so, don't handle it here
          const target = e.target as HTMLElement;
          const isTouchOnCard = cardRef.current && (
            target === cardRef.current || 
            cardRef.current.contains(target)
          );
          
          if (isTouchOnCard) {
            return; // Let card handle its own touches
          }
          
          const touch = e.touches[0];
          const touchX = touch.clientX;
          const touchY = touch.clientY;
          
          // Check if touch is over the map - if so, temporarily allow pointer events through
          const originalPE = backdropRef.current?.style.pointerEvents;
          if (backdropRef.current) {
            backdropRef.current.style.pointerEvents = 'none';
          }
          const elementUnder = document.elementFromPoint(touchX, touchY);
          if (backdropRef.current) {
            backdropRef.current.style.pointerEvents = originalPE || 'auto';
          }
          
          const isOverMap = elementUnder && (
            elementUnder.closest('.gm-style') !== null ||
            elementUnder.tagName === 'CANVAS' ||
            (elementUnder as HTMLElement).classList.toString().includes('gm-')
          );
          
          // If over map, temporarily disable pointer events to allow marker clicks
          if (isOverMap && backdropRef.current) {
            backdropRef.current.style.pointerEvents = 'none';
            // Re-enable after a delay to allow marker click to process
            setTimeout(() => {
              if (backdropRef.current) {
                backdropRef.current.style.pointerEvents = 'auto';
              }
            }, 300);
          }
          
          // Set up touchend handler to detect tap
          const handleTouchEnd = (endEvent: TouchEvent) => {
            if (endEvent.changedTouches.length > 0) {
              const endTouch = endEvent.changedTouches[0];
              const deltaX = Math.abs(endTouch.clientX - touchX);
              const deltaY = Math.abs(endTouch.clientY - touchY);
              
              // If it was a tap (not a drag)
              if (deltaX < 15 && deltaY < 15) {
                // Use a delay to let map marker clicks process first
                setTimeout(() => {
                  if (!cardRef.current) return; // Card already closed
                  
                  // Don't close if a marker was just clicked
                  if (wasMarkerJustClicked && wasMarkerJustClicked()) {
                    return;
                  }
                  
                  // Check what's under the touch point
                  const originalPE = backdropRef.current?.style.pointerEvents;
                  if (backdropRef.current) {
                    backdropRef.current.style.pointerEvents = 'none';
                  }
                  const elementAtPoint = document.elementFromPoint(endTouch.clientX, endTouch.clientY);
                  if (backdropRef.current) {
                    backdropRef.current.style.pointerEvents = originalPE || 'auto';
                  }
                  
                  // Check if element is the card (shouldn't close)
                  const isTouchOnCard = cardRef.current && (
                    elementAtPoint === cardRef.current ||
                    cardRef.current.contains(elementAtPoint)
                  );
                  
                  // Close if it's not the card (backdrop or map)
                  if (!isTouchOnCard) {
                    onClose();
                  }
                }, 250); // Delay to let map marker clicks process
              }
            }
            document.removeEventListener('touchend', handleTouchEnd);
          };
          
          // Add touchend listener immediately
          document.addEventListener('touchend', handleTouchEnd, { once: true });
        }}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 998,
          backgroundColor: 'transparent',
          pointerEvents: 'auto'
        }}
      />

      <div
        ref={cardRef}
        style={{
          position: 'absolute',
          bottom: isMobile ? '10px' : '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          width: isMobile ? '95%' : '90%',
          maxWidth: '400px',
          zIndex: 1000,
          backgroundColor: 'white',
          borderRadius: '12px',
          boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
          overflow: 'hidden',
          cursor: 'pointer',
          touchAction: 'manipulation'
        }}
        onClick={(e) => {
          // Don't close when clicking inside the card
          e.stopPropagation();
        }}
        onTouchStart={(e) => {
          // Prevent backdrop from closing when touching the card
          e.stopPropagation();
        }}
      >
        {/* Close button - Left side */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          style={{
            position: 'absolute',
            top: '10px',
            left: '10px',
            backgroundColor: 'rgba(0,0,0,0.6)',
            border: 'none',
            borderRadius: '50%',
            width: '28px',
            height: '28px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            zIndex: 10,
            color: 'white',
            fontSize: '18px',
            lineHeight: '1',
            padding: 0
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.8)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.6)';
          }}
        >
          ×
        </button>

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
            width: '32px',
            height: '32px',
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
            width="18"
            height="16"
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

        {/* Image Carousel */}
        {listing.imageGallery && listing.imageGallery.length > 0 && (
          <div style={{ position: 'relative', height: '200px' }}>
            <Carousel interval={5000} indicators={listing.imageGallery.length > 1} controls={listing.imageGallery.length > 1}>
              {listing.imageGallery.slice(0, 10).map((url: string, index: number) => (
                <Carousel.Item key={index}>
                  <img
                    className="d-block w-100"
                    src={url}
                    alt={`Slide ${index}`}
                    style={{
                      height: '200px',
                      objectFit: 'cover',
                      cursor: 'pointer',
                      touchAction: 'manipulation'
                    }}
                    onClick={handleCardClick}
                    onTouchStart={(e) => {
                      e.stopPropagation();
                    }}
                  />
                </Carousel.Item>
              ))}
            </Carousel>
          </div>
        )}

        {/* Card Content */}
        <div 
          style={{ padding: '1rem' }} 
          onClick={handleCardClick}
          onTouchStart={(e) => {
            // Allow touch events to work on mobile
            e.stopPropagation();
          }}
        >
          {/* Address and Price */}
          <div style={{ marginBottom: '0.5rem' }}>
            <div className="d-flex justify-content-between align-items-start">
              <h6
                style={{
                  fontSize: '1.05rem',
                  marginRight: '0.5rem',
                  marginBottom: '0',
                  fontWeight: '600',
                  color: '#4a90e2',
                  textDecoration: 'underline',
                  lineHeight: '1.3',
                  flex: 1,
                  fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
                }}
              >
                {listing.address}
              </h6>
              <span style={{
                fontSize: '1.1rem',
                fontWeight: 'bold',
                color: 'black',
                whiteSpace: 'nowrap'
              }}>
                €{listing.price?.toLocaleString()}
              </span>
            </div>
            {/* Price per m² and Main Specs on same line */}
            <div className="d-flex justify-content-between align-items-center" style={{ marginTop: '0.25rem' }}>
              {/* Main Specs */}
              <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '0.5rem',
                fontSize: '0.8rem',
                fontWeight: '600',
                color: '#1a202c',
                flex: 1
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
              {/* Price per m² */}
              {listing.pricePerSquareMeter && (
                <span style={{
                  fontSize: '0.75rem',
                  fontWeight: '500',
                  color: '#1a202c',
                  whiteSpace: 'nowrap',
                  marginLeft: '0.5rem'
                }}>
                  per m² €{listing.pricePerSquareMeter.toLocaleString()}
                </span>
              )}
            </div>
          </div>

          {/* Floor and Outdoor Info */}
          {(listing.apartmentFloor || (listing.numberOfStories && listing.numberOfStories >= 2) || outdoorSpaceString) && (
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '0.5rem',
              marginBottom: '0.5rem',
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

          {/* Footer: View Details and Date */}
          <div className="d-flex justify-content-between align-items-center" style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid #e9ecef' }}>
            <Button
              variant="primary"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                handleCardClick();
              }}
              onTouchStart={(e) => {
                e.stopPropagation();
                handleCardClick();
              }}
              style={{
                borderRadius: '8px',
                fontSize: '0.85rem',
                fontWeight: '600',
                padding: '0.4rem 0.8rem',
                touchAction: 'manipulation'
              }}
            >
              View Full Details
            </Button>
            {publishedDate && (
              <small className="text-muted" style={{ fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                <CalendarIcon /> {publishedDate.toLocaleDateString()}
              </small>
            )}
          </div>
        </div>
      </div>

      {/* Full Listing Modal */}
      {showFullModal && (
        <div style={{ position: 'relative', zIndex: 2000 }}>
          <ListingCard
            listing={listing}
            isAnyModalOpen={isAnyModalOpen}
            onModalToggle={(isOpen) => {
              if (!isOpen) {
                handleModalClose();
              }
            }}
            // When opened from the map view, keep the user on the /map route
            // and avoid syncing the URL with /listings/:id.
            disableRouting={true}
            forceOpen={true}
            onRequireLogin={onRequireLogin}
          />
        </div>
      )}

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

export default MapListingCard;

