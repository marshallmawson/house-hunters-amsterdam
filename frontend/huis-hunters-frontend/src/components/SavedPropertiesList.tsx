import React, { useState, useMemo } from 'react';
import { SavedProperty, PropertyStatus } from '../types';
import ListingCard from './ListingCard';
import { Container, Row, Col, Form, Dropdown, Button, Badge, Modal, FormGroup } from 'react-bootstrap';

interface SavedPropertiesListProps {
  savedProperties: (SavedProperty & { listing?: any })[];
  onUnsave: (propertyId: string) => void;
  onStatusChange: (propertyId: string, status: PropertyStatus, viewingDate?: Date) => void;
  onNoteChange: (propertyId: string, note: string) => void;
  loading: boolean;
}

const SavedPropertiesList: React.FC<SavedPropertiesListProps> = ({
  savedProperties,
  onUnsave,
  onStatusChange,
  onNoteChange,
  loading
}) => {
  const [statusFilter, setStatusFilter] = useState<PropertyStatus | 'all'>('all');
  const [availabilityFilter, setAvailabilityFilter] = useState<'all' | 'available' | 'unavailable'>('all');
  const [sortBy, setSortBy] = useState<'date-added-new' | 'date-added-old' | 'status-date' | 'price'>('date-added-new');
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [selectedProperty, setSelectedProperty] = useState<SavedProperty | null>(null);
  const [viewingDate, setViewingDate] = useState('');
  const [viewingTime, setViewingTime] = useState('');
  const [isAnyModalOpen, setIsAnyModalOpen] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteText, setNoteText] = useState('');

  const statusOptions: PropertyStatus[] = [
    'to contact',
    'viewing scheduled',
    'to make an offer',
    'offer entered',
    'offer rejected'
  ];

  const filteredAndSorted = useMemo(() => {
    let filtered = [...savedProperties];

    // Filter by status
    if (statusFilter !== 'all') {
      filtered = filtered.filter(sp => sp.status === statusFilter);
    }

    // Filter by availability
    if (availabilityFilter === 'available') {
      filtered = filtered.filter(sp => sp.listing?.available !== false);
    } else if (availabilityFilter === 'unavailable') {
      filtered = filtered.filter(sp => sp.listing?.available === false);
    }

    // Separate available and unavailable
    const available = filtered.filter(sp => sp.listing?.available !== false);
    const unavailable = filtered.filter(sp => sp.listing?.available === false);

    // Sort available properties
    available.sort((a, b) => {
      switch (sortBy) {
        case 'date-added-new':
          return b.addedAt.seconds - a.addedAt.seconds;
        case 'date-added-old':
          return a.addedAt.seconds - b.addedAt.seconds;
        case 'status-date':
          const statusOrder: Record<PropertyStatus, number> = {
            'to contact': 1,
            'viewing scheduled': 2,
            'to make an offer': 3,
            'offer entered': 4,
            'offer rejected': 5
          };
          const statusDiff = statusOrder[a.status] - statusOrder[b.status];
          if (statusDiff !== 0) return statusDiff;
          return b.addedAt.seconds - a.addedAt.seconds;
        case 'price':
          return (a.listing?.price || 0) - (b.listing?.price || 0);
        default:
          return 0;
      }
    });

    // Sort unavailable properties
    unavailable.sort((a, b) => {
      switch (sortBy) {
        case 'date-added-new':
          return b.addedAt.seconds - a.addedAt.seconds;
        case 'date-added-old':
          return a.addedAt.seconds - b.addedAt.seconds;
        case 'status-date':
          const statusOrder: Record<PropertyStatus, number> = {
            'to contact': 1,
            'viewing scheduled': 2,
            'to make an offer': 3,
            'offer entered': 4,
            'offer rejected': 5
          };
          const statusDiff = statusOrder[a.status] - statusOrder[b.status];
          if (statusDiff !== 0) return statusDiff;
          return b.addedAt.seconds - a.addedAt.seconds;
        case 'price':
          return (a.listing?.price || 0) - (b.listing?.price || 0);
        default:
          return 0;
      }
    });

    // Return available first, then unavailable
    return [...available, ...unavailable];
  }, [savedProperties, statusFilter, availabilityFilter, sortBy]);


  const handleStatusSubmit = () => {
    if (!selectedProperty) return;

    let viewingDateTime: Date | undefined;
    if (selectedProperty.status === 'viewing scheduled') {
      if (viewingDate && viewingTime) {
        viewingDateTime = new Date(`${viewingDate}T${viewingTime}`);
      } else {
        alert('Please select both date and time for viewing');
        return;
      }
    }

    onStatusChange(selectedProperty.id, selectedProperty.status, viewingDateTime);
    setShowStatusModal(false);
    setSelectedProperty(null);
    setViewingDate('');
    setViewingTime('');
  };

  const handleAddToGoogleCalendar = (property: SavedProperty & { listing?: any }) => {
    if (!property.viewingScheduledAt || !property.listing) return;

    const listing = property.listing;
    const date = property.viewingScheduledAt.toDate();
    const endDate = new Date(date.getTime() + 30 * 60000); // 30 minutes duration
    
    // Build outdoor space string
    const getOutdoorSpaceString = (listing: any) => {
      const outdoorSpaces = [];
      if (listing.hasGarden) outdoorSpaces.push('Garden');
      if (listing.hasRooftopTerrace) outdoorSpaces.push('Rooftop Terrace');
      if (listing.hasBalcony) outdoorSpaces.push('Balcony');
      if (outdoorSpaces.length === 0) return null;
      const area = listing.outdoorSpaceArea ? ` (${listing.outdoorSpaceArea} m²)` : '';
      return `${outdoorSpaces.join(' + ')}${area}`;
    };
    
    const outdoorSpaceString = getOutdoorSpaceString(listing);
    
    // Build details section
    const details: string[] = [];
    if (listing.livingArea) details.push(`Living Area: ${listing.livingArea} m²`);
    if (listing.energyLabel) details.push(`Energy Label: ${listing.energyLabel}`);
    if (listing.bedrooms) details.push(`Bedrooms: ${listing.bedrooms}`);
    if (listing.bathrooms) details.push(`Bathrooms: ${listing.bathrooms}`);
    if (outdoorSpaceString) details.push(`Outdoor Space: ${outdoorSpaceString}`);
    
    // Build property info section
    const propertyInfo: string[] = [];
    if (listing.apartmentFloor) {
      const floorText = typeof listing.apartmentFloor === 'number'
        ? `Floor ${listing.apartmentFloor}`
        : listing.apartmentFloor.toLowerCase().includes('floor')
        ? listing.apartmentFloor
        : `${listing.apartmentFloor} floor`;
      propertyInfo.push(`Floor: ${floorText}`);
    }
    if (listing.numberOfStories && listing.numberOfStories >= 2) {
      propertyInfo.push(`Stories: ${listing.numberOfStories}`);
    }
    if (listing.yearBuilt) {
      propertyInfo.push(`Year Built: ${listing.yearBuilt}`);
    }
    if (listing.vveContribution) {
      propertyInfo.push(`VVE Contribution: €${listing.vveContribution}/mo`);
    }
    
    // Build description with bulleted lists
    let description = `Viewing scheduled for ${listing.address}\n\n`;
    description += `Price: €${listing.price?.toLocaleString()}\n\n`;
    
    if (details.length > 0) {
      description += `Details:\n`;
      details.forEach(detail => {
        description += `• ${detail}\n`;
      });
      description += `\n`;
    }
    
    if (propertyInfo.length > 0) {
      description += `Property Info:\n`;
      propertyInfo.forEach(info => {
        description += `• ${info}\n`;
      });
      description += `\n`;
    }
    
    if (listing.neighborhood) {
      description += `Neighborhood: ${listing.neighborhood}\n`;
    }
    
    if (listing.agentName) {
      description += `Agent: ${listing.agentName}\n`;
    }
    
    if (listing.url) {
      description += `\nMore info: ${listing.url}`;
    }
    
    // Build title with area if available
    const areaText = listing.area ? ` (${listing.area})` : '';
    const title = encodeURIComponent(`Viewing: ${listing.address}${areaText}`);
    const encodedDescription = encodeURIComponent(description);
    const location = encodeURIComponent(`${listing.address}, Amsterdam, NL`);
    
    // Format dates as YYYYMMDDTHHMMSSZ
    const formatDate = (d: Date) => {
      return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    };
    
    const googleCalendarUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${formatDate(date)}/${formatDate(endDate)}&details=${encodedDescription}&location=${location}`;
    
    window.open(googleCalendarUrl, '_blank');
  };

  if (loading) {
    return <div className="text-center mt-5">Loading saved properties...</div>;
  }

  if (savedProperties.length === 0) {
    return (
      <div className="text-center mt-5">
        <h4>No saved properties yet</h4>
        <p>Start saving properties to see them here!</p>
      </div>
    );
  }

  return (
    <Container>
      {/* Filters and Sort */}
      <Row className="mb-4">
        <Col md={4}>
          <Form.Label><strong>Filter by Status:</strong></Form.Label>
          <Form.Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as PropertyStatus | 'all')}>
            <option value="all">All Statuses</option>
            {statusOptions.map(status => (
              <option key={status} value={status}>{status.charAt(0).toUpperCase() + status.slice(1)}</option>
            ))}
          </Form.Select>
        </Col>
        <Col md={4}>
          <Form.Label><strong>Filter by Availability:</strong></Form.Label>
          <Form.Select value={availabilityFilter} onChange={(e) => setAvailabilityFilter(e.target.value as any)}>
            <option value="all">All</option>
            <option value="available">Available</option>
            <option value="unavailable">Unavailable</option>
          </Form.Select>
        </Col>
        <Col md={4}>
          <Form.Label><strong>Sort by:</strong></Form.Label>
          <Form.Select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)}>
            <option value="date-added-new">Date Added (Newest)</option>
            <option value="date-added-old">Date Added (Oldest)</option>
            <option value="status-date">Status + Date Added</option>
            <option value="price">Price (Low to High)</option>
          </Form.Select>
        </Col>
      </Row>

      {/* Results count */}
      <div className="mb-3">
        <strong>Showing {filteredAndSorted.length} of {savedProperties.length} saved properties</strong>
      </div>

      {/* Properties List */}
      <Row>
        {filteredAndSorted.map(savedProp => {
          if (!savedProp.listing) {
            return (
              <Col key={savedProp.id} sm={12} md={6} lg={4}>
                <div className="card mb-3">
                  <div className="card-body">
                    <h6>Property {savedProp.listingId}</h6>
                    <p className="text-muted">Listing data not available</p>
                    <Badge bg="secondary" className="me-2">{savedProp.status}</Badge>
                    {savedProp.listing?.available === false && (
                      <Badge bg="danger">Unavailable</Badge>
                    )}
                    <div className="mt-2">
                      <Button
                        variant="outline-danger"
                        size="sm"
                        onClick={() => onUnsave(savedProp.id)}
                      >
                        Unsave
                      </Button>
                    </div>
                  </div>
                </div>
              </Col>
            );
          }

          return (
            <Col key={savedProp.id} sm={12} md={6} lg={4}>
              <div style={{ position: 'relative' }}>
                {/* Status Dropdown - Top Left Corner Over Image */}
                <div
                  style={{
                    position: 'absolute',
                    top: '10px',
                    left: '10px',
                    zIndex: 6
                  }}
                >
                  <Dropdown>
                    <Dropdown.Toggle
                      variant="light"
                      size="sm"
                      style={{
                        backgroundColor: 'white',
                        border: '1px solid #dee2e6',
                        borderRadius: '6px',
                        fontSize: '0.85rem',
                        fontWeight: '500',
                        padding: '0.35rem 0.75rem',
                        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
                        minWidth: '140px',
                        color: '#495057'
                      }}
                    >
                      {savedProp.status.charAt(0).toUpperCase() + savedProp.status.slice(1)}
                    </Dropdown.Toggle>
                    <Dropdown.Menu>
                      {statusOptions.map(status => (
                        <Dropdown.Item
                          key={status}
                          onClick={() => {
                            const newProp = { ...savedProp, status };
                            setSelectedProperty(newProp);
                            if (status === 'viewing scheduled') {
                              // If already has viewing scheduled date, populate it
                              if (savedProp.viewingScheduledAt) {
                                const date = savedProp.viewingScheduledAt.toDate();
                                setViewingDate(date.toISOString().split('T')[0]);
                                setViewingTime(date.toTimeString().split(' ')[0].slice(0, 5));
                              } else {
                                setViewingDate('');
                                setViewingTime('');
                              }
                              setShowStatusModal(true);
                            } else {
                              onStatusChange(savedProp.id, status);
                            }
                          }}
                        >
                          {status.charAt(0).toUpperCase() + status.slice(1)}
                        </Dropdown.Item>
                      ))}
                    </Dropdown.Menu>
                  </Dropdown>
                </div>
                
                {/* Unavailable Badge - Top Right Corner Over Image */}
                {savedProp.listing.available === false && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '10px',
                      right: '10px',
                      zIndex: 6
                    }}
                  >
                    <Badge bg="danger" style={{ padding: '0.35rem 0.75rem', fontSize: '0.85rem' }}>
                      Unavailable
                    </Badge>
                  </div>
                )}

                <ListingCard
                  listing={savedProp.listing}
                  isAnyModalOpen={isAnyModalOpen}
                  onModalToggle={setIsAnyModalOpen}
                  onUnsave={onUnsave}
                  viewingScheduledAt={savedProp.status === 'viewing scheduled' && savedProp.viewingScheduledAt ? savedProp.viewingScheduledAt : undefined}
                  onAddToGoogleCalendar={savedProp.status === 'viewing scheduled' && savedProp.viewingScheduledAt ? () => handleAddToGoogleCalendar(savedProp) : undefined}
                  note={savedProp.note}
                  onNoteChange={(noteText) => onNoteChange(savedProp.id, noteText)}
                  isNoteEditing={editingNoteId === savedProp.id}
                  onNoteEditStart={() => {
                    setEditingNoteId(savedProp.id);
                    setNoteText(savedProp.note || '');
                  }}
                  onNoteEditCancel={() => {
                    setEditingNoteId(null);
                    setNoteText('');
                  }}
                />
              </div>
            </Col>
          );
        })}
      </Row>

      {/* Status Modal */}
      <Modal show={showStatusModal} onHide={() => setShowStatusModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title>Update Status</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {selectedProperty && (
            <>
              <FormGroup className="mb-3">
                <Form.Label>Status</Form.Label>
                <Form.Select
                  value={selectedProperty.status}
                  onChange={(e) => {
                    setSelectedProperty({ ...selectedProperty, status: e.target.value as PropertyStatus });
                    if (e.target.value !== 'viewing scheduled') {
                      setViewingDate('');
                      setViewingTime('');
                    }
                  }}
                >
                  {statusOptions.map(status => (
                    <option key={status} value={status}>
                      {status.charAt(0).toUpperCase() + status.slice(1)}
                    </option>
                  ))}
                </Form.Select>
              </FormGroup>

              {selectedProperty.status === 'viewing scheduled' && (
                <>
                  <FormGroup className="mb-3">
                    <Form.Label>Date</Form.Label>
                    <Form.Control
                      type="date"
                      value={viewingDate}
                      onChange={(e) => setViewingDate(e.target.value)}
                      required
                    />
                  </FormGroup>
                  <FormGroup className="mb-3">
                    <Form.Label>Time</Form.Label>
                    <Form.Control
                      type="time"
                      value={viewingTime}
                      onChange={(e) => setViewingTime(e.target.value)}
                      required
                    />
                  </FormGroup>
                </>
              )}
            </>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowStatusModal(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleStatusSubmit}>
            Update Status
          </Button>
        </Modal.Footer>
      </Modal>

    </Container>
  );
};

export default SavedPropertiesList;

