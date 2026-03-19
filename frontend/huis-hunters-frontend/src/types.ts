export interface Listing {
  id: string;
  address: string;
  price: number;
  bedrooms: number;
  bathrooms: number;
  livingArea: number;
  energyLabel: string;
  scrapedAt: {
    seconds: number;
    nanoseconds: number;
    toDate: () => Date;
  };
  publishedDate: {
    seconds: number;
    nanoseconds: number;
    toDate: () => Date;
  };
  url: string;
  imageGallery: string[];
  embeddingText: string;
  floor?: string;
  hasGarden?: boolean;
  hasRooftopTerrace?: boolean;
  hasBalcony?: boolean;
  outdoorSpaceArea?: number;
  apartmentFloor?: string | number;
  status?: string;
  numberOfStories?: number;
  coordinates?: {
    lat: number;
    lon: number;
  };
  postalCode?: string;
  agentName?: string;
  agentUrl?: string;
  vveContribution?: number;
  cleanedDescription?: string;
  floorPlans?: string[];
  googleMapsUrl?: string;
  yearBuilt?: string | number;
  neighborhood?: string;
  area?: string;
  searchScore?: number;
  available?: boolean;
  pricePerSquareMeter?: number;
  processedAt?: {
    seconds: number;
    nanoseconds: number;
    toDate: () => Date;
  };
}

export type PropertyStatus = 
  | 'to contact' 
  | 'viewing scheduled' 
  | 'viewed'
  | 'not interested'
  | 'to make an offer' 
  | 'offer entered' 
  | 'offer rejected';

export interface SavedProperty {
  id: string;
  userId: string;
  listingId: string;
  status: PropertyStatus;
  addedAt: {
    seconds: number;
    nanoseconds: number;
    toDate: () => Date;
  };
  updatedAt: {
    seconds: number;
    nanoseconds: number;
    toDate: () => Date;
  };
  viewingScheduledAt?: {
    seconds: number;
    nanoseconds: number;
    toDate: () => Date;
  };
  note?: string;
  listing?: Listing; // Full listing data when loaded
}

export interface UserPreferences {
  priceRange: {
    min: number;
    max: number;
  };
  bedrooms: string;
  floorLevel: string;
  selectedOutdoorSpaces: string[];
  minSize: string;
  selectedAreas: string[];
  searchQuery?: string; // Optional - not saved to preferences
  sortOrder: string;
  publishedWithin?: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  emailAlerts?: boolean;
  createdAt: {
    seconds: number;
    nanoseconds: number;
    toDate: () => Date;
  };
  updatedAt: {
    seconds: number;
    nanoseconds: number;
    toDate: () => Date;
  };
}