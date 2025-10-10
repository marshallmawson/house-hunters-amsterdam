// Utility to parse KML data and extract neighborhood information
export interface Neighborhood {
  name: string;
  coordinates: number[][]; // Array of [longitude, latitude] pairs
}

export const parseKMLNeighborhoods = (kmlContent: string): Neighborhood[] => {
  const parser = new DOMParser();
  const kmlDoc = parser.parseFromString(kmlContent, 'text/xml');
  
  const neighborhoods: Neighborhood[] = [];
  const placemarks = kmlDoc.querySelectorAll('Placemark');
  
  placemarks.forEach(placemark => {
    const nameElement = placemark.querySelector('name');
    const coordinatesElement = placemark.querySelector('coordinates');
    
    if (nameElement && coordinatesElement) {
      const name = nameElement.textContent?.trim();
      const coordinatesText = coordinatesElement.textContent?.trim();
      
      if (name && coordinatesText) {
        // Parse coordinates string (format: "lon,lat,alt lon,lat,alt ...")
        const coordPairs = coordinatesText
          .split(/\s+/)
          .map(coord => {
            const [lon, lat] = coord.split(',').map(Number);
            return [lon, lat];
          })
          .filter(([lon, lat]) => !isNaN(lon) && !isNaN(lat));
        
        if (coordPairs.length > 0) {
          neighborhoods.push({
            name,
            coordinates: coordPairs
          });
        }
      }
    }
  });
  
  return neighborhoods;
};

// Helper function to calculate center point of a polygon
export const getPolygonCenter = (coordinates: number[][]): { lat: number; lng: number } => {
  let latSum = 0;
  let lngSum = 0;
  
  coordinates.forEach(([lng, lat]) => {
    latSum += lat;
    lngSum += lng;
  });
  
  return {
    lat: latSum / coordinates.length,
    lng: lngSum / coordinates.length
  };
};
