import React, { useState } from 'react';
import { Card, Carousel, ListGroup, Badge, Button } from 'react-bootstrap';
import { Listing } from '../types';
import { FaBed, FaBath, FaRulerCombined, FaLeaf, FaBolt, FaCalendarAlt } from 'react-icons/fa';

interface ListingCardProps {
  listing: Listing;
}

const ListingCard: React.FC<ListingCardProps> = ({ listing }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const scrapedAtDate = listing.scrapedAt ? listing.scrapedAt.toDate() : null;

  const hasOutdoorSpace = listing.garden || listing.roofTerrace || listing.balcony;

  return (
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
        <div className="d-flex justify-content-between align-items-start">
          <Card.Title>{listing.address}</Card.Title>
          <Badge bg="primary" pill style={{ fontSize: '1.2rem', marginLeft: '1rem' }}>
            €{listing.price?.toLocaleString()}
          </Badge>
        </div>
        <ListGroup horizontal className="my-3">
          <ListGroup.Item><FaBed /> {listing.bedrooms}</ListGroup.Item>
          <ListGroup.Item><FaBath /> {listing.bathrooms}</ListGroup.Item>
          <ListGroup.Item><FaRulerCombined /> {listing.livingArea} m²</ListGroup.Item>
          {hasOutdoorSpace && <ListGroup.Item><FaLeaf /></ListGroup.Item>}
          <ListGroup.Item><FaBolt /> {listing.energyLabel}</ListGroup.Item>
        </ListGroup>
        <Card.Text>
          {isExpanded ? listing.embeddingText : `${listing.embeddingText.substring(0, 100)}...`}
          <Button variant="link" onClick={() => setIsExpanded(!isExpanded)}>
            {isExpanded ? 'Show Less' : 'Show More'}
          </Button>
        </Card.Text>
        <div className="d-flex justify-content-between align-items-center">
            <Card.Link href={listing.url} target="_blank">View on Funda</Card.Link>
            <small className="text-muted"><FaCalendarAlt /> {scrapedAtDate?.toLocaleDateString()}</small>
        </div>
      </Card.Body>
    </Card>
  );
};

export default ListingCard;