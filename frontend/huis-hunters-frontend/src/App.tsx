
import React from 'react';
import Listings from './components/Listings';
import { Container, Navbar } from 'react-bootstrap';
import './index.css';
import { Route, Routes } from 'react-router-dom';

function App() {
  return (
    <div>
      {/* Premium Navigation Bar */}
      <Navbar className="premium-navbar" expand="lg" fixed="top">
        <Container>
          <Navbar.Brand className="premium-logo" href="#home">
            <span className="logo-icon">🏠</span>
            <span className="logo-text">Huis Hunters</span>
            <span className="beta-badge">BETA</span>
          </Navbar.Brand>
          <div className="ms-auto">
            <a 
              href="mailto:contact@huishunters.com"
              style={{
                fontSize: '0.75rem',
                color: '#6c757d',
                textDecoration: 'none',
                fontWeight: '400'
              }}
            >
              contact@huishunters.com
            </a>
          </div>
        </Container>
      </Navbar>

      {/* Modern Hero Header */}
      <div 
        className="hero-header"
        style={{
          minHeight: '500px',
          position: 'relative',
          overflow: 'hidden',
          marginTop: '40px'
        }}
      >
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
            opacity: 1,
            zIndex: 1
          }}
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
                AI-powered home searching in Amsterdam
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

      <Container fluid>
        <Routes>
          <Route path="/" element={<Listings />} />
          <Route path="/listings/:id" element={<Listings />} />
        </Routes>
      </Container>
    </div>
  );
}

export default App;

