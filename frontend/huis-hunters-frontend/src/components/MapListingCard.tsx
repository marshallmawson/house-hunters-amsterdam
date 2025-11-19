import React, { useState, useEffect } from 'react';
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

const MapListingCard: React.FC<MapListingCardProps> = ({ listing, onClose, onModalToggle, isAnyModalOpen }) => {
  const [showFullModal, setShowFullModal] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [isSaved, setIsSaved] = useState(false);
  const [savedPropertyId, setSavedPropertyId] = useState<string | null>(null);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const { currentUser } = useAuth();
  const outdoorSpaceString = getOutdoorSpaceString(listing);
  const publishedDate = listing.publishedDate ? listing.publishedDate.toDate() : null;

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
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
      return; // Don't show alert, just silently fail
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

  const handleCardClick = () => {
    setShowFullModal(true);
    onModalToggle(true);
  };

  const handleModalClose = () => {
    setShowFullModal(false);
    onModalToggle(false);
  };

  return (
    <>
      {/* Backdrop to close on click outside - only blocks clicks, not card interactions */}
      <div
        onClick={(e) => {
          // Only close if clicking directly on backdrop
          if (e.target === e.currentTarget) {
            onClose();
          }
        }}
        onTouchStart={(e) => {
          // Only close if touching the backdrop directly, not child elements
          if (e.target === e.currentTarget) {
            onClose();
          }
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
        )}

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

