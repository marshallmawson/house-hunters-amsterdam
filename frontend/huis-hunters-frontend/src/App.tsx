
import React from 'react';
import Listings from './components/Listings';
import { Container } from 'react-bootstrap';
import './index.css';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';

function App() {
  return (
    <div>
      {/* Modern Hero Header */}
      <div 
        style={{
          minHeight: '400px',
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        {/* Background Image */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundImage: `url('https://images.unsplash.com/photo-1576924542622-772281b13aa8?ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&q=80&w=3540')`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            opacity: 1,
            zIndex: 1
          }}
        />
        

        {/* Content */}
        <Container style={{ position: 'relative', zIndex: 3, paddingTop: '120px', paddingBottom: '120px' }}>
          <div className="text-center text-white">
            <div 
              style={{
                backgroundColor: 'rgba(0, 0, 0, 0.25)',
                borderRadius: '15px',
                padding: '1.5rem 2rem',
                display: 'inline-block',
                border: '1px solid rgba(255, 255, 255, 0.1)'
              }}
            >
              <h1 
                className="hero-title"
                style={{
                  fontSize: '5.5rem',
                  fontWeight: '800',
                  marginBottom: '1rem',
                  textShadow: '3px 3px 6px rgba(0,0,0,0.8), 0 0 15px rgba(0,0,0,0.6)',
                  letterSpacing: '-0.02em'
                }}
              >
                Huis Hunters
              </h1>
              <p 
                className="hero-subtitle"
                style={{
                  fontSize: '1.6rem',
                  fontWeight: '600',
                  marginBottom: '0',
                  opacity: 1,
                  textShadow: '2px 2px 4px rgba(0,0,0,0.8), 0 0 10px rgba(0,0,0,0.5)',
                  maxWidth: '600px',
                  margin: '0 auto'
                }}
              >
                AI-powered home searching in Amsterdam
              </p>
            </div>
          </div>
        </Container>

        {/* Decorative elements */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: '50px',
            background: 'linear-gradient(to bottom, transparent, rgba(0,0,0,0.1))',
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

