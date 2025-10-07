import React, { useState } from 'react';
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

interface ListingCardProps {
  listing: Listing;
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

const ListingCard: React.FC<ListingCardProps> = ({ listing }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const scrapedAtDate = listing.scrapedAt ? listing.scrapedAt.toDate() : null;
  const outdoorSpaceString = getOutdoorSpaceString(listing);

  const mapUrl = listing.coordinates?.lat && listing.coordinates?.lon
    ? `https://maps.google.com/maps?q=${listing.coordinates.lat},${listing.coordinates.lon}&z=15&output=embed`
    : listing.googleMapsUrl;


  return (
    <>
    <Card style={{ width: '24rem', margin: '1rem' }}>
      <Carousel>
        {listing.imageGallery && Object.values(listing.imageGallery)?.map((url: string, index: number) => (
          <Carousel.Item key={index}>
            <img
              className="d-block w-100"
              src={url}
              alt={`Slide ${index}`}
              style={{ height: '250px', objectFit: 'cover' }}
            />
          </Carousel.Item>
        ))}
      </Carousel>
      <Card.Body>
        <div className="d-flex justify-content-between align-items-baseline">
          <Card.Title 
            style={{ fontSize: '1.1rem', marginRight: '1rem', cursor: 'pointer', textDecoration: 'underline' }}
            onClick={() => setShowModal(true)}
          >
            {listing.address}
          </Card.Title>
          <span style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'black', whiteSpace: 'nowrap' }}>
            €{listing.price?.toLocaleString()}
          </span>
        </div>
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
                : listing.apartmentFloor.includes('floor')
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

    <Modal show={showModal} onHide={() => setShowModal(false)} size="lg" centered>
        <Modal.Header closeButton>
          <Modal.Title>{listing.address}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Row>
            <Col md={6}>
              <h5>Details</h5>
              <p><strong>Agent:</strong> <a href={listing.agentUrl} target="_blank" rel="noopener noreferrer">{listing.agentName}</a></p>
              {listing.vveContribution && <p><strong>VVE Contribution:</strong> €{listing.vveContribution} per month</p>}
              
              <h5 className="mt-4">Description</h5>
              <p style={{ maxHeight: '200px', overflowY: 'auto', fontSize: '0.9rem' }}>
                {listing.cleanedDescription}
              </p>

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
                          style={{ maxHeight: '400px', objectFit: 'contain' }}
                        />
                      </Carousel.Item>
                    ))}
                  </Carousel>
                </>
              )}
            </Col>
            <Col md={6}>
              {mapUrl && (
                <>
                  <h5>Location</h5>
                  <iframe
                    src={mapUrl}
                    width="100%"
                    height="450"
                    style={{ border: 0 }}
                    allowFullScreen={false}
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    title={`Map of ${listing.address}`}
                  ></iframe>
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
