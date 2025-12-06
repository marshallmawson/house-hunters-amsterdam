import React, { useEffect, useRef, useState } from 'react';
import { Modal, Button, Row, Col } from 'react-bootstrap';
import { Neighborhood, parseKMLNeighborhoods } from '../utils/neighborhoodParser';
import { loadGoogleMapsAPI } from '../config/maps';

interface NeighborhoodMapProps {
  show: boolean;
  onHide: () => void;
  selectedNeighborhoods: string[];
  onNeighborhoodSelect: (neighborhoods: string[]) => void;
  availableNeighborhoods: string[];
}

const NeighborhoodMap: React.FC<NeighborhoodMapProps> = ({
  show,
  onHide,
  selectedNeighborhoods,
  onNeighborhoodSelect,
  availableNeighborhoods
}) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const polygonsRef = useRef<google.maps.Polygon[]>([]);
  const [neighborhoods, setNeighborhoods] = useState<Neighborhood[]>([]);
  const [allNeighborhoodNames, setAllNeighborhoodNames] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [mapsLoaded, setMapsLoaded] = useState(false);
  const [mapsError, setMapsError] = useState(false);

  // Load Google Maps API dynamically
  useEffect(() => {
    if (!show) return;

    const loadMaps = async () => {
      try {
        await loadGoogleMapsAPI();
        setMapsLoaded(true);
      } catch (error) {
        console.error('Failed to load Google Maps API:', error);
        setMapsError(true);
      }
    };

    loadMaps();
  }, [show]);

  // Load KML data
  useEffect(() => {
    const loadNeighborhoods = async () => {
      try {
        const response = await fetch('/neighborhoods.kml');
        const kmlContent = await response.text();
        const parsedNeighborhoods = parseKMLNeighborhoods(kmlContent);
        
        // Show all neighborhoods from KML, regardless of whether they have listings
        setNeighborhoods(parsedNeighborhoods);
        setAllNeighborhoodNames(parsedNeighborhoods.map(n => n.name));
        setLoading(false);
      } catch (error) {
        console.error('Error loading neighborhoods:', error);
        setLoading(false);
      }
    };

    if (show) {
      loadNeighborhoods();
    }
  }, [show]);

  // Initialize map
  useEffect(() => {
    if (!show || !mapRef.current || loading || neighborhoods.length === 0 || !mapsLoaded) return;

    // Initialize Google Map
    const map = new google.maps.Map(mapRef.current, {
      zoom: 12,
      center: { lat: 52.3676, lng: 4.9041 }, // Amsterdam center
      mapTypeId: google.maps.MapTypeId.ROADMAP,
      styles: [
        {
          featureType: 'poi',
          elementType: 'labels',
          stylers: [{ visibility: 'off' }]
        }
      ]
    });

    mapInstanceRef.current = map;

    // Clear existing polygons
    polygonsRef.current.forEach(polygon => polygon.setMap(null));
    polygonsRef.current = [];

    // Create polygons for each neighborhood
    neighborhoods.forEach(neighborhood => {
      const isSelected = selectedNeighborhoods.includes(neighborhood.name);
      
      const polygon = new google.maps.Polygon({
        paths: neighborhood.coordinates.map(([lng, lat]) => ({ lat, lng })),
        strokeColor: isSelected ? '#4a90e2' : '#666666',
        strokeOpacity: 0.8,
        strokeWeight: 2,
        fillColor: isSelected ? '#4a90e2' : '#cccccc',
        fillOpacity: isSelected ? 0.4 : 0.2,
        clickable: true
      });

      polygon.setMap(map);

      // Add click listener
      polygon.addListener('click', () => {
        const newSelected = selectedNeighborhoods.includes(neighborhood.name)
          ? selectedNeighborhoods.filter(n => n !== neighborhood.name)
          : [...selectedNeighborhoods, neighborhood.name];

        onNeighborhoodSelect(newSelected);
        
        // Update polygon appearance
        polygon.setOptions({
          fillColor: newSelected.includes(neighborhood.name) ? '#4a90e2' : '#cccccc',
          fillOpacity: newSelected.includes(neighborhood.name) ? 0.4 : 0.2,
          strokeColor: newSelected.includes(neighborhood.name) ? '#4a90e2' : '#666666'
        });
      });

      // Add hover effects
      polygon.addListener('mouseover', () => {
        if (!selectedNeighborhoods.includes(neighborhood.name)) {
          polygon.setOptions({
            fillColor: '#4a90e2',
            fillOpacity: 0.3,
            strokeColor: '#4a90e2'
          });
        }
      });

      polygon.addListener('mouseout', () => {
        if (!selectedNeighborhoods.includes(neighborhood.name)) {
          polygon.setOptions({
            fillColor: '#cccccc',
            fillOpacity: 0.2,
            strokeColor: '#666666'
          });
        }
      });

      polygonsRef.current.push(polygon);
    });

    // Fit map to show all neighborhoods
    const bounds = new google.maps.LatLngBounds();
    neighborhoods.forEach(neighborhood => {
      neighborhood.coordinates.forEach(([lng, lat]) => {
        bounds.extend({ lat, lng });
      });
    });
    map.fitBounds(bounds);

  }, [show, loading, neighborhoods, selectedNeighborhoods, onNeighborhoodSelect, mapsLoaded]);

  const handleClearAll = () => {
    onNeighborhoodSelect([]);
  };

  const handleSelectAll = () => {
    onNeighborhoodSelect(allNeighborhoodNames);
  };

  return (
    <Modal show={show} onHide={onHide} size="lg" centered>
      <Modal.Header closeButton>
        <Modal.Title>Select Neighborhoods on Map</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {mapsError ? (
          <div className="text-center py-4">
            <div className="alert alert-warning" role="alert">
              <h5>Google Maps API Key Required</h5>
              <p className="mb-3">
                To use the interactive neighborhood map, please set up your Google Maps API key.
              </p>
              <small className="text-muted">
                Add to your .env file: <code>REACT_APP_GOOGLE_MAPS_API_KEY=your_api_key_here</code>
                <br />
                Get your API key from: <a href="https://console.cloud.google.com/google/maps-apis" target="_blank" rel="noopener noreferrer">Google Cloud Console</a>
              </small>
            </div>
          </div>
        ) : loading || !mapsLoaded ? (
          <div className="text-center py-4">
            <div className="spinner-border" role="status">
              <span className="visually-hidden">Loading map...</span>
            </div>
            <p className="mt-2">
              {!mapsLoaded ? 'Loading Google Maps...' : 'Loading neighborhoods...'}
            </p>
          </div>
        ) : (
          <>
            <Row className="mb-2">
              <Col>
                <div className="d-flex justify-content-between align-items-center">
                  <div>
                    <small className="text-muted">
                      Click on neighborhoods to select/deselect them. 
                      Selected: {selectedNeighborhoods.length} of {allNeighborhoodNames.length}
                    </small>
                  </div>
                  <div className="d-flex flex-column flex-md-row gap-2">
                    <Button 
                      variant="outline-secondary" 
                      size="sm" 
                      onClick={handleClearAll}
                      style={{ 
                        minWidth: '90px',
                        padding: '0.375rem 0.75rem'
                      }}
                    >
                      Clear All
                    </Button>
                    <Button 
                      variant="outline-primary" 
                      size="sm" 
                      onClick={handleSelectAll}
                      style={{ 
                        minWidth: '90px',
                        padding: '0.375rem 0.75rem'
                      }}
                    >
                      Select All
                    </Button>
                  </div>
                </div>
              </Col>
            </Row>
            
            <div 
              ref={mapRef} 
              style={{ 
                height: '350px', 
                width: '100%',
                borderRadius: '8px',
                border: '1px solid #dee2e6'
              }} 
            />
            
            {selectedNeighborhoods.length > 0 && (
              <div className="mt-2">
                <h6 style={{ fontSize: '0.9rem', marginBottom: '0.5rem' }}>Selected Neighborhoods:</h6>
                <div className="d-flex flex-wrap gap-1" style={{ maxHeight: '80px', overflowY: 'auto' }}>
                  {selectedNeighborhoods.map(neighborhood => (
                    <span 
                      key={neighborhood}
                      className="badge bg-primary"
                      style={{ fontSize: '0.75rem' }}
                    >
                      {neighborhood}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onHide}>
          Cancel
        </Button>
        <Button variant="primary" onClick={onHide}>
          Apply Selection ({selectedNeighborhoods.length})
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default NeighborhoodMap;
