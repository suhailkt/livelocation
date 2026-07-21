# 📱 Live Location Sharing App (Expo / React Native)

This directory contains the **Expo / React Native** version of the Live Location Sharing application. It allows you to test the app live on an **iPhone or Android device** directly from a **Windows machine** using the **Expo Go app** via QR code!

---

## ⚡ Quick Start: Testing on your iPhone

### Step 1: Install Expo Go on your iPhone
1. Open the **App Store** on your iPhone.
2. Search for and download **Expo Go**.

### Step 2: Install Project Dependencies (on your Windows PC)
Open your terminal in `d:\dev\LiveLocationExpo`:

```bash
cd d:\dev\LiveLocationExpo
npm install
```

### Step 3: Start the Expo Development Server
Run:

```bash
npx expo start
```

### Step 4: Scan QR Code on iPhone
1. A QR code will be displayed in your terminal.
2. Open the **Camera app** on your iPhone and scan the QR code.
3. Tap the prompt to open in **Expo Go**.
4. The app will bundle and load live on your iPhone!

---

## 🌟 Key Features Built-In

- 🔑 **Anonymous Firebase Auth**: Zero-friction login on startup.
- 🚀 **6-Character Session Code**: Create or join live location sharing sessions.
- 📍 **Real-time Map & GPS Stream**: Built with `react-native-maps` and `expo-location`.
- ⚡ **Stationary Filter**: Skips Firestore uploads if moved < 5 meters.
- 📐 **Zero-Cost Haversine Distance**: Straight-line distance between peers calculated locally in JS.
- 🗺️ **One-Tap Apple/Google Maps Navigation**: Deep links directly to native navigation apps.
