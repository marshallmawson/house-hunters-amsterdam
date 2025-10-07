import React, { useState } from 'react';
import { Card, Carousel, Badge, Button } from 'react-bootstrap';
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
        <div className="d-flex justify-content-between align-items-baseline">
          <Card.Title style={{ fontSize: '1.1rem', marginRight: '1rem' }}>{listing.address}</Card.Title>
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
  );
};

export default ListingCard;
