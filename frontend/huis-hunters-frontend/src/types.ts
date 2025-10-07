
export interface Listing {
  id: string;
  address: string;
  price: number;
  bedrooms: number;
  bathrooms: number;
  livingArea: number;
  energyLabel: string;
  scrapedAt: any; 
  url: string;
  imageGallery: string[];
  embeddingText: string;
}
