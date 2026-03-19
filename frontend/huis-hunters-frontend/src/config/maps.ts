// Google Maps API configuration
const apiKey = process.env.REACT_APP_GOOGLE_MAPS_API_KEY || 'YOUR_GOOGLE_MAPS_API_KEY';

// Debug logging
console.log('Environment variables check:');
console.log('- REACT_APP_GOOGLE_MAPS_API_KEY exists:', !!process.env.REACT_APP_GOOGLE_MAPS_API_KEY);
console.log('- API Key value:', apiKey ? `${apiKey.substring(0, 10)}...` : 'NO KEY');
console.log('- All env vars:', Object.keys(process.env).filter(key => key.includes('GOOGLE') || key.includes('MAPS')));

export const mapsConfig = {
  // Replace this with your actual Google Maps API key
  apiKey,
  libraries: ['geometry'] as const,
};

// Start loading the Google Maps API script without waiting for it
// Call this early (e.g. app startup) so the script is already in flight
// by the time any map component mounts.
export const preloadGoogleMapsAPI = (): void => {
  if (window.google && window.google.maps) return;
  if (document.querySelector('script[src*="maps.googleapis.com"]')) return;
  const script = document.createElement('script');
  script.src = `https://maps.googleapis.com/maps/api/js?key=${mapsConfig.apiKey}&libraries=${mapsConfig.libraries.join(',')}`;
  script.async = true;
  script.defer = true;
  document.head.appendChild(script);
};

// Function to dynamically load Google Maps API
export const loadGoogleMapsAPI = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    // Check if Google Maps is already loaded
    if (window.google && window.google.maps) {
      resolve();
      return;
    }

    // Debug: Log the API key being used
    console.log('Loading Google Maps API with key:', mapsConfig.apiKey ? `${mapsConfig.apiKey.substring(0, 10)}...` : 'NO KEY');
    console.log('Full URL being loaded:', `https://maps.googleapis.com/maps/api/js?key=${mapsConfig.apiKey}&libraries=${mapsConfig.libraries.join(',')}`);

    // Check if script is already being loaded
    const existingScript = document.querySelector('script[src*="maps.googleapis.com"]');
    if (existingScript) {
      existingScript.addEventListener('load', () => resolve());
      existingScript.addEventListener('error', () => reject(new Error('Failed to load Google Maps API')));
      return;
    }

    // Create and load the script
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${mapsConfig.apiKey}&libraries=${mapsConfig.libraries.join(',')}`;
    script.async = true;
    script.defer = true;
    
    script.onload = () => {
      console.log('Google Maps API loaded successfully');
      resolve();
    };
    script.onerror = (error) => {
      console.error('Failed to load Google Maps API:', error);
      reject(new Error('Failed to load Google Maps API'));
    };
    
    document.head.appendChild(script);
  });
};
