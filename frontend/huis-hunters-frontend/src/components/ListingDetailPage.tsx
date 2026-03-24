import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useListingsContext } from '../contexts/ListingsContext';
import { Container } from 'react-bootstrap';
import { parseListingDoc } from '../utils/listingParser';
import ListingDetailContent from './ListingDetailContent';
import { Listing } from '../types';

interface ListingDetailPageProps {
  onRequireLogin?: () => void;
}

const updateMetaTags = (imageUrl: string, title: string, description: string, url: string) => {
  const setMeta = (property: string, content: string) => {
    let el = document.querySelector(`meta[property="${property}"]`);
    if (!el) { el = document.createElement('meta'); el.setAttribute('property', property); document.head.appendChild(el); }
    el.setAttribute('content', content);
  };
  const setMetaName = (name: string, content: string) => {
    let el = document.querySelector(`meta[name="${name}"]`);
    if (!el) { el = document.createElement('meta'); el.setAttribute('name', name); document.head.appendChild(el); }
    el.setAttribute('content', content);
  };
  document.title = title;
  setMeta('og:type', 'website');
  setMeta('og:url', url);
  setMeta('og:title', title);
  setMeta('og:description', description);
  setMeta('og:image', imageUrl);
  setMetaName('twitter:card', 'summary_large_image');
  setMetaName('twitter:url', url);
  setMetaName('twitter:title', title);
  setMetaName('twitter:description', description);
  setMetaName('twitter:image', imageUrl);
};

const resetMetaTags = () => {
  updateMetaTags(
    'https://www.huishunters.com/logo512.png',
    'Huis Hunters - AI-Powered Amsterdam Home Search',
    'Find your perfect Amsterdam house with smart filters and AI-powered search.',
    'https://www.huishunters.com/'
  );
};

const ListingDetailPage: React.FC<ListingDetailPageProps> = ({ onRequireLogin }) => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { getListingById } = useListingsContext();
  const [listing, setListing] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    const fetchListing = async () => {
      if (!id) { setNotFound(true); setLoading(false); return; }

      // Try in-memory cache first (instant for in-app navigation)
      const cached = getListingById(id);
      if (cached) {
        setListing(cached);
        setLoading(false);
        const imageUrl = cached.imageGallery[0];
        const title = `${cached.address} - €${cached.price?.toLocaleString()}`;
        const description = `${cached.address} - €${cached.price?.toLocaleString()}${cached.bedrooms ? `, ${cached.bedrooms} bedrooms` : ''}${cached.livingArea ? `, ${cached.livingArea} m²` : ''}`;
        updateMetaTags(imageUrl, title, description, `https://www.huishunters.com/listings/${id}`);
        return;
      }

      // Fallback: fetch from Firestore (direct/email links, or context not yet loaded)
      try {
        const docSnap = await getDoc(doc(db, 'listings', id));
        const parsed = parseListingDoc(docSnap);

        if (!parsed) {
          setNotFound(true);
        } else {
          setListing(parsed);
          // Set meta tags for social sharing
          const imageUrl = parsed.imageGallery[0];
          const title = `${parsed.address} - €${parsed.price?.toLocaleString()}`;
          const description = `${parsed.address} - €${parsed.price?.toLocaleString()}${parsed.bedrooms ? `, ${parsed.bedrooms} bedrooms` : ''}${parsed.livingArea ? `, ${parsed.livingArea} m²` : ''}`;
          updateMetaTags(imageUrl, title, description, `https://www.huishunters.com/listings/${id}`);
        }
      } catch (error) {
        console.error('Error fetching listing:', error);
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    };

    fetchListing();

    return () => { resetMetaTags(); };
  }, [id, getListingById]);

  const handleBack = () => {
    const state = location.state as { from?: string; scrollY?: number } | null;
    navigate(state?.from ?? '/', { state: { scrollY: state?.scrollY } });
  };

  if (loading) {
    return (
      <Container style={{ paddingTop: '6rem', textAlign: 'center' }}>
        <div className="spinner-border text-primary mb-3" role="status" style={{ width: '3rem', height: '3rem' }}>
          <span className="visually-hidden">Loading...</span>
        </div>
        <h4 style={{ color: '#6c757d', fontWeight: '500' }}>Loading listing...</h4>
      </Container>
    );
  }

  if (notFound || !listing) {
    return (
      <Container style={{ paddingTop: '6rem', textAlign: 'center' }}>
        <h4 style={{ color: '#6c757d', fontWeight: '500' }}>Listing not found</h4>
        <p style={{ color: '#6c757d' }}>This listing may no longer be available.</p>
        <button
          onClick={() => navigate('/')}
          className="btn btn-primary mt-2"
        >
          Browse all listings
        </button>
      </Container>
    );
  }

  return (
    <div className="listing-detail-page">
      <Container className="listing-detail-container">
        {/* Back button */}
        <div className="listing-detail-back">
          <button onClick={handleBack} className="listing-detail-back-btn">
            ← Back
          </button>
        </div>

        <ListingDetailContent
          listing={listing}
          isMobile={isMobile}
          onRequireLogin={onRequireLogin}
          context="page"
        />
      </Container>
    </div>
  );
};

export default ListingDetailPage;
