import React, { useRef, useEffect } from 'react';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';
import { colors } from '../lib/theme';

interface StaticMapProps {
  fromLat: number;
  fromLng: number;
  toLat?: number | null;
  toLng?: number | null;
  moverLat?: number | null;
  moverLng?: number | null;
  height?: number;
  borderRadius?: number;
}

export function StaticMap({ fromLat, fromLng, toLat, toLng, moverLat, moverLng, height = 200, borderRadius = 16 }: StaticMapProps) {
  const webViewRef = useRef<WebView>(null);

  // Update mover marker position without reloading the map
  useEffect(() => {
    if (moverLat == null || moverLng == null) return;
    webViewRef.current?.injectJavaScript(`
      if (window.moverMarker) {
        window.moverMarker.setLatLng([${moverLat}, ${moverLng}]);
      } else {
        var moverIcon = L.divIcon({ className: '', html: '<div class="mover-icon"></div>', iconSize: [22, 22], iconAnchor: [11, 11] });
        window.moverMarker = L.marker([${moverLat}, ${moverLng}], { icon: moverIcon, zIndexOffset: 1000 }).addTo(map);
      }
      true;
    `);
  }, [moverLat, moverLng]);
  const hasBoth = toLat != null && toLng != null;

  // Calculate center and zoom
  let centerLat = fromLat;
  let centerLng = fromLng;
  let zoom = 14;

  if (hasBoth) {
    centerLat = (fromLat + toLat!) / 2;
    centerLng = (fromLng + toLng!) / 2;
    const latDiff = Math.abs(toLat! - fromLat);
    const lonDiff = Math.abs(toLng! - fromLng);
    const maxDiff = Math.max(latDiff, lonDiff);
    if (maxDiff > 0.5) zoom = 10;
    else if (maxDiff > 0.2) zoom = 11;
    else if (maxDiff > 0.1) zoom = 12;
    else if (maxDiff > 0.05) zoom = 13;
    else if (maxDiff > 0.02) zoom = 14;
    else zoom = 15;
  }

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    * { margin: 0; padding: 0; }
    #map { width: 100%; height: 100vh; }
    .pickup-icon {
      width: 28px; height: 28px; border-radius: 14px;
      background: #ffffff; border: 3px solid #fff;
      box-shadow: 0 2px 8px rgba(0,0,0,0.5);
    }
    .dropoff-icon {
      width: 28px; height: 28px; border-radius: 6px;
      background: ${colors.accent.base}; border: 3px solid #fff;
      box-shadow: 0 2px 8px rgba(0,0,0,0.5);
    }
    .mover-icon {
      width: 22px; height: 22px; border-radius: 11px;
      background: #2563EB; border: 3px solid #fff;
      box-shadow: 0 2px 8px rgba(37,99,235,0.6);
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var map = L.map('map', {
      zoomControl: false,
      attributionControl: false,
      dragging: false,
      touchZoom: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      boxZoom: false,
    }).setView([${centerLat}, ${centerLng}], ${zoom});

    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
    }).addTo(map);

    var pickupIcon = L.divIcon({ className: '', html: '<div class="pickup-icon"></div>', iconSize: [28, 28], iconAnchor: [14, 14] });
    var dropoffIcon = L.divIcon({ className: '', html: '<div class="dropoff-icon"></div>', iconSize: [28, 28], iconAnchor: [14, 14] });

    window.moverMarker = null;
    L.marker([${fromLat}, ${fromLng}], { icon: pickupIcon }).addTo(map);

    ${hasBoth ? `
    L.marker([${toLat}, ${toLng}], { icon: dropoffIcon }).addTo(map);

    // Fetch real driving route from OSRM
    fetch('https://router.project-osrm.org/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}?overview=full&geometries=geojson')
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.routes && data.routes.length > 0) {
          var coords = data.routes[0].geometry.coordinates.map(function(c) { return [c[1], c[0]]; });
          var routeLine = L.polyline(coords, { color: '${colors.accent.base}', weight: 4, opacity: 0.8 }).addTo(map);
          map.fitBounds(routeLine.getBounds(), { padding: [40, 40] });
        } else {
          // Fallback to straight line
          var latlngs = [[${fromLat}, ${fromLng}], [${toLat}, ${toLng}]];
          L.polyline(latlngs, { color: '${colors.accent.base}', weight: 3, opacity: 0.7, dashArray: '8, 8' }).addTo(map);
          map.fitBounds(latlngs, { padding: [40, 40] });
        }
      })
      .catch(function() {
        var latlngs = [[${fromLat}, ${fromLng}], [${toLat}, ${toLng}]];
        L.polyline(latlngs, { color: '${colors.accent.base}', weight: 3, opacity: 0.7, dashArray: '8, 8' }).addTo(map);
        map.fitBounds(latlngs, { padding: [40, 40] });
      });
    ` : ''}
  </script>
</body>
</html>`;

  return (
    <View style={{ height, borderRadius, overflow: 'hidden', backgroundColor: colors.surface }}>
      <WebView
        ref={webViewRef}
        source={{ html }}
        style={{ flex: 1 }}
        scrollEnabled={false}
        bounces={false}
        javaScriptEnabled
        originWhitelist={['*']}
      />
    </View>
  );
}
