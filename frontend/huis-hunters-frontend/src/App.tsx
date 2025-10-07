
import React from 'react';
import Listings from './components/Listings';
import { Container, Navbar } from 'react-bootstrap';
import './index.css';

function App() {
  return (
    <div>
      <Navbar bg="dark" variant="dark">
        <Container>
          <Navbar.Brand href="#home">Huis Hunters Amsterdam</Navbar.Brand>
        </Container>
      </Navbar>
      <Container fluid>
        <Listings />
      </Container>
    </div>
  );
}

export default App;

