import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  SafeAreaView,
  Share,
  Modal,
  FlatList,
  Dimensions,
  Linking,
  Platform,
  ScrollView
} from 'react-native';
import MapView, { Marker, Callout } from 'react-native-maps';
import { StatusBar } from 'expo-status-bar';
import * as Location from 'expo-location';

import { auth, signInAnonymously } from './src/firebase';
import {
  createSession,
  joinSession,
  joinOrCreateFixedSession,
  getPersistentDeviceId,
  leaveSession,
  endSession,
  subscribeSession
} from './src/services/sessionService';
import {
  startLocationSharing,
  stopLocationSharing,
  subscribePeerLocations
} from './src/services/locationService';
import { distanceInMeters, formatDistance } from './src/utils/haversine';
import { openMapsNavigation } from './src/utils/navigationUtils';

// Catch and display any unhandled JS errors in an Alert popup instead of closing
if (global.ErrorUtils) {
  global.ErrorUtils.setGlobalHandler((error, isFatal) => {
    Alert.alert('App Error Diagnostic', `${error?.name}: ${error?.message}\n\nStack:\n${error?.stack?.substring(0, 300)}`);
  });
}

class RootErrorBoundary extends React.Component {
  state = { hasError: false, error: null, errorInfo: null };

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return (
        <SafeAreaView style={{ flex: 1, backgroundColor: '#141422', padding: 20, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ color: '#FF5252', fontSize: 22, fontWeight: 'bold', marginBottom: 10 }}>
            🚨 App Render Error
          </Text>
          <Text style={{ color: '#FFFFFF', fontSize: 14, marginBottom: 15, textAlign: 'center' }}>
            {this.state.error?.toString()}
          </Text>
          <ScrollView style={{ maxHeight: 250, backgroundColor: '#000', padding: 12, borderRadius: 8, width: '100%' }}>
            <Text style={{ color: '#FFD700', fontSize: 11, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' }}>
              {this.state.errorInfo?.componentStack || this.state.error?.stack}
            </Text>
          </ScrollView>
        </SafeAreaView>
      );
    }
    return this.props.children;
  }
}

// Default Fixed Session Code to eliminate dynamic DB creation costs
const FIXED_SESSION_CODE = 'LIVE12';
// Participant stale timeout (3 minutes)
const STALE_TIMEOUT_MS = 3 * 60 * 1000;

export default function App() {
  return (
    <RootErrorBoundary>
      <MainApp />
    </RootErrorBoundary>
  );
}

