import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import ListingCard from './ListingCard';
import { Container, Row, Col, Form, FormGroup } from 'react-bootstrap';
import { Listing } from '../types';
import Slider from 'rc-slider';
import 'rc-slider/assets/index.css';
import { useSearchParams, useParams, useNavigate } from 'react-router-dom';
import Select, { components, OptionProps, MultiValue, ValueContainerProps, StylesConfig } from 'react-select';

const Option = (props: OptionProps<{ value: string; label: string; }, true>) => {
  return (
    <div>
      <components.Option {...props}>
        <input
          type="checkbox"
          checked={props.isSelected}
          onChange={() => null}
        />{' '}
        <label>{props.label}</label>
      </components.Option>
    </div>
  );
};

const ValueContainer = (props: ValueContainerProps<{ value: string; label: string; }, true>) => {
  const { children } = props;
  const { length } = props.getValue();
  if (length > 1) {
    return (
      <components.ValueContainer {...props}>
        <>Multiple</>
      </components.ValueContainer>
    );
  }
  return (
    <components.ValueContainer {...props}>
      {children}
    </components.ValueContainer>
  );
};

const areaSelectStyles: StylesConfig<{ value: string; label: string; }, true> = {
  menu: (provided) => ({ ...provided, zIndex: 9999 }),
};

