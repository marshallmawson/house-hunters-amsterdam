import React, { useState } from 'react';
import { Card, Carousel, Badge, Button } from 'react-bootstrap';
import { Listing } from '../types';
import BedIcon from './icons/BedIcon';
import BathIcon from './icons/BathIcon';
import RulerIcon from './icons/RulerIcon';
import LeafIcon from './icons/LeafIcon';
import BoltIcon from './icons/BoltIcon';
import CalendarIcon from './icons/CalendarIcon';
import TreeIcon from './icons/TreeIcon';

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
  const scrapedAtDate = listing.scrapedAt ? listing.scrapedAt.toDate() : null;
  const outdoorSpaceString = getOutdoorSpaceString(listing);

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
        <div className="text-muted" style={{ fontSize: '0.9rem' }}>
          {listing.livingArea && <span><RulerIcon /> {listing.livingArea} m²</span>}
          {listing.bedrooms && <span className="ms-3"><BedIcon /> {listing.bedrooms}</span>}
          {listing.bathrooms && <span className="ms-3"><BathIcon /> {listing.bathrooms}</span>}
          {listing.energyLabel && <span className="ms-3"><BoltIcon /> {listing.energyLabel}</span>}
          {outdoorSpaceString && <span className="ms-3"><LeafIcon /> {outdoorSpaceString}</span>}
        </div>
        <Card.Text>
          {isExpanded ? listing.embeddingText : `${listing.embeddingText.substring(0, 100)}...`}
          <Button variant="link" onClick={() => setIsExpanded(!isExpanded)}>
            {isExpanded ? 'Show Less' : 'Show More'}
          </Button>
        </Card.Text>
        <div className="d-flex justify-content-between align-items-center">
            <Card.Link href={listing.url} target="_blank">View on Funda</Card.Link>
            <small className="text-muted"><CalendarIcon /> {scrapedAtDate?.toLocaleDateString()}</small>
        </div>
      </Card.Body>
    </Card>
  );
};

export default ListingCard;