function MainApp() {
  const [user, setUser] = useState(null);
  const [deviceId, setDeviceId] = useState(null);
  const [displayName, setDisplayName] = useState('Explorer');
  const [sessionCode, setSessionCode] = useState(FIXED_SESSION_CODE);
  const [currentSession, setCurrentSession] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [authError, setAuthError] = useState(null);

  const [peerLocations, setPeerLocations] = useState({});
  const [myLocation, setMyLocation] = useState(null);
  const [showParticipantSheet, setShowParticipantSheet] = useState(false);

  // Screen-space pixel positions for Android floating badges
  const [markerPositions, setMarkerPositions] = useState({});

  const mapRef = useRef(null);

  const updateMarkerPositions = async () => {
    if (Platform.OS !== 'android' || !mapRef.current) return;
    const positions = {};
    for (const loc of Object.values(peerLocations)) {
      try {
        const point = await mapRef.current.pointForCoordinate({
          latitude: loc.lat,
          longitude: loc.lng
        });
        if (point) {
          positions[loc.userId] = point;
        }
      } catch (e) {
        // Ignore map projection error during unmount
      }
    }
    setMarkerPositions(positions);
  };

  const performSignIn = async () => {
    try {
      setAuthError(null);
      const devId = await getPersistentDeviceId();
      setDeviceId(devId);
      const res = await signInAnonymously(auth);
      setUser(res.user);
      return { user: res.user, devId };
    } catch (err) {
      console.log('Auth error:', err);
      setAuthError(err.message);
      return null;
    }
  };

  useEffect(() => {
    performSignIn();
  }, []);

  // Parse incoming deep links using React Native core Linking
  useEffect(() => {
    const handleUrl = (url) => {
      if (!url) return;
      const match = url.match(/[?&]code=([A-Za-z0-9]{6})/);
      if (match && match[1]) {
        const code = match[1].toUpperCase();
        setSessionCode(code);
        Alert.alert(
          'Deep Link Detected',
          `Auto-filled session code: ${code}. Tap "Start Live Tracking" to enter!`,
          [{ text: 'OK' }]
        );
      }
    };

    Linking.getInitialURL().then(handleUrl);
    const subscription = Linking.addEventListener('url', (event) => handleUrl(event.url));
    return () => subscription.remove();
  }, []);

  const handleStartSession = async () => {
    let devId = deviceId;
    let currentUser = user || auth.currentUser;

    if (!currentUser || !devId) {
      setIsLoading(true);
      const res = await performSignIn();
      if (res) {
        currentUser = res.user;
        devId = res.devId;
      }
      setIsLoading(false);
    }

    if (!currentUser || !devId) {
      Alert.alert('Authentication Error', authError || 'Could not sign in anonymously.');
      return;
    }

    setIsLoading(true);
    try {
      const name = displayName.trim() || `User_${devId.substring(4, 8)}`;
      const targetCode = sessionCode.trim() || FIXED_SESSION_CODE;
      const session = await joinOrCreateFixedSession(devId, name, targetCode);
      setCurrentSession(session);
    } catch (e) {
      Alert.alert('Session Error', e.message);
    } finally {
      setIsLoading(false);
    }
  };

  const recenterToMyLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Location permission is required to center the map.');
        return;
      }
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High
      });
      if (loc && mapRef.current) {
        mapRef.current.animateToRegion(
          {
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01
          },
          1000
        );
      }
    } catch (e) {
      console.log('Error centering map:', e);
    }
  };

  useEffect(() => {
    if (!currentSession || !deviceId) return;

    recenterToMyLocation();

    startLocationSharing(currentSession.id, deviceId).catch((e) =>
      console.log('Location sharing error:', e)
    );

    const unsubscribeSession = subscribeSession(currentSession.id, (updatedSession) => {
      setCurrentSession(updatedSession);
      if (!updatedSession.active) {
        Alert.alert('Session Ended', 'This session has been ended by the host.');
        handleLeaveOrEnd(true);
      }
    });

    const unsubscribeLocations = subscribePeerLocations(currentSession.id, (locations) => {
      const locMap = {};
      locations.forEach((loc) => {
        locMap[loc.userId] = loc;
        if (loc.userId === deviceId) {
          setMyLocation(loc);
        }
      });
      setPeerLocations(locMap);
      updateMarkerPositions();
    });

    return () => {
      stopLocationSharing();
      unsubscribeSession();
      unsubscribeLocations();
    };
  }, [currentSession?.id, deviceId]);

  useEffect(() => {
    updateMarkerPositions();
  }, [peerLocations]);

  const handleLeaveOrEnd = async (forced = false) => {
    if (!currentSession || !deviceId) return;

    const performExit = async () => {
      stopLocationSharing();
      await leaveSession(currentSession.id, deviceId);
      setCurrentSession(null);
      setPeerLocations({});
      setMyLocation(null);
    };

    if (forced) {
      await performExit();
    } else {
      Alert.alert(
        'Leave Session?',
        'Are you sure you want to stop sharing live location?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Leave', style: 'destructive', onPress: performExit }
        ]
      );
    }
  };

  const shareSessionLink = async () => {
    if (!currentSession?.sessionCode) return;

    const code = currentSession.sessionCode;
    const shareUrl = `https://suhailkt.github.io/livelocation?code=${code}`;
    const shareMessage = `📍 Join my live location session!\n\nSession Code: ${code}\n${shareUrl}`;

    try {
      await Share.share({
        message: shareMessage,
        title: `Live Location Session ${code}`
      });
    } catch (error) {
      Alert.alert('Error Sharing', error.message);
    }
  };

  if (currentSession) {
    const nowMs = Date.now();
    // Filter out duplicate or stale devices (> 3 mins offline)
    const activeParticipantsMap = {};
    Object.entries(currentSession.participants || {}).forEach(([uid, details]) => {
      if (details.lastSeen) {
        const lastSeenMs = new Date(details.lastSeen).getTime();
        if (nowMs - lastSeenMs > STALE_TIMEOUT_MS) return; // Skip stale device
      }
      activeParticipantsMap[uid] = details;
    });

    const participantsList = Object.entries(activeParticipantsMap).map(
      ([uid, details]) => ({
        userId: uid,
        ...details
      })
    );

    return (
      <View style={styles.container}>
        <StatusBar style="light" />

        <MapView
          ref={mapRef}
          style={styles.map}
          showsUserLocation={true}
          showsMyLocationButton={false}
          onRegionChangeComplete={updateMarkerPositions}
          onRegionChange={updateMarkerPositions}
          onMapReady={updateMarkerPositions}
          initialRegion={{
            latitude: myLocation ? myLocation.lat : 37.78825,
            longitude: myLocation ? myLocation.lng : -122.4324,
            latitudeDelta: 0.05,
            longitudeDelta: 0.05
          }}
        >
          {Object.values(peerLocations).map((loc) => {
            const participant = activeParticipantsMap[loc.userId];
            if (!participant) return null;

            const isMe = loc.userId === deviceId;
            const pColor = participant.colorHex || '#2196F3';

            let distanceText = isMe ? 'You' : 'Locating...';
            if (!isMe && myLocation) {
              const meters = distanceInMeters(myLocation.lat, myLocation.lng, loc.lat, loc.lng);
              distanceText = formatDistance(meters);
            }

            // -------------------------------------------------------------
            // iOS IMPLEMENTATION: Original Sleek Badge + Callout Popup
            // -------------------------------------------------------------
            if (Platform.OS === 'ios') {
              return (
                <Marker
                  key={loc.userId}
                  coordinate={{ latitude: loc.lat, longitude: loc.lng }}
                  title={`${participant.displayName} ${isMe ? '(You)' : ''}`}
                  description={`Distance: ${distanceText}`}
                  onCalloutPress={() => {
                    if (!isMe) {
                      openMapsNavigation(loc.lat, loc.lng, participant.displayName);
                    }
                  }}
                >
                  <View style={styles.iosMarkerContainer}>
                    <View style={[styles.iosNameBadgePill, { borderColor: pColor }]}>
                      <Text style={styles.iosNameBadgeText} numberOfLines={1}>
                        {participant.displayName} {isMe ? '(You)' : ''}
                      </Text>
                    </View>
                    <View style={[styles.iosPinCircle, { backgroundColor: pColor }]}>
                      <Text style={styles.iosAvatarLetter}>
                        {participant.displayName ? participant.displayName[0].toUpperCase() : 'U'}
                      </Text>
                    </View>
                    <View style={[styles.iosPinArrow, { borderTopColor: pColor }]} />
                  </View>

                  <Callout
                    onPress={() => {
                      if (!isMe) {
                        openMapsNavigation(loc.lat, loc.lng, participant.displayName);
                      }
                    }}
                  >
                    <View style={styles.iosCalloutBox}>
                      <Text style={styles.iosCalloutTitle}>{participant.displayName}</Text>
                      <Text style={styles.iosCalloutSub}>{distanceText}</Text>
                      {!isMe && <Text style={styles.iosCalloutNav}>Tap to Navigate ➔</Text>}
                    </View>
                  </Callout>
                </Marker>
              );
            }

            // -------------------------------------------------------------
            // ANDROID IMPLEMENTATION: Native Pin (Badge Overlay rendered in screen space below)
            // -------------------------------------------------------------
            return (
              <Marker
                key={loc.userId}
                coordinate={{ latitude: loc.lat, longitude: loc.lng }}
                pinColor={pColor}
                title={`${participant.displayName} ${isMe ? '(You)' : ''}`}
                description={`Distance: ${distanceText}`}
                onCalloutPress={() => {
                  if (!isMe) {
                    openMapsNavigation(loc.lat, loc.lng, participant.displayName);
                  }
                }}
              />
            );
          })}
        </MapView>

        {/* ------------------------------------------------------------- */}
        {/* ANDROID SCREEN-SPACE OVERLAY: Always-Visible 0% Clipped Badges */}
        {/* ------------------------------------------------------------- */}
        {Platform.OS === 'android' &&
          Object.values(peerLocations).map((loc) => {
            const point = markerPositions[loc.userId];
            if (!point) return null;
            const participant = activeParticipantsMap[loc.userId];
            if (!participant) return null;
            const isMe = loc.userId === deviceId;
            const pColor = participant.colorHex || '#2196F3';

            return (
              <View
                key={`android-badge-${loc.userId}`}
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  left: point.x - 70,
                  top: point.y - 48,
                  width: 140,
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 999
                }}
              >
                <View style={[styles.androidOverlayPill, { borderColor: pColor }]}>
                  <Text style={styles.androidOverlayText} numberOfLines={1}>
                    {participant.displayName} {isMe ? '(You)' : ''}
                  </Text>
                </View>
              </View>
            );
          })}

        {/* Top Header Bar */}
        <SafeAreaView style={styles.topBarContainer}>
          <View style={styles.topBar}>
            <View style={styles.codeCard}>
              <Text style={styles.codeLabel}>SESSION CODE</Text>
              <Text style={styles.codeText}>{currentSession.sessionCode}</Text>
            </View>

            <TouchableOpacity style={styles.shareButton} onPress={shareSessionLink}>
              <Text style={styles.shareButtonText}>📤 Share Code</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.leaveButton} onPress={() => handleLeaveOrEnd()}>
              <Text style={styles.leaveButtonText}>LEAVE</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>

        {/* Floating Recenter Location Button */}
        <TouchableOpacity style={styles.recenterFab} onPress={recenterToMyLocation}>
          <Text style={styles.recenterIcon}>🎯</Text>
        </TouchableOpacity>

        {/* Bottom Floating Trigger */}
        <TouchableOpacity
          style={styles.bottomTrigger}
          onPress={() => setShowParticipantSheet(true)}
        >
          <Text style={styles.bottomTriggerText}>
            👥 {participantsList.length} Participant{participantsList.length > 1 ? 's' : ''} (Tap to view)
          </Text>
        </TouchableOpacity>

        {/* Participants Sheet */}
        <Modal
          visible={showParticipantSheet}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setShowParticipantSheet(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Active Participants</Text>
                <TouchableOpacity onPress={() => setShowParticipantSheet(false)}>
                  <Text style={styles.closeModal}>✕</Text>
                </TouchableOpacity>
              </View>

              <FlatList
                data={participantsList}
                keyExtractor={(item) => item.userId}
                renderItem={({ item }) => {
                  const isMe = item.userId === deviceId;
                  const location = peerLocations[item.userId];
                  let distStr = 'Locating...';
                  if (location) {
                    if (isMe) distStr = 'You';
                    else if (myLocation) {
                      distStr = formatDistance(
                        distanceInMeters(myLocation.lat, myLocation.lng, location.lat, location.lng)
                      );
                    }
                  }

                  return (
                    <View style={styles.participantRow}>
                      <View style={[styles.avatar, { backgroundColor: item.colorHex || '#2196F3' }]}>
                        <Text style={styles.avatarText}>{item.displayName[0].toUpperCase()}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.pName}>
                          {item.displayName} {isMe ? '(You)' : ''}
                        </Text>
                        <Text style={styles.pDist}>{distStr}</Text>
                      </View>

                      {!isMe && location && (
                        <TouchableOpacity
                          style={styles.navButton}
                          onPress={() => openMapsNavigation(location.lat, location.lng, item.displayName)}
                        >
                          <Text style={styles.navButtonText}>Navigate</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                }}
              />
            </View>
          </View>
        </Modal>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.homeContainer}>
      <StatusBar style="light" />
      <View style={styles.homeContent}>
        <Text style={styles.brandTitle}>📍 Live Tracker</Text>
        <Text style={styles.brandSubtitle}>Zero-cost real-time peer location sharing</Text>

        {authError && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>
              ⚠️ Google API Restriction Error: Add "Identity Toolkit API" in Google Cloud Console Credentials.
            </Text>
          </View>
        )}

        <View style={styles.inputCard}>
          <Text style={styles.inputLabel}>Your Display Name</Text>
          <TextInput
            style={styles.input}
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Explorer"
            placeholderTextColor="#666"
          />
        </View>

        {isLoading ? (
          <ActivityIndicator size="large" color="#6C5CE7" style={{ marginTop: 20 }} />
        ) : (
          <View style={styles.actionCard}>
            <Text style={styles.cardHeader}>Start Live Tracker</Text>
            <Text style={styles.cardBody}>
              Connect directly to the default session ({sessionCode}) with zero database creation overhead.
            </Text>
            
            <View style={styles.codeRow}>
              <Text style={styles.codeRowLabel}>Session Code:</Text>
              <TextInput
                style={styles.codeInputInline}
                value={sessionCode}
                onChangeText={(val) => setSessionCode(val.toUpperCase())}
                autoCapitalize="characters"
                maxLength={6}
              />
            </View>

            <TouchableOpacity style={styles.btnPrimary} onPress={handleStartSession}>
              <Text style={styles.btnText}>Start Live Tracking 🚀</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0F1A' },
  map: { width: Dimensions.get('window').width, height: Dimensions.get('window').height },
  topBarContainer: { position: 'absolute', top: 10, left: 16, right: 16 },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  codeCard: {
    backgroundColor: '#1E1E2C',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    elevation: 4
  },
  codeLabel: { color: '#888', fontSize: 9, fontWeight: 'bold' },
  codeText: { color: '#FFF', fontSize: 15, fontWeight: 'bold', marginTop: 1 },
  shareButton: {
    backgroundColor: '#6C5CE7',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    elevation: 4
  },
  shareButtonText: { color: '#FFF', fontWeight: 'bold', fontSize: 13 },
  leaveButton: {
    backgroundColor: '#FF5252',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    elevation: 4
  },
  leaveButtonText: { color: '#FFF', fontWeight: 'bold', fontSize: 13 },
  recenterFab: {
    position: 'absolute',
    right: 20,
    bottom: 95,
    backgroundColor: '#1E1E2C',
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
    borderWidth: 1,
    borderColor: '#333'
  },
  recenterIcon: { fontSize: 22 },

  bottomTrigger: {
    position: 'absolute',
    bottom: 30,
    left: 20,
    right: 20,
    backgroundColor: '#1E1E2C',
    padding: 16,
    borderRadius: 20,
    alignItems: 'center',
    elevation: 6
  },
  bottomTriggerText: { color: '#FFF', fontWeight: 'bold', fontSize: 15 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: '#1E1E2C',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '60%'
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  modalTitle: { color: '#FFF', fontSize: 18, fontWeight: 'bold' },
  closeModal: { color: '#888', fontSize: 20, fontWeight: 'bold' },
  participantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2A2D3E'
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12
  },
  avatarText: { color: '#FFF', fontWeight: 'bold', fontSize: 16 },
  pName: { color: '#FFF', fontWeight: 'bold', fontSize: 15 },
  pDist: { color: '#888', fontSize: 13, marginTop: 2 },
  navButton: { backgroundColor: '#6C5CE7', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },
  navButtonText: { color: '#FFF', fontWeight: 'bold', fontSize: 12 },

  // iOS Original Sleek Marker Styles
  iosMarkerContainer: {
    alignItems: 'center',
    justifyContent: 'center'
  },
  iosNameBadgePill: {
    backgroundColor: '#0F0F1A',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1.5,
    marginBottom: 4
  },
  iosNameBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: 'bold'
  },
  iosPinCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF'
  },
  iosAvatarLetter: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold'
  },
  iosPinArrow: {
    width: 0,
    height: 0,
    backgroundColor: 'transparent',
    borderStyle: 'solid',
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 6,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    alignSelf: 'center',
    marginTop: -1
  },

  // iOS Custom Callout Popup Styles
  iosCalloutBox: {
    width: 160,
    padding: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center'
  },
  iosCalloutTitle: {
    fontWeight: 'bold',
    fontSize: 14,
    color: '#0F0F1A',
    textAlign: 'center'
  },
  iosCalloutSub: {
    color: '#666',
    fontSize: 12,
    marginTop: 2,
    textAlign: 'center'
  },
  iosCalloutNav: {
    color: '#6C5CE7',
    fontWeight: 'bold',
    fontSize: 12,
    marginTop: 6,
    textAlign: 'center'
  },

  // Android Screen-Space Overlay Styles (100% Impossible to Clip)
  androidOverlayPill: {
    backgroundColor: '#0F0F1A',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6
  },
  androidOverlayText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
    textAlign: 'center'
  },

  homeContainer: { flex: 1, backgroundColor: '#0F0F1A', width: '100%', height: '100%' },
  homeContent: { flex: 1, padding: 24, justifyContent: 'center', width: '100%', height: '100%' },
  brandTitle: { color: '#FFF', fontSize: 32, fontWeight: 'extrabold', textAlign: 'center' },
  brandSubtitle: { color: '#888', fontSize: 14, textAlign: 'center', marginTop: 4, marginBottom: 30 },
  errorBox: {
    backgroundColor: 'rgba(255, 82, 82, 0.15)',
    borderColor: '#FF5252',
    borderWidth: 1,
    padding: 12,
    borderRadius: 12,
    marginBottom: 16
  },
  errorText: { color: '#FF5252', fontSize: 12, textAlign: 'center', fontWeight: 'bold' },
  inputCard: { backgroundColor: '#1E1E2C', padding: 16, borderRadius: 16, marginBottom: 20 },
  inputLabel: { color: '#888', fontSize: 12, marginBottom: 6 },
  input: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
  actionCard: { backgroundColor: '#1E1E2C', padding: 20, borderRadius: 20, marginBottom: 16 },
  cardHeader: { color: '#FFF', fontSize: 18, fontWeight: 'bold' },
  cardBody: { color: '#888', fontSize: 13, marginTop: 4, marginBottom: 16 },
  codeRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  codeRowLabel: { color: '#AAA', fontSize: 14, marginRight: 10 },
  codeInputInline: {
    backgroundColor: '#141422',
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold',
    letterSpacing: 2,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    flex: 1,
    textAlign: 'center'
  },
  btnPrimary: { backgroundColor: '#6C5CE7', padding: 14, borderRadius: 12, alignItems: 'center' },
  btnText: { color: '#FFF', fontWeight: 'bold', fontSize: 16 }
});
