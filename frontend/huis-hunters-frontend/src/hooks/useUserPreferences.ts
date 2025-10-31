import { useState, useEffect, useCallback } from 'react';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { UserPreferences } from '../types';
import { useAuth } from '../contexts/AuthContext';

const defaultPreferences: UserPreferences = {
  priceRange: { min: 450000, max: 750000 },
  bedrooms: '2+',
  floorLevel: 'any',
  outdoorSpace: 'any',
  minSize: '',
  selectedAreas: [],
  searchQuery: '',
  sortOrder: 'date-new-old'
};

export const useUserPreferences = () => {
  const { currentUser } = useAuth();
  const [preferences, setPreferences] = useState<UserPreferences>(defaultPreferences);
  const [loading, setLoading] = useState(true);

  const loadPreferences = useCallback(async () => {
    if (!currentUser) {
      setPreferences(defaultPreferences);
      setLoading(false);
      return;
    }

    try {
      const prefDocRef = doc(db, 'users', currentUser.uid, 'searchPreferences', 'lastUsed');
      const prefDocSnap = await getDoc(prefDocRef);
      
      if (prefDocSnap.exists()) {
        const data = prefDocSnap.data();
        setPreferences({
          priceRange: data.priceRange || defaultPreferences.priceRange,
          bedrooms: data.bedrooms || defaultPreferences.bedrooms,
          floorLevel: data.floorLevel || defaultPreferences.floorLevel,
          outdoorSpace: data.outdoorSpace || defaultPreferences.outdoorSpace,
          minSize: data.minSize || defaultPreferences.minSize,
          selectedAreas: data.selectedAreas || defaultPreferences.selectedAreas,
          searchQuery: data.searchQuery || defaultPreferences.searchQuery,
          sortOrder: data.sortOrder || defaultPreferences.sortOrder
        });
      }
    } catch (error) {
      console.error('Error loading preferences:', error);
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  const savePreferences = useCallback(async (newPreferences: UserPreferences) => {
    if (!currentUser) return;

    try {
      const prefDocRef = doc(db, 'users', currentUser.uid, 'searchPreferences', 'lastUsed');
      await setDoc(prefDocRef, {
        ...newPreferences,
        updatedAt: serverTimestamp()
      }, { merge: true });
      setPreferences(newPreferences);
    } catch (error) {
      console.error('Error saving preferences:', error);
    }
  }, [currentUser]);

  useEffect(() => {
    loadPreferences();
  }, [loadPreferences]);

  return {
    preferences,
    loading,
    savePreferences,
    loadPreferences
  };
};

