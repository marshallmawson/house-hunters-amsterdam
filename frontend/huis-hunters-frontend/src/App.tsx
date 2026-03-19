
import React, { useState, Suspense, lazy } from 'react';
import { Container, Navbar, Dropdown, Nav, Offcanvas, Modal, Button } from 'react-bootstrap';
import { Route, Routes, useNavigate, useLocation, Link } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { preloadGoogleMapsAPI } from './config/maps';
import Listings from './components/Listings';
import './index.css';

// Start loading Maps API immediately so it's ready when any map component mounts
preloadGoogleMapsAPI();

const LoginPage = lazy(() => import('./components/LoginPage'));
const SignUpPage = lazy(() => import('./components/SignUpPage'));
const ProfilePage = lazy(() => import('./components/ProfilePage'));
const SavedProperties = lazy(() => import('./components/SavedProperties'));
const MapView = lazy(() => import('./components/MapView'));
const ListingDetailPage = lazy(() => import('./components/ListingDetailPage'));

const AppContent = () => {
  const { currentUser, userData, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isAuthPage = location.pathname === '/login' || location.pathname === '/signup';
  const isHomePage = location.pathname === '/';
  const isMapPage = location.pathname === '/map';
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const [heroImageLoaded, setHeroImageLoaded] = useState(false);


  const handleLogout = async () => {
    await logout();
    navigate('/');
    setShowMobileMenu(false);
  };

  const handleNavClick = (path: string) => {
    navigate(path);
    setShowMobileMenu(false);
  };

  const handleSavedPropertiesClick = (e: React.MouseEvent) => {
    if (!currentUser) {
      e.preventDefault();
      setShowLoginPrompt(true);
      setShowMobileMenu(false);
    }
  };

  return (
    <div>
      {/* Premium Navigation Bar */}
      <Navbar className="premium-navbar" expand="lg" fixed="top">
        <Container className="d-flex flex-nowrap align-items-center">
          <Navbar.Brand 
            className="premium-logo" 
            onClick={() => navigate('/')}
            style={{ cursor: 'pointer' }}
          >
            <img 
              src="/logo192.png" 
              alt="Huis Hunters Logo" 
              style={{ width: '32px', height: '32px', marginRight: '2px' }}
            />
            <span className="logo-text">Huis Hunters</span>
            <span className="beta-badge">BETA</span>
          </Navbar.Brand>
          
          {/* Desktop Navigation */}
          <div className="ms-auto d-none d-lg-flex align-items-center gap-3">
            {!isAuthPage && (
              <>
                <Link 
                  to={currentUser ? "/saved-properties" : "#"} 
                  onClick={handleSavedPropertiesClick}
                  style={{ textDecoration: 'none', color: '#6c757d', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: currentUser ? 'pointer' : 'pointer' }}
                >
                  <svg
                    width="16"
                    height="14"
                    viewBox="0 0 24 21"
                    fill="#dc3545"
                    stroke="#dc3545"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                  </svg>
                  Saved Properties
                </Link>
                {currentUser ? (
                  <Dropdown>
                    <Dropdown.Toggle variant="link" id="profile-dropdown" style={{ textDecoration: 'none', color: '#6c757d', fontSize: '0.9rem', border: 'none', padding: '0' }}>
                      👤 {userData?.name || 'Profile'}
                    </Dropdown.Toggle>
                    <Dropdown.Menu>
                      <Dropdown.Item onClick={() => navigate('/profile')}>Profile</Dropdown.Item>
                      <Dropdown.Item onClick={handleLogout}>Logout</Dropdown.Item>
                    </Dropdown.Menu>
                  </Dropdown>
                ) : (
                  <Link to="/login" style={{ textDecoration: 'none', color: '#6c757d', fontSize: '0.9rem' }}>
                    Login / Sign Up
                  </Link>
                )}
              </>
            )}
          </div>

          {/* Mobile: Saved shortcut + Hamburger */}
          {!isAuthPage && (
            <div className="d-flex d-lg-none align-items-center gap-1" style={{ flexShrink: 0 }}>
              <Link
                to={currentUser ? "/saved-properties" : "#"}
                onClick={handleSavedPropertiesClick}
                style={{
                  textDecoration: 'none',
                  color: '#6c757d',
                  fontSize: '0.75rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                  padding: '0.25rem 0.25rem',
                  whiteSpace: 'nowrap',
                }}
              >
                <svg
                  width="14"
                  height="12"
                  viewBox="0 0 24 21"
                  fill="#dc3545"
                  stroke="#dc3545"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                </svg>
                Saved
              </Link>
              <Navbar.Toggle
                aria-controls="mobile-nav"
                onClick={() => setShowMobileMenu(true)}
                style={{ border: 'none', padding: '0.25rem 0.5rem' }}
              >
                <span style={{ fontSize: '1.5rem' }}>☰</span>
              </Navbar.Toggle>
            </div>
          )}
        </Container>
      </Navbar>

      {/* Mobile Menu Offcanvas */}
      <Offcanvas 
        show={showMobileMenu} 
        onHide={() => setShowMobileMenu(false)} 
        placement="end"
        style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}
      >
        <Offcanvas.Header closeButton>
          <Offcanvas.Title>Menu</Offcanvas.Title>
        </Offcanvas.Header>
        <Offcanvas.Body>
          <Nav className="flex-column gap-3">
            <Nav.Link
              onClick={() => { setShowMobileMenu(false); navigate(`/map${location.search || sessionStorage.getItem('listingFilters') || ''}`); }}
              style={{
                color: '#212529',
                fontSize: '1rem',
                fontWeight: '500',
                padding: '0.5rem 0',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4a90e2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                <circle cx="12" cy="10" r="3"/>
              </svg>
              Map
            </Nav.Link>
            <Nav.Link
              onClick={currentUser ? () => handleNavClick('/saved-properties') : (e) => {
                e.preventDefault();
                setShowLoginPrompt(true);
                setShowMobileMenu(false);
              }}
              style={{ 
                color: '#212529', 
                fontSize: '1rem',
                fontWeight: '500',
                padding: '0.5rem 0',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}
            >
              <svg
                width="18"
                height="16"
                viewBox="0 0 24 21"
                fill="#dc3545"
                stroke="#dc3545"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
              Saved Properties
            </Nav.Link>
            {currentUser ? (
              <>
                <Nav.Link 
                  onClick={() => handleNavClick('/profile')}
                  style={{ 
                    color: '#212529', 
                    fontSize: '1rem',
                    fontWeight: '500',
                    padding: '0.5rem 0'
                  }}
                >
                  Profile
                </Nav.Link>
                <Nav.Link 
                  onClick={handleLogout}
                  style={{ 
                    color: '#dc3545', 
                    fontSize: '1rem',
                    fontWeight: '500',
                    padding: '0.5rem 0'
                  }}
                >
                  Logout
                </Nav.Link>
              </>
            ) : (
              <Nav.Link 
                onClick={() => handleNavClick('/login')}
                style={{ 
                  color: '#212529', 
                  fontSize: '1rem',
                  fontWeight: '500',
                  padding: '0.5rem 0'
                }}
              >
                Login / Sign Up
              </Nav.Link>
            )}
          </Nav>
        </Offcanvas.Body>
      </Offcanvas>

      {/* Login Prompt Modal */}
      <Modal show={showLoginPrompt} onHide={() => setShowLoginPrompt(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Login Required</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p style={{ fontFamily: 'system-ui, -apple-system, sans-serif', fontSize: '1rem', lineHeight: '1.6', color: '#212529' }}>
            Please <strong>login or create an account</strong> to save properties and your search preferences.
          </p>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowLoginPrompt(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => {
            setShowLoginPrompt(false);
            navigate('/login');
          }}>
            Login / Sign Up
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Modern Hero Header - Only show on home page */}
      {isHomePage && (
        <div 
          className="hero-header"
          style={{
            minHeight: '500px',
            position: 'relative',
            overflow: 'hidden',
            marginTop: '40px',
            backgroundColor: '#2c3e50'
          }}
        >
          {/* Gradient Fallback Background - Shows while image loads */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'linear-gradient(135deg, #4a90e2 0%, #2c3e50 50%, #1a252f 100%)',
              zIndex: 0
            }}
          />
          
          {/* Background Image with Enhanced Overlay */}
          <div
            className="hero-background"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundImage: `url('https://images.unsplash.com/photo-1576924542622-772281b13aa8?ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&q=80&w=3540')`,
              backgroundSize: '140%',
              backgroundPosition: 'center 90%',
              opacity: heroImageLoaded ? 1 : 0,
              transition: 'opacity 0.6s ease-in-out',
              zIndex: 1
            }}
          />
          
          {/* Preload Image */}
          <img
            src="https://images.unsplash.com/photo-1576924542622-772281b13aa8?ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&q=80&w=3540"
            alt=""
            style={{ display: 'none' }}
            onLoad={() => setHeroImageLoaded(true)}
          />
          
          {/* Premium Gradient Overlay */}
          <div
            className="hero-overlay"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'linear-gradient(135deg, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0.6) 50%, rgba(0,0,0,0.3) 100%)',
              zIndex: 2
            }}
          />

          {/* Content */}
          <Container className="hero-content" style={{ position: 'relative', zIndex: 3, paddingTop: '140px', paddingBottom: '140px' }}>
            <div className="text-center text-white">
              <div className="hero-text-container">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem' }}>
                  <img 
                    src="/house-white.png" 
                    alt="Huis Hunters Logo" 
                    style={{ width: '80px', height: '80px', transform: 'translateY(-8px)' }}
                  />
                  <h1 
                    className="hero-title premium-title"
                    style={{
                      fontSize: '5.8rem',
                      fontWeight: '700',
                      marginBottom: '1.5rem',
                      color: 'white',
                      textShadow: '4px 4px 8px rgba(0,0,0,0.7), 0 0 20px rgba(0,0,0,0.5)',
                      letterSpacing: '-0.03em',
                      lineHeight: '1.1'
                    }}
                  >
                    Huis Hunters
                  </h1>
                </div>
                <p 
                  className="hero-subtitle premium-subtitle"
                  style={{
                    fontSize: '1.8rem',
                    fontWeight: '400',
                    marginBottom: '2rem',
                    opacity: 0.95,
                    textShadow: '2px 2px 4px rgba(0,0,0,0.8)',
                    maxWidth: '650px',
                    margin: '0 auto 2rem auto',
                    lineHeight: '1.4'
                  }}
                >
                  Find your perfect home in Amsterdam
                </p>
              </div>
            </div>
          </Container>

          {/* Premium Decorative Elements */}
          <div
            className="hero-bottom-gradient"
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: '80px',
              background: 'linear-gradient(to bottom, transparent, rgba(0,0,0,0.15))',
              zIndex: 2
            }}
          />
          
          {/* Subtle Pattern Overlay */}
          <div
            className="hero-pattern"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundImage: 'radial-gradient(circle at 25% 25%, rgba(255,255,255,0.1) 0%, transparent 50%), radial-gradient(circle at 75% 75%, rgba(255,255,255,0.05) 0%, transparent 50%)',
              opacity: 0.3,
              zIndex: 2
            }}
          />
        </div>
      )}

      <Suspense fallback={<div style={{ textAlign: 'center', paddingTop: '8rem' }}><div className="spinner-border text-primary" role="status"><span className="visually-hidden">Loading...</span></div></div>}>
        <Routes>
          <Route
            path="/map"
            element={
              <MapView
                onRequireLogin={() => setShowLoginPrompt(true)}
              />
            }
          />
          <Route
            path="/listings/:id"
            element={
              <ListingDetailPage
                onRequireLogin={() => setShowLoginPrompt(true)}
              />
            }
          />
          <Route
            path="/*"
            element={
              <Container fluid>
                <Routes>
                  <Route
                    path="/"
                    element={
                      <Listings
                        onRequireLogin={() => setShowLoginPrompt(true)}
                      />
                    }
                  />
                  <Route path="/login" element={<LoginPage />} />
                  <Route path="/signup" element={<SignUpPage />} />
                  <Route path="/profile" element={<ProfilePage />} />
                  <Route path="/saved-properties" element={<SavedProperties />} />
                </Routes>
              </Container>
            }
          />
        </Routes>
      </Suspense>

    </div>
  );
};

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;

