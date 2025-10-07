import React from 'react';

interface IconWrapperProps {
  icon: React.ElementType;
}

const IconWrapper: React.FC<IconWrapperProps> = ({ icon: Icon }) => {
  return <Icon />;
};

export default IconWrapper;
