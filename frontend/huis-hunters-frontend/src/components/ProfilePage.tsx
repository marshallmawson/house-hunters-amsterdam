import React, { useState } from 'react';
import { Container, Form, Button, Card, Alert } from 'react-bootstrap';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

const ProfilePage: React.FC = () => {
  const { currentUser, userData, changePassword } = useAuth();
  const navigate = useNavigate();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  // Note: Firebase Auth doesn't require current password to change password
  // if the user is already authenticated. We'll just verify the new password.
  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();

    if (newPassword !== confirmPassword) {
      return setError('New passwords do not match');
    }

    if (newPassword.length < 6) {
      return setError('Password must be at least 6 characters');
    }

    try {
      setError('');
      setSuccess('');
      setLoading(true);
      await changePassword(newPassword);
      setSuccess('Password changed successfully!');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setError(err.message || 'Failed to change password');
    } finally {
      setLoading(false);
    }
  };

  if (!currentUser) {
    return (
      <Container className="mt-5" style={{ paddingTop: '100px' }}>
        <Alert variant="warning">Please log in to view your profile.</Alert>
      </Container>
    );
  }

  // If userData isn't loaded yet, show a loading state
  if (!userData) {
    return (
      <Container className="mt-5" style={{ paddingTop: '100px' }}>
        <Alert variant="info">Loading profile...</Alert>
      </Container>
    );
  }

  return (
    <Container className="mt-5" style={{ maxWidth: '600px', paddingTop: '100px' }}>
      <Card style={{ border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
        <Card.Body style={{ padding: '2rem' }}>
          <h2 className="text-center mb-4" style={{ 
            fontFamily: 'system-ui, -apple-system, sans-serif',
            fontWeight: '600',
            fontSize: '1.75rem',
            marginBottom: '2rem'
          }}>
            Profile
          </h2>

          {error && <Alert variant="danger" className="mb-3">{error}</Alert>}
          {success && <Alert variant="success" className="mb-3">{success}</Alert>}

          <div className="mb-4" style={{ marginBottom: '2rem' }}>
            <h5 style={{ 
              fontFamily: 'system-ui, -apple-system, sans-serif',
              fontWeight: '600',
              fontSize: '1.1rem',
              marginBottom: '1rem',
              color: '#212529'
            }}>
              Account Information
            </h5>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <span style={{ 
                  fontFamily: 'system-ui, -apple-system, sans-serif',
                  fontWeight: '600',
                  minWidth: '120px',
                  color: '#495057'
                }}>
                  Name:
                </span>
                <span style={{ 
                  fontFamily: 'system-ui, -apple-system, sans-serif',
                  color: '#212529'
                }}>
                  {userData.name}
                </span>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <span style={{ 
                  fontFamily: 'system-ui, -apple-system, sans-serif',
                  fontWeight: '600',
                  minWidth: '120px',
                  color: '#495057'
                }}>
                  Email:
                </span>
                <span style={{ 
                  fontFamily: 'system-ui, -apple-system, sans-serif',
                  color: '#212529'
                }}>
                  {userData.email}
                </span>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <span style={{ 
                  fontFamily: 'system-ui, -apple-system, sans-serif',
                  fontWeight: '600',
                  minWidth: '120px',
                  color: '#495057'
                }}>
                  Member since:
                </span>
                <span style={{ 
                  fontFamily: 'system-ui, -apple-system, sans-serif',
                  color: '#212529'
                }}>
                  {userData.createdAt.toDate().toLocaleDateString()}
                </span>
              </div>
            </div>
          </div>

          <hr style={{ margin: '2rem 0', borderColor: '#dee2e6' }} />

          <div style={{ marginBottom: '1.5rem' }}>
            <h5 style={{ 
              fontFamily: 'system-ui, -apple-system, sans-serif',
              fontWeight: '600',
              fontSize: '1.1rem',
              marginBottom: '1.5rem',
              color: '#212529'
            }}>
              Change Password
            </h5>
            <Form onSubmit={handlePasswordChange}>
              <Form.Group className="mb-3">
                <Form.Label style={{ 
                  fontFamily: 'system-ui, -apple-system, sans-serif',
                  fontWeight: '600',
                  fontSize: '0.9rem',
                  marginBottom: '0.5rem',
                  color: '#495057'
                }}>
                  New Password
                </Form.Label>
                <Form.Control
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={6}
                  placeholder="Enter new password"
                  style={{ 
                    fontFamily: 'system-ui, -apple-system, sans-serif',
                    borderRadius: '6px',
                    border: '1px solid #ced4da',
                    padding: '0.5rem 0.75rem'
                  }}
                />
                <Form.Text className="text-muted" style={{ 
                  fontFamily: 'system-ui, -apple-system, sans-serif',
                  fontSize: '0.875rem',
                  marginTop: '0.25rem',
                  display: 'block'
                }}>
                  Password must be at least 6 characters
                </Form.Text>
              </Form.Group>

              <Form.Group className="mb-4">
                <Form.Label style={{ 
                  fontFamily: 'system-ui, -apple-system, sans-serif',
                  fontWeight: '600',
                  fontSize: '0.9rem',
                  marginBottom: '0.5rem',
                  color: '#495057'
                }}>
                  Confirm New Password
                </Form.Label>
                <Form.Control
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                  placeholder="Confirm new password"
                  style={{ 
                    fontFamily: 'system-ui, -apple-system, sans-serif',
                    borderRadius: '6px',
                    border: '1px solid #ced4da',
                    padding: '0.5rem 0.75rem'
                  }}
                />
              </Form.Group>

              <Button
                variant="primary"
                type="submit"
                disabled={loading}
                style={{ 
                  fontFamily: 'system-ui, -apple-system, sans-serif',
                  fontWeight: '500',
                  padding: '0.5rem 1.5rem',
                  borderRadius: '6px',
                  marginBottom: '1rem'
                }}
              >
                {loading ? 'Changing password...' : 'Change Password'}
              </Button>
            </Form>
          </div>

          <div style={{ marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid #dee2e6' }}>
            <Button
              variant="secondary"
              onClick={() => navigate('/')}
              style={{ 
                fontFamily: 'system-ui, -apple-system, sans-serif',
                fontWeight: '500',
                padding: '0.5rem 1.5rem',
                borderRadius: '6px'
              }}
            >
              Back to Home
            </Button>
          </div>
        </Card.Body>
      </Card>
    </Container>
  );
};

export default ProfilePage;

