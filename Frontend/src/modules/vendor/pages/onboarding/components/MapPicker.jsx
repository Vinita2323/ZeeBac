import { useState } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

const DEFAULT_CENTER = [20.5937, 78.9629]; // India, used only when no pin is set yet

function ClickHandler({ onPick }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export default function MapPicker({ lat, lng, onChange, error }) {
  const [locating, setLocating] = useState(false);
  const hasPin = typeof lat === 'number' && typeof lng === 'number';
  const center = hasPin ? [lat, lng] : DEFAULT_CENTER;

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onChange(pos.coords.latitude, pos.coords.longitude);
        setLocating(false);
      },
      () => {
        alert('Could not get your location. Please allow location permission or drop a pin manually.');
        setLocating(false);
      }
    );
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-2">
        <label className="block text-[12px] font-bold text-gray-500 uppercase tracking-wider">
          Business Location<span className="text-red-500">*</span>
        </label>
        <button
          type="button"
          onClick={useCurrentLocation}
          disabled={locating}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#7c3aed]/10 text-[#7c3aed] text-[12px] font-bold hover:bg-[#7c3aed]/15 transition-colors cursor-pointer disabled:opacity-50 self-start sm:self-auto"
        >
          <span className="material-symbols-outlined text-[16px]">{locating ? 'progress_activity' : 'my_location'}</span>
          {locating ? 'Locating...' : 'Use Current Location'}
        </button>
      </div>

      <div className={`rounded-xl overflow-hidden border-2 ${error ? 'border-red-300' : 'border-gray-200'}`} style={{ height: 260 }}>
        <MapContainer center={center} zoom={hasPin ? 16 : 5} style={{ height: '100%', width: '100%' }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <ClickHandler onPick={onChange} />
          {hasPin && (
            <Marker
              position={center}
              draggable
              eventHandlers={{
                dragend: (e) => {
                  const { lat: newLat, lng: newLng } = e.target.getLatLng();
                  onChange(newLat, newLng);
                },
              }}
            />
          )}
        </MapContainer>
      </div>

      <p className="text-[11px] text-gray-500 flex items-center gap-1 ml-1">
        <span className="material-symbols-outlined text-[13px]">info</span>
        {hasPin ? 'Drag the pin to fine-tune, or tap the map to move it.' : 'Tap the map to drop a pin, or use "Use Current Location".'}
      </p>
      {error && (
        <p className="text-[11.5px] font-bold text-red-500 flex items-center gap-1 ml-1">
          <span className="material-symbols-outlined text-[13px]">error</span>{error}
        </p>
      )}
    </div>
  );
}
