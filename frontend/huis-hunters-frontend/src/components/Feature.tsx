import React from 'react';

interface FeatureProps {
  icon: React.ReactNode;
  children: React.ReactNode;
}

export const Feature: React.FC<FeatureProps> = ({ icon, children }) => (
  <span className="ms-3">{icon} {children}</span>
);