
import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import ListingCard from './ListingCard';
import { Container, Row, Col } from 'react-bootstrap';
import { Listing } from '../types';

const Listings = () => {
  const [listings, setListings] = useState<Listing[]>([]);

  useEffect(() => {
    const fetchListings = async () => {
      const q = query(collection(db, "listings"), where("status", "==", "processed"));
      const querySnapshot = await getDocs(q);
      const listingsData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Listing));
      setListings(listingsData);
    };

    fetchListings();
  }, []);

  return (
    <Container>
        <Row>
            {listings.map(listing => (
            <Col key={listing.id} sm={12} md={6} lg={4} xl={3}>
                <ListingCard listing={listing} />
            </Col>
            ))}
        </Row>
    </Container>
  );
};

export default Listings;
