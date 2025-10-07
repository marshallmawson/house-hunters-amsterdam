
import React from 'react';
import { Card, Carousel, ListGroup } from 'react-bootstrap';
import { Listing } from '../types';

interface ListingCardProps {
  listing: Listing;
}

const ListingCard: React.FC<ListingCardProps> = ({ listing }) => {
  const scrapedAtDate = listing.scrapedAt ? listing.scrapedAt.toDate() : null;

  return (
    <Card style={{ width: '18rem', margin: '1rem' }}>
      <Carousel>
        {listing.imageGallery && Object.values(listing.imageGallery)?.map((url: string, index: number) => (
          <Carousel.Item key={index} style={{ backgroundColor: 'white' }}>
            <img
              className="d-block w-100"
              src={url}
              alt={`Slide ${index}`}
              style={{ height: '200px', objectFit: 'contain' }}
            />
          </Carousel.Item>
        ))}
      </Carousel>
      <Card.Body>
        <Card.Title>{listing.address}</Card.Title>
        <Card.Text>
          {listing.embeddingText}
        </Card.Text>
      </Card.Body>
      <ListGroup className="list-group-flush">
        <ListGroup.Item>Price: €{listing.price?.toLocaleString()}</ListGroup.Item>
        <ListGroup.Item>Bedrooms: {listing.bedrooms}</ListGroup.Item>
        <ListGroup.Item>Bathrooms: {listing.bathrooms}</ListGroup.Item>
        <ListGroup.Item>Surface: {listing.livingArea} m²</ListGroup.Item>
        <ListGroup.Item>Energy Label: {listing.energyLabel}</ListGroup.Item>
        <ListGroup.Item>Added: {scrapedAtDate?.toLocaleDateString()}</ListGroup.Item>
      </ListGroup>
      <Card.Body>
        <Card.Link href={listing.url} target="_blank">View on Funda</Card.Link>
      </Card.Body>
    </Card>
  );
};

export default ListingCard;
