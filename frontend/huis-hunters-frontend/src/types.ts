
export interface Listing {
  id: string;
  address: string;
  price: number;
  bedrooms: number;
  bathrooms: number;
  surface: number;
  energyLabel: string;
  scrapedAt: any; 
  fundaUrl: string;
  imageGallery: string[];
  embeddingText: string;
}
