import { AppRegistry } from 'react-native';
import { registerRootComponent } from 'expo';
import App from './App';

// Register with Expo root component helper
registerRootComponent(App);

// Explicitly register all potential iOS AppDelegate moduleName keys to eliminate blank black screen on launch
AppRegistry.registerComponent('main', () => App);
AppRegistry.registerComponent('LiveLocation', () => App);
AppRegistry.registerComponent('Live Location', () => App);
AppRegistry.registerComponent('live-location-expo', () => App);
