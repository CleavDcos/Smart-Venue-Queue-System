/**
 * components/VenueMap.jsx — Google Maps venue visualization
 *
 * Displays the event venue on an interactive Google Map with:
 *   - A venue marker (📍)
 *   - Stall markers colour-coded by load (🟢 low / 🟡 medium / 🔴 high)
 *
 * Requires: VITE_GOOGLE_MAPS_API_KEY environment variable.
 * Falls back gracefully to a styled placeholder if the key is absent.
 *
 * Uses: @react-google-maps/api
 */

import { useMemo, useCallback } from 'react';
import { GoogleMap, useLoadScript, MarkerF, InfoWindowF } from '@react-google-maps/api';
import { useState } from 'react';

const MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';

// Default venue: Wankhede Stadium, Mumbai (used when no coordinates provided)
const DEFAULT_CENTER = { lat: 18.9388, lng: 72.8254 };

const MAP_STYLES = [
  { elementType: 'geometry',        stylers: [{ color: '#1a1a2e' }] },
  { elementType: 'labels.text.fill',stylers: [{ color: '#a0a0c0' }] },
  { featureType: 'road',            elementType: 'geometry', stylers: [{ color: '#2a2a40' }] },
  { featureType: 'water',           elementType: 'geometry', stylers: [{ color: '#0d1b2a' }] },
  { featureType: 'poi',             stylers: [{ visibility: 'off' }] },
  { featureType: 'transit',         stylers: [{ visibility: 'off' }] },
];

const containerStyle = {
  width: '100%',
  height: '340px',
  borderRadius: '12px',
  overflow: 'hidden',
};

/**
 * Determine marker icon URL based on stall load ratio.
 */
const stallIcon = (loadRatio) => {
  const color = loadRatio >= 0.8 ? 'red' : loadRatio >= 0.5 ? 'yellow' : 'green';
  return `https://maps.google.com/mapfiles/ms/icons/${color}-dot.png`;
};

const VenueMap = ({ center = DEFAULT_CENTER, venueName = 'Venue', stalls = [] }) => {
  const [activeMarker, setActiveMarker] = useState(null);

  const { isLoaded, loadError } = useLoadScript({
    googleMapsApiKey: MAPS_API_KEY,
  });

  const mapOptions = useMemo(() => ({
    styles: MAP_STYLES,
    disableDefaultUI: false,
    zoomControl: true,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: true,
    zoom: 15,
  }), []);

  const onMapClick = useCallback(() => setActiveMarker(null), []);

  // ─── No API key ──────────────────────────────────────────────────────────────
  if (!MAPS_API_KEY) {
    return (
      <div
        style={{
          width: '100%', height: 340,
          background: 'linear-gradient(135deg, #1a1a2e 0%, #0d1b2a 100%)',
          borderRadius: 12,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 8,
          border: '1px solid rgba(108,99,255,0.2)',
        }}
        aria-label="Venue map (Google Maps API key required)"
      >
        <span style={{ fontSize: '2.5rem' }}>🗺️</span>
        <p style={{ color: '#a0a0c0', fontSize: '0.9rem', margin: 0 }}>
          {venueName}
        </p>
        <p style={{ color: '#5a5a7a', fontSize: '0.75rem', margin: 0 }}>
          Set <code>VITE_GOOGLE_MAPS_API_KEY</code> to enable live map
        </p>
      </div>
    );
  }

  // ─── Load error ──────────────────────────────────────────────────────────────
  if (loadError) {
    return (
      <div style={{ ...containerStyle, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}>
        <p style={{ color: '#ef4444', fontSize: '0.9rem' }}>⚠️ Failed to load Google Maps</p>
      </div>
    );
  }

  // ─── Loading ─────────────────────────────────────────────────────────────────
  if (!isLoaded) {
    return (
      <div style={{ ...containerStyle, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1a1a2e' }}>
        <div className="spinner" />
      </div>
    );
  }

  // ─── Map ─────────────────────────────────────────────────────────────────────
  return (
    <GoogleMap
      mapContainerStyle={containerStyle}
      center={center}
      zoom={15}
      options={mapOptions}
      onClick={onMapClick}
    >
      {/* Venue marker */}
      <MarkerF
        position={center}
        title={venueName}
        onClick={() => setActiveMarker('venue')}
        icon={{
          url: 'https://maps.google.com/mapfiles/ms/icons/blue-dot.png',
          scaledSize: { width: 40, height: 40, equals: () => false },
        }}
      />
      {activeMarker === 'venue' && (
        <InfoWindowF position={center} onCloseClick={() => setActiveMarker(null)}>
          <div style={{ color: '#000', fontWeight: 600, fontSize: '0.85rem' }}>
            📍 {venueName}
          </div>
        </InfoWindowF>
      )}

      {/* Stall markers */}
      {stalls.map((stall) => {
        if (!stall.coordinates?.lat) return null;
        const pos = { lat: stall.coordinates.lat, lng: stall.coordinates.lng };
        return (
          <MarkerF
            key={stall._id}
            position={pos}
            title={stall.name}
            icon={stallIcon(stall.loadRatio || 0)}
            onClick={() => setActiveMarker(stall._id)}
          />
        );
      })}
      {stalls.map((stall) => {
        if (!stall.coordinates?.lat || activeMarker !== stall._id) return null;
        return (
          <InfoWindowF
            key={`iw-${stall._id}`}
            position={{ lat: stall.coordinates.lat, lng: stall.coordinates.lng }}
            onCloseClick={() => setActiveMarker(null)}
          >
            <div style={{ color: '#000', fontSize: '0.8rem' }}>
              <div style={{ fontWeight: 700 }}>{stall.name}</div>
              <div>Load: {stall.currentLoad}/{stall.capacity}</div>
              <div>~{stall.estimatedWaitMinutes} min wait</div>
            </div>
          </InfoWindowF>
        );
      })}
    </GoogleMap>
  );
};

export default VenueMap;
