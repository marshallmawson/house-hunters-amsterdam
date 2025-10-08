
import React from 'react';
import Listings from './components/Listings';
import { Container, Navbar } from 'react-bootstrap';
import './index.css';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';

function App() {
  return (
    <div>
      <Navbar bg="dark" variant="dark">
        <Container>
          <Navbar.Brand href="#home">Huis Hunters Amsterdam</Navbar.Brand>
        </Container>
      </Navbar>
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

