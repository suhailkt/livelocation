import { Linking, Platform, Alert } from 'react-native';

/**
 * Open external turn-by-turn navigation options.
 * On iOS: Prompts user to pick between Apple Maps & Google Maps.
 * On Android: Launches Google Maps directly.
 */
export function openMapsNavigation(lat, lng, label = 'Peer Location') {
  const destination = `${lat},${lng}`;

  if (Platform.OS === 'ios') {
    Alert.alert(
      'Choose Maps App',
      'Select your preferred navigation app:',
      [
        {
          text: 'Apple Maps 🍏',
          onPress: () => {
            const appleUrl = `maps://?daddr=${destination}&dirflg=d`;
            Linking.openURL(appleUrl).catch(() =>
              Linking.openURL(`http://maps.apple.com/?daddr=${destination}`)
            );
          }
        },
        {
          text: 'Google Maps 🗺️',
          onPress: async () => {
            const googleAppUrl = `comgooglemaps://?daddr=${destination}&directionsmode=driving`;
            const googleWebUrl = `https://www.google.com/maps/dir/?api=1&destination=${destination}`;
            
            const canOpenApp = await Linking.canOpenURL(googleAppUrl).catch(() => false);
            if (canOpenApp) {
              Linking.openURL(googleAppUrl);
            } else {
              Linking.openURL(googleWebUrl);
            }
          }
        },
        { text: 'Cancel', style: 'cancel' }
      ],
      { cancelable: true }
    );
  } else {
    // Android: Google Maps Turn-by-Turn
    const googleUrl = `https://www.google.com/maps/dir/?api=1&destination=${destination}`;
    Linking.openURL(googleUrl).catch(() => {
      const geoUrl = `geo:0,0?q=${destination}(${encodeURIComponent(label)})`;
      Linking.openURL(geoUrl);
    });
  }
}
