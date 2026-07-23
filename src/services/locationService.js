import * as Location from 'expo-location';
import { collection, doc, setDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { distanceInMeters } from '../utils/haversine';

let locationSubscription = null;
let lastUploadedPosition = null;

export async function requestLocationPermissions() {
  try {
    const { status: existingStatus } = await Location.getForegroundPermissionsAsync();
    if (existingStatus === 'granted') return true;
    const { status } = await Location.requestForegroundPermissionsAsync();
    return status === 'granted';
  } catch (e) {
    console.log('Permission error:', e);
    return false;
  }
}

export async function startLocationSharing(sessionId, userId, minDistanceMeters = 5) {
  stopLocationSharing();

  const hasPermission = await requestLocationPermissions();
  if (!hasPermission) {
    throw new Error('Location permission denied');
  }

  locationSubscription = await Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.High,
      timeInterval: 5000,
      distanceInterval: minDistanceMeters
    },
    async (location) => {
      const { latitude, longitude, heading } = location.coords;

      // Stationary write filter: Skip upload if moved < minDistanceMeters
      if (lastUploadedPosition) {
        const dist = distanceInMeters(
          lastUploadedPosition.latitude,
          lastUploadedPosition.longitude,
          latitude,
          longitude
        );
        if (dist < minDistanceMeters) {
          return;
        }
      }

      lastUploadedPosition = { latitude, longitude };

      const locationRef = doc(db, 'sessions', sessionId, 'locations', userId);
      setDoc(
        locationRef,
        {
          lat: latitude,
          lng: longitude,
          bearing: heading || 0,
          timestamp: new Date().toISOString()
        },
        { merge: true }
      ).catch((err) => console.log('Location upload error:', err));
    }
  );
}

export function stopLocationSharing() {
  if (locationSubscription) {
    locationSubscription.remove();
    locationSubscription = null;
  }
  lastUploadedPosition = null;
}

export function subscribePeerLocations(sessionId, callback) {
  const locationsRef = collection(db, 'sessions', sessionId, 'locations');
  return onSnapshot(locationsRef, (snapshot) => {
    const locations = snapshot.docs.map((d) => ({
      userId: d.id,
      ...d.data()
    }));
    callback(locations);
  });
}
