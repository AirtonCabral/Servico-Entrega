"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix for default marker icons in Leaflet with Next.js
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

interface DeliveryPoint {
  id: string;
  destinatario: string;
  endereco: string;
  bairro: string;
  municipio: string;
  uf: string;
  cep: string;
  order?: number;
}

interface DeliveryMapProps {
  deliveryPoints: DeliveryPoint[];
  optimizedRoute: DeliveryPoint[];
}

export default function DeliveryMap({ deliveryPoints, optimizedRoute }: DeliveryMapProps) {
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<L.Marker[]>([]);
  const polylineRef = useRef<L.Polyline | null>(null);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    // Initialize map centered on Brazil
    const map = L.map(mapContainerRef.current).setView([-23.5505, -46.6333], 12);

    // Add OpenStreetMap tiles
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current || deliveryPoints.length === 0) return;

    // Clear existing markers and polyline
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];
    if (polylineRef.current) {
      polylineRef.current.remove();
      polylineRef.current = null;
    }

    // Real geocoding function using Nominatim (OpenStreetMap)
    const geocodeAddress = async (address: string, city: string, state: string): Promise<[number, number]> => {
      try {
        const query = `${address}, ${city}, ${state}, Brazil`;
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`,
          {
            headers: {
              'User-Agent': 'DeliveryNFE-App/1.0'
            }
          }
        );
        
        const data = await response.json();
        
        if (data && data.length > 0) {
          return [parseFloat(data[0].lat), parseFloat(data[0].lon)];
        }
        
        // Fallback to simulated coordinates if geocoding fails
        console.warn(`Geocoding failed for: ${query}, using fallback`);
        return getFallbackCoordinates(address, city);
      } catch (error) {
        console.warn(`Geocoding error for: ${address}, ${city}`, error);
        return getFallbackCoordinates(address, city);
      }
    };

    // Fallback coordinates based on address hash
    const getFallbackCoordinates = (address: string, city: string): [number, number] => {
      const hash = (address + city).split("").reduce((acc, char) => {
        return ((acc << 5) - acc) + char.charCodeAt(0);
      }, 0);
      
      // Generate coordinates around São Paulo as base
      const baseLat = -23.5505;
      const baseLng = -46.6333;
      
      // Add some variation based on the hash
      const lat = baseLat + (Math.abs(hash) % 200 - 100) / 1000;
      const lng = baseLng + (Math.abs(hash >> 8) % 200 - 100) / 1000;
      
      return [lat, lng];
    };

    // Add markers for each delivery point
    const addMarkers = async () => {
      const coordinates: [number, number][] = [];

      for (const point of optimizedRoute) {
        const coords = await geocodeAddress(point.endereco, point.municipio, point.uf);
        coordinates.push(coords);

        // Create custom icon with order number
        const customIcon = L.divIcon({
          className: "custom-marker",
          html: `<div style="
            background-color: ${point.order === 1 ? "#16a34a" : "#2563eb"};
            color: white;
            border-radius: 50%;
            width: 36px;
            height: 36px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
            font-size: 14px;
            border: 3px solid white;
            box-shadow: 0 2px 8px rgba(0,0,0,0.4);
            transition: transform 0.2s;
          ">${point.order || "?"}</div>`,
          iconSize: [36, 36],
          iconAnchor: [18, 18],
        });

        const marker = L.marker(coords, { icon: customIcon })
          .addTo(mapRef.current!)
          .bindPopup(`
            <div style="min-width: 200px;">
              <strong style="color: #1e40af;">${point.order}. ${point.destinatario}</strong><br/>
              <span style="color: #6b7280;">${point.endereco}</span><br/>
              <span style="color: #6b7280;">${point.bairro} - ${point.municipio}/${point.uf}</span><br/>
              <span style="color: #6b7280;">CEP: ${point.cep}</span>
            </div>
          `);

        markersRef.current.push(marker);
      }

      // Draw polyline connecting the points
      if (coordinates.length > 1) {
        const polyline = L.polyline(coordinates, {
          color: "#2563eb",
          weight: 4,
          opacity: 0.8,
        }).addTo(mapRef.current);

        polylineRef.current = polyline;

        // Add arrow markers to show direction
        for (let i = 0; i < coordinates.length - 1; i++) {
          const start = coordinates[i];
          const end = coordinates[i + 1];
          const midPoint: [number, number] = [
            (start[0] + end[0]) / 2,
            (start[1] + end[1]) / 2,
          ];

          const arrowIcon = L.divIcon({
            className: "custom-marker",
            html: `<div style="
              color: #2563eb;
              font-size: 16px;
              transform: rotate(${Math.atan2(end[1] - start[1], end[0] - start[0]) * 180 / Math.PI + 90}deg);
            ">→</div>`,
            iconSize: [20, 20],
            iconAnchor: [10, 10],
          });

          L.marker(midPoint, { icon: arrowIcon, interactive: false }).addTo(mapRef.current!);
        }

        // Fit map to show all points
        if (coordinates.length > 0) {
          const bounds = L.latLngBounds(coordinates);
          mapRef.current.fitBounds(bounds, { padding: [50, 50] });
        }
      }
    };

    addMarkers();
  }, [deliveryPoints, optimizedRoute]);

  return (
    <div
      ref={mapContainerRef}
      className="w-full h-full min-h-[400px] rounded-lg"
      style={{ zIndex: 1 }}
    />
  );
}