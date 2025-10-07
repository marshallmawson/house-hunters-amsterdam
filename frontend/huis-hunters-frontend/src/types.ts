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
}