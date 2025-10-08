import React, { useState, useEffect } from 'react';
import { Card, Carousel, Modal, Button, Row, Col } from 'react-bootstrap';
import { Listing } from '../types';
import BedIcon from './icons/BedIcon';
import BathIcon from './icons/BathIcon';
import RulerIcon from './icons/RulerIcon';
import LeafIcon from './icons/LeafIcon';
import BoltIcon from './icons/BoltIcon';
import CalendarIcon from './icons/CalendarIcon';
import LayersIcon from './icons/LayersIcon';
import { BuildingIcon } from './icons/BuildingIcon';
import { Feature } from './Feature';
import { GlobeIcon } from './icons/GlobeIcon';
import { useNavigate } from 'react-router-dom';

interface ListingCardProps {
  listing: Listing;
  isAnyModalOpen: boolean;
  onModalToggle: (isOpen: boolean) => void;
  forceOpen?: boolean;
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

const ListingCard: React.FC<ListingCardProps> = ({ listing, isAnyModalOpen, onModalToggle, forceOpen }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const navigate = useNavigate();
  const scrapedAtDate = listing.scrapedAt ? listing.scrapedAt.toDate() : null;
  const outdoorSpaceString = getOutdoorSpaceString(listing);

  const mapUrl = listing.coordinates?.lat && listing.coordinates?.lon
    ? `https://maps.google.com/maps?q=${listing.coordinates.lat},${listing.coordinates.lon}&z=15&output=embed`
    : listing.googleMapsUrl;

  useEffect(() => {
    if (forceOpen) {
      handleShowModal();
    }
  }, [forceOpen]);

  const handleShowModal = (imageIndex: number = 0) => {
    setSelectedImageIndex(imageIndex);
    setShowModal(true);
    onModalToggle(true);
    navigate(`/listings/${listing.id}`);
  };

  const handleHideModal = () => {
    setShowModal(false);
    onModalToggle(false);
    navigate(`/`);
  };
  return (
    <>
    <Card style={{ width: '24rem', margin: '1rem' }}>
      <Carousel interval={isAnyModalOpen ? null : 5000}>
        {listing.imageGallery && listing.imageGallery.slice(0, 10).map((url: string, index: number) => (
          <Carousel.Item key={index}>
            <img
              className="d-block w-100"
              src={url}
              alt={`Slide ${index}`}
              style={{ height: '250px', objectFit: 'cover', cursor: 'pointer' }}
              onClick={() => handleShowModal(index)}
            />
          </Carousel.Item>
        ))}
      </Carousel>
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
          {listing.livingArea && <span><RulerIcon /> {listing.livingArea} m²</span>}
          {listing.bedrooms && <Feature icon={<BedIcon />}>{listing.bedrooms}</Feature>}
          {listing.bathrooms && <Feature icon={<BathIcon />}>{listing.bathrooms}</Feature>}
          {listing.energyLabel && <Feature icon={<BoltIcon />}>{listing.energyLabel}</Feature>}
        </div>
        <div className="mb-2" style={{ fontSize: '0.9rem', fontWeight: 'bold', color: 'black' }}>
          {listing.apartmentFloor && (
            <span>
              <BuildingIcon />{' '}
              {typeof listing.apartmentFloor === 'number'
                ? `Floor ${listing.apartmentFloor}`
                : listing.apartmentFloor.toLowerCase().includes('floor')
                ? listing.apartmentFloor
                : `${listing.apartmentFloor} floor`}
            </span>
          )}
          {listing.numberOfStories && listing.numberOfStories >= 2 && (
            <Feature icon={<LayersIcon />}>{listing.numberOfStories} stories</Feature>
          )}
          {outdoorSpaceString && <Feature icon={<LeafIcon />}>{outdoorSpaceString}</Feature>}
        </div>
        <Card.Text style={{ fontSize: '0.85rem' }}>
          {isExpanded ? listing.embeddingText : `${listing.embeddingText.substring(0, 220)}...`}
          <Button variant="link" onClick={() => setIsExpanded(!isExpanded)} style={{ fontSize: '0.8rem', verticalAlign: 'baseline', padding: '0 0.2rem' }}>
            {isExpanded ? 'Show Less' : 'Show More'}
          </Button>
        </Card.Text>
        <div className="d-flex justify-content-between align-items-center">
            <Card.Link href={listing.url} target="_blank">View on Funda</Card.Link>
            <small className="text-muted"><CalendarIcon /> {scrapedAtDate?.toLocaleDateString()}</small>
        </div>
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
          <Carousel className="mb-4" activeIndex={selectedImageIndex} onSelect={(selectedIndex) => setSelectedImageIndex(selectedIndex || 0)}>
            {listing.imageGallery && listing.imageGallery.map((url: string, index: number) => (
              <Carousel.Item key={index}>
                <img
                  className="d-block w-100"
                  src={url}
                  alt={`Slide ${index}`}
                  style={{ height: '400px', objectFit: 'cover', borderRadius: '8px' }}
                />
              </Carousel.Item>
            ))}
          </Carousel>
          <Row>
            <Col md={6}>
              <h5>Details</h5>
              <div className="mb-2" style={{ fontSize: '0.9rem', color: 'black' }}>
                {listing.livingArea && <span><RulerIcon /> {listing.livingArea} m²</span>}
                {listing.bedrooms && <Feature icon={<BedIcon />}>{listing.bedrooms}</Feature>}
                {listing.bathrooms && <Feature icon={<BathIcon />}>{listing.bathrooms}</Feature>}
                {listing.energyLabel && <Feature icon={<BoltIcon />}>{listing.energyLabel}</Feature>}
              </div>
              <div className="mb-3" style={{ fontSize: '0.9rem', color: 'black' }}>
                {listing.apartmentFloor && (
                  <span>
                    <BuildingIcon />{' '}
                    {typeof listing.apartmentFloor === 'number'
                      ? `Floor ${listing.apartmentFloor}`
                      : listing.apartmentFloor.toLowerCase().includes('floor')
                      ? listing.apartmentFloor
                      : `${listing.apartmentFloor} floor`}
                  </span>
                )}
                {listing.numberOfStories && listing.numberOfStories >= 2 && (
                  <Feature icon={<LayersIcon />}>{listing.numberOfStories} stories</Feature>
                )}
                {listing.yearBuilt && <Feature icon={<CalendarIcon />}>Built {listing.yearBuilt}</Feature>}
              </div>
              {outdoorSpaceString && <p style={{ fontSize: '0.9rem' }}><LeafIcon /> {outdoorSpaceString}</p>}
              {listing.neighborhood && <p style={{ fontSize: '0.9rem' }}><GlobeIcon /> {listing.neighborhood}</p>}

              <hr />

              <p><strong>Agent:</strong> {listing.agentUrl ? <a href={listing.agentUrl} target="_blank" rel="noopener noreferrer">{listing.agentName}</a> : listing.agentName}</p>
              {listing.vveContribution && <p><strong>VVE Contribution:</strong> €{listing.vveContribution} per month</p>}
              <Card.Link href={listing.url} target="_blank">View on Funda</Card.Link>
              
              <h5 className="mt-4">Description</h5>
              <p style={{ maxHeight: '200px', overflowY: 'auto', fontSize: '0.9rem' }}>
                {listing.cleanedDescription}
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
                  <Carousel>
                    {listing.floorPlans.map((url, index) => (
                      <Carousel.Item key={index}>
                        <img
                          className="d-block w-100"
                          src={url}
                          alt={`Floor Plan ${index + 1}`}
                          style={{ maxHeight: '350px', objectFit: 'contain' }}
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
    </>
  );
};

export default ListingCard;