const Listings = () => {
  const [listings, setListings] = useState<Listing[]>([]);
  const [filteredListings, setFilteredListings] = useState<Listing[]>([]);
  const [searchParams, setSearchParams] = useSearchParams();
  const { id: modalListingId } = useParams();
  const navigate = useNavigate();

  const [sortOrder, setSortOrder] = useState(searchParams.get('sort') || 'date-new-old');
  const [priceRange, setPriceRange] = useState({ 
    min: parseInt(searchParams.get('minPrice') || '300000', 10),
    max: parseInt(searchParams.get('maxPrice') || '1000000', 10)
  });
  const [bedrooms, setBedrooms] = useState(searchParams.get('bedrooms') || 'any');
  const [floorLevel, setFloorLevel] = useState(searchParams.get('floor') || 'any');
  const [outdoorSpace, setOutdoorSpace] = useState(searchParams.get('outdoor') || 'any');
  const [selectedAreas, setSelectedAreas] = useState<string[]>(searchParams.get('areas')?.split(',').filter(Boolean) || []);
  const [isModalOpen, setIsModalOpen] = useState(!!modalListingId);

  const uniqueAreas = useMemo(() => {
    const areas = new Set<string>();
    listings.forEach(listing => {
        if (listing.area) {
            areas.add(listing.area);
        }
    });
    return Array.from(areas).sort();
  }, [listings]);

  useEffect(() => {
    const fetchListings = async () => {
      const q = query(collection(db, "listings"), where("status", "==", "processed"));
      const querySnapshot = await getDocs(q);
      const listingsData = querySnapshot.docs.map(doc => {
        const { publishDate, ...rest } = doc.data();
        let finalPublishedDate;

        if (typeof publishDate === 'string') {
          const date = new Date(publishDate);
          finalPublishedDate = {
            toDate: () => date,
            seconds: Math.floor(date.getTime() / 1000),
            nanoseconds: (date.getTime() % 1000) * 1000000
          };
        } else {
          finalPublishedDate = publishDate;
        }

        return { id: doc.id, ...rest, publishedDate: finalPublishedDate } as Listing;
      });
      setListings(listingsData);
    };

    fetchListings();
  }, []);


  const updateURLParams = useCallback(() => {
    const params = new URLSearchParams();
    if (sortOrder !== 'date-new-old') params.set('sort', sortOrder);
    if (priceRange.min !== 300000) params.set('minPrice', priceRange.min.toString());
    if (priceRange.max !== 1000000) params.set('maxPrice', priceRange.max.toString());
    if (bedrooms !== 'any') params.set('bedrooms', bedrooms);
    if (floorLevel !== 'any') params.set('floor', floorLevel);
    if (outdoorSpace !== 'any') params.set('outdoor', outdoorSpace);
    if (selectedAreas.length > 0) params.set('areas', selectedAreas.join(','));
    setSearchParams(params, { replace: true });
  }, [sortOrder, priceRange, bedrooms, floorLevel, outdoorSpace, selectedAreas, setSearchParams]);

  useEffect(() => {
    updateURLParams();
    let result = [...listings];

    // Sorting
    result.sort((a, b) => {
      switch (sortOrder) {
        case 'price-low-high':
          return (a.price || 0) - (b.price || 0);
        case 'date-new-old':
          const dateDiff = (b.publishedDate?.seconds || 0) - (a.publishedDate?.seconds || 0);
          if (dateDiff !== 0) return dateDiff;
          return (a.price || 0) - (b.price || 0);
        case 'date-old-new':
          return (a.publishedDate?.seconds || 0) - (b.publishedDate?.seconds || 0);
        default:
          return (b.publishedDate?.seconds || 0) - (a.publishedDate?.seconds || 0);
      }
    });

    // Filtering
    result = result.filter(listing => {
      const price = listing.price || 0;
      const passesPrice = price >= priceRange.min && price <= priceRange.max;
      const passesBedrooms = bedrooms === 'any' || (listing.bedrooms || 0) >= parseInt(bedrooms, 10);
      const passesFloorLevel = floorLevel === 'any' ||
        (floorLevel === 'ground' && listing.apartmentFloor === 'Ground') ||
        (floorLevel === 'top' && (listing.apartmentFloor === 'Upper' || listing.apartmentFloor === 'Top floor' || listing.apartmentFloor === 'Upper floor'));
      const passesOutdoorSpace = outdoorSpace === 'any' || 
        (outdoorSpace === 'garden' && listing.hasGarden) ||
        (outdoorSpace === 'rooftop' && listing.hasRooftopTerrace) ||
        (outdoorSpace === 'balcony' && listing.hasBalcony);
      const passesArea = selectedAreas.length === 0 || (listing.area && selectedAreas.includes(listing.area));

      return passesPrice && passesBedrooms && passesFloorLevel && passesOutdoorSpace && passesArea;
    });

    setFilteredListings(result);
  }, [listings, sortOrder, priceRange, bedrooms, floorLevel, outdoorSpace, selectedAreas, updateURLParams]);

  const handleModalToggle = (isOpen: boolean) => {
    setIsModalOpen(isOpen);
    if (!isOpen) {
      navigate('/');
    }
  };

  return (
    <Container>
      <Row className="mb-3">
        <Col>
          <Form>
            <Row>
              <Col md={2}>
                <FormGroup>
                  <Form.Label>Sort by</Form.Label>
                  <Form.Control as="select" value={sortOrder} onChange={e => setSortOrder(e.target.value)}>
                    <option value="date-new-old">Date & Price</option>
                    <option value="date-old-new">Date (Old to New)</option>
                    <option value="price-low-high">Price (Low to High)</option>
                  </Form.Control>
                </FormGroup>
              </Col>
              <Col md={2}>
                <FormGroup>
                  <Form.Label>Price Range</Form.Label>
                  <div style={{ padding: '0 10px' }}>
                    <Slider
                      range
                      min={200000}
                      max={1200000}
                      step={25000}
                      value={[priceRange.min, priceRange.max]}
                      onChange={(values: number | number[]) => {
                        if (Array.isArray(values) && values.length === 2) {
                          setPriceRange({ min: values[0], max: values[1] });
                        }
                      }}
                      allowCross={false}
                    />
                  </div>
                  <div className="d-flex justify-content-between mt-2">
                    <small>€{priceRange.min.toLocaleString()}</small>
                    <small>€{priceRange.max.toLocaleString()}</small>
                  </div>
                </FormGroup>
              </Col>
              <Col md={1}>
                <FormGroup>
                  <Form.Label>Min beds</Form.Label>
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
                  <Form.Label>Outdoor Space</Form.Label>
                  <Form.Control as="select" value={outdoorSpace} onChange={e => setOutdoorSpace(e.target.value)}>
                    <option value="any">Any</option>
                    <option value="garden">Garden</option>
                    <option value="rooftop">Rooftop</option>
                    <option value="balcony">Balcony</option>
                  </Form.Control>
                </FormGroup>
              </Col>              
              <Col md={2}>
                <FormGroup>
                  <Form.Label>Floor Level</Form.Label>
                  <Form.Control as="select" value={floorLevel} onChange={e => setFloorLevel(e.target.value)}>
                    <option value="any">Any</option>
                    <option value="top">Upper / Top Floor</option>
                    <option value="ground">Ground Floor</option>
                  </Form.Control>
                </FormGroup>
              </Col>
              <Col md={3}>
                <FormGroup>
                  <Form.Label>Area</Form.Label>
                  <Select
                      isMulti
                      options={uniqueAreas.map(area => ({ value: area, label: area }))}
                      value={selectedAreas.map(area => ({ value: area, label: area }))}
                      onChange={(selectedOptions: MultiValue<{ value: string; label: string; }>) => setSelectedAreas(selectedOptions.map(option => option.value))}
                      closeMenuOnSelect={false}
                      hideSelectedOptions={false}
                      components={{ Option, ValueContainer }}
                      styles={areaSelectStyles}
                  />
                </FormGroup>
              </Col>
            </Row>
          </Form>
        </Col>
      </Row>
      <Row>
        {filteredListings.map(listing => (
          <Col key={listing.id} sm={12} md={6} lg={6} xl={4}>
            <ListingCard 
              listing={listing} 
              isAnyModalOpen={isModalOpen}
              onModalToggle={handleModalToggle} 
              forceOpen={listing.id === modalListingId}
            />
          </Col>
        ))}
      </Row>
    </Container>
  );
};

export default Listings;