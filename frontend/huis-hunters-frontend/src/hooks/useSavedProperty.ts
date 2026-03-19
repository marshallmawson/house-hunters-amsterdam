import { useState, useEffect } from 'react';
import { collection, query, where, getDocs, doc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

interface UseSavedPropertyOptions {
  onRequireLogin?: () => void;
  onUnsave?: (propertyId: string) => void;
}

interface UseSavedPropertyReturn {
  isSaved: boolean;
  savedPropertyId: string | null;
  showUnsaveConfirm: boolean;
  setShowUnsaveConfirm: (show: boolean) => void;
  handleSave: () => Promise<{ message: string; hasLink: boolean } | null>;
  handleConfirmUnsave: () => Promise<{ message: string; hasLink: boolean } | null>;
}

export function useSavedProperty(
  listingId: string,
  options: UseSavedPropertyOptions = {}
): UseSavedPropertyReturn {
  const { onRequireLogin, onUnsave } = options;
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [isSaved, setIsSaved] = useState(false);
  const [savedPropertyId, setSavedPropertyId] = useState<string | null>(null);
  const [showUnsaveConfirm, setShowUnsaveConfirm] = useState(false);

  useEffect(() => {
    const checkIfSaved = async () => {
      if (!currentUser) {
        setIsSaved(false);
        return;
      }

      try {
        const q = query(
          collection(db, 'savedProperties'),
          where('userId', '==', currentUser.uid),
          where('listingId', '==', listingId)
        );
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
          setIsSaved(true);
          setSavedPropertyId(querySnapshot.docs[0].id);
        } else {
          setIsSaved(false);
          setSavedPropertyId(null);
        }
      } catch (error) {
        console.error('Error checking if saved:', error);
      }
    };

    checkIfSaved();
  }, [currentUser, listingId]);

  const handleSave = async (): Promise<{ message: string; hasLink: boolean } | null> => {
    if (!currentUser) {
      if (onRequireLogin) {
        onRequireLogin();
      } else {
        navigate('/login');
      }
      return null;
    }

    try {
      if (isSaved && savedPropertyId) {
        if (onUnsave) {
          setShowUnsaveConfirm(true);
        } else {
          await deleteDoc(doc(db, 'savedProperties', savedPropertyId));
          setIsSaved(false);
          setSavedPropertyId(null);
          return { message: 'Removed from Saved Properties', hasLink: false };
        }
      } else {
        const savedPropertyRef = doc(collection(db, 'savedProperties'));
        await setDoc(savedPropertyRef, {
          userId: currentUser.uid,
          listingId: listingId,
          status: 'to contact',
          addedAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        setIsSaved(true);
        setSavedPropertyId(savedPropertyRef.id);
        return { message: 'Added to Saved Properties', hasLink: true };
      }
    } catch (error) {
      console.error('Error saving/unsaving property:', error);
      alert('Failed to save property');
    }
    return null;
  };

  const handleConfirmUnsave = async (): Promise<{ message: string; hasLink: boolean } | null> => {
    if (!savedPropertyId || !onUnsave) return null;

    try {
      onUnsave(savedPropertyId);
      setIsSaved(false);
      setSavedPropertyId(null);
      setShowUnsaveConfirm(false);
      return { message: 'Removed from Saved Properties', hasLink: false };
    } catch (error) {
      console.error('Error unsaving property:', error);
      alert('Failed to unsave property');
    }
    return null;
  };

  return {
    isSaved,
    savedPropertyId,
    showUnsaveConfirm,
    setShowUnsaveConfirm,
    handleSave,
    handleConfirmUnsave,
  };
}
