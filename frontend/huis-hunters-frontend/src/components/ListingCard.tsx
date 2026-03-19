import React, { useState, useEffect } from 'react';
import { Card, Carousel, Modal, Button, Form, Toast } from 'react-bootstrap';
import { Listing } from '../types';
import BedIcon from './icons/BedIcon';
import BathIcon from './icons/BathIcon';
import RulerIcon from './icons/RulerIcon';
import LeafIcon from './icons/LeafIcon';
import BoltIcon from './icons/BoltIcon';
import CalendarIcon from './icons/CalendarIcon';
import LayersIcon from './icons/LayersIcon';
import { BuildingIcon } from './icons/BuildingIcon';
import { useNavigate, useLocation } from 'react-router-dom';
import { useSavedProperty } from '../hooks/useSavedProperty';
import ListingDetailContent from './ListingDetailContent';

interface ListingCardProps {
  listing: Listing;
  isAnyModalOpen?: boolean;
  onModalToggle?: (isOpen: boolean) => void;
  // When true, opens a modal instead of navigating (used for Map view).
  disableRouting?: boolean;
  // When true, the modal opens immediately on mount (used with disableRouting for Map view).
  forceOpen?: boolean;
  onUnsave?: (propertyId: string) => void;
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
  isNew?: boolean;
  isUnavailable?: boolean;
  isOutsideFilters?: boolean;
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
  disableRouting,
  forceOpen,
  onUnsave,
  onRequireLogin,
  viewingScheduledAt,
  onAddToGoogleCalendar,
  note,
  onNoteChange,
  isNoteEditing,
  onNoteEditStart,
  onNoteEditCancel,
  isNew,
  isUnavailable,
  isOutsideFilters
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const publishedDate = listing.publishedDate ? listing.publishedDate.toDate() : null;
  const outdoorSpaceString = getOutdoorSpaceString(listing);

  const [isMobile, setIsMobile] = useState(false);
  const [noteText, setNoteText] = useState(note || '');
  const [showModal, setShowModal] = useState(forceOpen === true);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastHasLink, setToastHasLink] = useState(false);

  const {
    isSaved,
    showUnsaveConfirm,
    setShowUnsaveConfirm,
    handleSave: hookHandleSave,
    handleConfirmUnsave: hookConfirmUnsave,
  } = useSavedProperty(listing.id, { onRequireLogin, onUnsave });

  // Mobile detection
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Sync noteText with note prop when editing starts
  useEffect(() => {
    if (isNoteEditing && note !== undefined) {
      setNoteText(note || '');
    }
  }, [isNoteEditing, note]);

  const handleCardClick = () => {
    if (disableRouting) {
      // Map view: open modal in-place
      setShowModal(true);
      onModalToggle?.(true);
    } else {
      // Grid view: navigate to detail page
      if (location.search) sessionStorage.setItem('listingFilters', location.search);
      navigate(`/listings/${listing.id}`, { state: { from: location.pathname } });
    }
  };

  const handleHideModal = () => {
    setShowModal(false);
    onModalToggle?.(false);
  };

  const handleSaveClick = () => {
    hookHandleSave().then((result) => {
      if (result) {
        setToastMessage(result.message);
        setToastHasLink(result.hasLink);
        setShowToast(true);
      }
    });
  };

  const handleConfirmUnsaveClick = () => {
    hookConfirmUnsave().then((result) => {
      if (result) {
        setToastMessage(result.message);
        setToastHasLink(result.hasLink);
        setShowToast(true);
      }
    });
  };

  return (
    <>
    <Card className="listing-card" style={{ width: isMobile ? '100%' : '24rem' }}>
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
                onClick={() => handleCardClick()}
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
        {/* New Badge - Top Left Corner */}
        {isNew && (
          <div
            style={{
              position: 'absolute',
              top: '10px',
              left: '10px',
              backgroundColor: 'rgba(40, 167, 69, 0.7)',
              color: 'white',
              fontSize: '0.7rem',
              fontWeight: '600',
              padding: '0.25rem 0.5rem',
              borderRadius: '4px',
              zIndex: 5,
              boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
              whiteSpace: 'nowrap'
            }}
          >
            New
          </div>
        )}
        {/* Unavailable Badge - Below New badge if both present */}
        {isUnavailable && (
          <div
            style={{
              position: 'absolute',
              top: isNew ? '42px' : '10px',
              left: '10px',
              backgroundColor: 'rgba(220, 53, 69, 0.75)',
              color: 'white',
              fontSize: '0.7rem',
              fontWeight: '600',
              padding: '0.25rem 0.5rem',
              borderRadius: '4px',
              zIndex: 5,
              boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
              whiteSpace: 'nowrap'
            }}
          >
            Unavailable
          </div>
        )}
        {/* Outside Filters Badge - Bottom Left Corner */}
        {isOutsideFilters && (
          <div
            style={{
              position: 'absolute',
              bottom: '10px',
              left: '10px',
              backgroundColor: 'rgba(255, 193, 7, 0.9)',
              color: '#1a1a1a',
              fontSize: '0.65rem',
              fontWeight: '600',
              padding: '0.25rem 0.5rem',
              borderRadius: '4px',
              zIndex: 5,
              boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
              whiteSpace: 'nowrap'
            }}
          >
            Outside your filters
          </div>
        )}
        {/* Heart Save Button - Top Right Corner */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleSaveClick();
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
              onClick={() => handleCardClick()}
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

        {/* Floor and Outdoor Info */}
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
            onClick={() => handleCardClick()}
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

        {/* Viewing Scheduled/Viewed Section - Inside Card */}
        {viewingScheduledAt && (() => {
          const viewingDate = viewingScheduledAt.toDate();
          const now = new Date();
          const isPast = viewingDate < now;
          const label = isPast ? 'Viewed:' : 'Viewing scheduled:';

          return (
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
                  <strong>{label}</strong>{' '}
                  {viewingDate.toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false
                  }).replace(/,/g, '')}
                </small>
              </div>
              {onAddToGoogleCalendar && !isPast && (
                <Button
                  variant="outline-primary"
                  size="sm"
                  onClick={onAddToGoogleCalendar}
                  style={{ fontSize: '0.85rem' }}
                >
                  📅 Add to Google Calendar
                </Button>
              )}
            </div>
          );
        })()}

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

    {/* Map view modal — wraps ListingDetailContent */}
    {disableRouting && (
      <Modal show={showModal} onHide={handleHideModal} size="lg" centered>
        <ListingDetailContent
          listing={listing}
          isMobile={isMobile}
          onRequireLogin={onRequireLogin}
          onUnsave={onUnsave}
          context="modal"
          onClose={handleHideModal}
        />
      </Modal>
    )}

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
};

export default ListingCard;
