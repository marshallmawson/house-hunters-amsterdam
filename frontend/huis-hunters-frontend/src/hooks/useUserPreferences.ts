import { useState, useEffect, useCallback } from 'react';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { UserPreferences } from '../types';
import { useAuth } from '../contexts/AuthContext';

const defaultPreferences: UserPreferences = {
  priceRange: { min: 400000, max: 1250000 },
  bedrooms: '1+',
  floorLevel: 'any',
  selectedOutdoorSpaces: [],
  minSize: '',
  selectedAreas: [],
  sortOrder: 'date-new-old'
  // searchQuery is not included in default preferences (not saved)
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
        // Handle migration from outdoorSpace (string) to selectedOutdoorSpaces (array)
        let outdoorSpaces: string[] = [];
        if (data.selectedOutdoorSpaces && Array.isArray(data.selectedOutdoorSpaces)) {
          outdoorSpaces = data.selectedOutdoorSpaces;
        } else if (data.outdoorSpace && data.outdoorSpace !== 'any') {
          // Migrate old format to new format
          outdoorSpaces = [data.outdoorSpace];
        }

        setPreferences({
          priceRange: data.priceRange || defaultPreferences.priceRange,
          bedrooms: data.bedrooms || defaultPreferences.bedrooms,
          floorLevel: data.floorLevel || defaultPreferences.floorLevel,
          selectedOutdoorSpaces: outdoorSpaces,
          minSize: data.minSize || defaultPreferences.minSize,
          selectedAreas: data.selectedAreas || defaultPreferences.selectedAreas,
          sortOrder: data.sortOrder || defaultPreferences.sortOrder
          // searchQuery is not loaded from preferences
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

