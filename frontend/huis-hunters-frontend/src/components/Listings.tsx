import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import ListingCard from './ListingCard';
import { Container, Row, Col, Form, FormGroup } from 'react-bootstrap';
import { Listing } from '../types';

const Listings = () => {
  const [listings, setListings] = useState<Listing[]>([]);
  const [filteredListings, setFilteredListings] = useState<Listing[]>([]);
  const [sortOrder, setSortOrder] = useState('date-new-old');
  const [priceRange, setPriceRange] = useState({ min: 200000, max: 1500000 });
  const [bedrooms, setBedrooms] = useState('any');
  const [floorLevel, setFloorLevel] = useState('any');
  const [outdoorSpace, setOutdoorSpace] = useState('any');

  useEffect(() => {
    const fetchListings = async () => {
      const q = query(collection(db, "listings"), where("status", "==", "processed"));
      const querySnapshot = await getDocs(q);
      const listingsData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Listing));
      setListings(listingsData);
    };

    fetchListings();
  }, []);

  useEffect(() => {
    if (listings.length > 0) {
      console.log("First listing data:", listings[0]);
    }
    let result = [...listings];

    // Sorting
    result.sort((a, b) => {
      switch (sortOrder) {
        case 'price-low-high':
          return (a.price || 0) - (b.price || 0);
        case 'date-new-old':
          const dateDiff = (b.scrapedAt?.seconds || 0) - (a.scrapedAt?.seconds || 0);
          if (dateDiff !== 0) return dateDiff;
          return (a.price || 0) - (b.price || 0);
        case 'date-old-new':
          return (a.scrapedAt?.seconds || 0) - (b.scrapedAt?.seconds || 0);
        default:
          return (b.scrapedAt?.seconds || 0) - (a.scrapedAt?.seconds || 0);
      }
    });

    // Filtering
    result = result.filter(listing => {
      const price = listing.price || 0;

      const passesPrice = price >= priceRange.min && price <= priceRange.max;
      const passesBedrooms = bedrooms === 'any' || (listing.bedrooms || 0) >= parseInt(bedrooms, 10);
      
      const passesFloorLevel = floorLevel === 'any' ||
        (floorLevel === 'ground' && listing.apartmentFloor === 'Ground') || (floorLevel === 'top' && listing.apartmentFloor === 'Top floor');
      const passesOutdoorSpace = outdoorSpace === 'any' || 
        (outdoorSpace === 'garden' && listing.hasGarden) ||
        (outdoorSpace === 'rooftop' && listing.hasRooftopTerrace) ||
        (outdoorSpace === 'balcony' && listing.hasBalcony);

      return passesPrice && passesBedrooms && passesFloorLevel && passesOutdoorSpace;
    });

    setFilteredListings(result);
  }, [listings, sortOrder, priceRange, bedrooms, floorLevel, outdoorSpace]);

  return (
    <Container>
      <Row className="mb-3">
        <Col>
          <Form>
            <Row>
              <Col md={3}>
                <FormGroup>
                  <Form.Label>Sort by</Form.Label>
                  <Form.Control as="select" value={sortOrder} onChange={e => setSortOrder(e.target.value)}>
                    <option value="date-new-old">Date & Price</option>
                    <option value="date-old-new">Date (Old to New)</option>
                    <option value="price-low-high">Price (Low to High)</option>
                  </Form.Control>
                </FormGroup>
              </Col>
              <Col md={3}>
                <FormGroup>
                  <Form.Label>Min Price (€{priceRange.min.toLocaleString()})</Form.Label>
                  <Form.Range 
                    min={0} 
                    max={2000000} 
                    step={50000}
                    value={priceRange.min} 
                    onChange={e => setPriceRange({ ...priceRange, min: parseInt(e.target.value) })}
                  />
                </FormGroup>
                <FormGroup>
                  <Form.Label>Max Price (€{priceRange.max.toLocaleString()})</Form.Label>
                  <Form.Range 
                    min={0} 
                    max={2000000} 
                    step={50000}
                    value={priceRange.max} 
                    onChange={e => setPriceRange({ ...priceRange, max: parseInt(e.target.value) })}
                  />
                </FormGroup>
              </Col>
              <Col md={2}>
                <FormGroup>
                  <Form.Label>Min Bedrooms</Form.Label>
                  <Form.Control as="select" value={bedrooms} onChange={e => setBedrooms(e.target.value)}>
                    <option value="any">Any</option>
                    <option value="1">1+</option>
                    <option value="2">2+</option>
                    <option value="3">3+</option>
                    <option value="4">4+</option>
                  </Form.Control>
                </FormGroup>
              </Col>
              <Col md={2}>
                <FormGroup>
                  <Form.Label>Floor Level</Form.Label>
                  <Form.Control as="select" value={floorLevel} onChange={e => setFloorLevel(e.target.value)}>
                    <option value="any">Any</option>
                    <option value="top">Top Floor</option>
                    <option value="ground">Ground Floor</option>
                  </Form.Control>
                </FormGroup>
              </Col>
              <Col md={2}>
                <FormGroup>
                  <Form.Label>Outdoor Space</Form.Label>
                  <Form.Control as="select" value={outdoorSpace} onChange={e => setOutdoorSpace(e.target.value)}>
                    <option value="any">Any</option>
                    <option value="garden">Garden</option>
                    <option value="rooftop">Rooftop</option>
                    <option value="balcony">Balcony</option>
                  </Form.Control>
                </FormGroup>
              </Col>
            </Row>
          </Form>
        </Col>
      </Row>
      <Row>
        {filteredListings.map(listing => (
          <Col key={listing.id} sm={12} md={6} lg={6} xl={4}>
            <ListingCard listing={listing} />
          </Col>
        ))}
      </Row>
    </Container>
  );
};

export default Listings;