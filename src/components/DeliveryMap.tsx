"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { getRouteWithWaypoints, osrmRouteToCoordinates, getDistanceInKm, getDurationInMinutes, RoutePoint } from "@/lib/osrmRouting";

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

    // Rate limiting helper
    let lastGeocodeTime = 0;
    const GEOCODE_DELAY = 1000; // 1 second between requests

    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    // Helper function to create timeout for fetch
    const fetchWithTimeout = async (url: string, options: RequestInit = {}, timeout = 10000) => {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), timeout);
      
      try {
        const response = await fetch(url, {
          ...options,
          signal: controller.signal
        });
        clearTimeout(id);
        return response;
      } catch (error) {
        clearTimeout(id);
        throw error;
      }
    };

    // Real geocoding function using Nominatim (OpenStreetMap) with state priority
    const geocodeAddress = async (address: string, city: string, state: string): Promise<[number, number]> => {
      try {
        // Rate limiting
        const now = Date.now();
        const timeSinceLastGeocode = now - lastGeocodeTime;
        if (timeSinceLastGeocode < GEOCODE_DELAY) {
          await delay(GEOCODE_DELAY - timeSinceLastGeocode);
        }
        lastGeocodeTime = Date.now();

        // Simplified approach: prioritize state by including it in the query first
        const stateQuery = `${state}, Brazil`;
        
        try {
          const stateResponse = await fetchWithTimeout(
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(stateQuery)}&limit=1`,
            {
              headers: {
                'User-Agent': 'DeliveryNFE-App/1.0'
              }
            },
            10000
          );
          
          if (!stateResponse.ok) {
            throw new Error(`State geocoding failed: ${stateResponse.status}`);
          }
          
          const stateData = await stateResponse.json();
          let stateBounds: any = null;
          
          if (stateData && stateData.length > 0) {
            stateBounds = {
              south: parseFloat(stateData[0].boundingbox[0]),
              north: parseFloat(stateData[0].boundingbox[1]),
              west: parseFloat(stateData[0].boundingbox[2]),
              east: parseFloat(stateData[0].boundingbox[3])
            };
            console.log(`State bounds for ${state}:`, stateBounds);
          }
          
          // Add delay before next request
          await delay(GEOCODE_DELAY);
          
          // Try geocoding with full address
          const fullQuery = `${address}, ${city}, ${state}, Brazil`;
          const response = await fetchWithTimeout(
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(fullQuery)}&limit=5`,
            {
              headers: {
                'User-Agent': 'DeliveryNFE-App/1.0'
              }
            },
            10000
          );
          
          if (!response.ok) {
            throw new Error(`Address geocoding failed: ${response.status}`);
          }
          
          const data = await response.json();
          
          if (data && data.length > 0) {
            // If we have state bounds, prioritize results within the state
            if (stateBounds) {
              const inStateResults = data.filter((result: any) => {
                const lat = parseFloat(result.lat);
                const lon = parseFloat(result.lon);
                return lat >= stateBounds.south && lat <= stateBounds.north &&
                       lon >= stateBounds.west && lon <= stateBounds.east;
              });
              
              if (inStateResults.length > 0) {
                console.log(`Found ${inStateResults.length} results within ${state} bounds`);
                return [parseFloat(inStateResults[0].lat), parseFloat(inStateResults[0].lon)];
              }
            }
            
            // Fall back to first result if no state bounds or no results within bounds
            return [parseFloat(data[0].lat), parseFloat(data[0].lon)];
          }
          
          // Add delay before city-level attempt
          await delay(GEOCODE_DELAY);
          
          // Try with just city and state if full address fails
          const cityQuery = `${city}, ${state}, Brazil`;
          const cityResponse = await fetchWithTimeout(
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(cityQuery)}&limit=1`,
            {
              headers: {
                'User-Agent': 'DeliveryNFE-App/1.0'
              }
            },
            10000
          );
          
          if (!cityResponse.ok) {
            throw new Error(`City geocoding failed: ${cityResponse.status}`);
          }
          
          const cityData = await cityResponse.json();
          
          if (cityData && cityData.length > 0) {
            console.log(`Using city-level geocoding for ${city}, ${state}`);
            return [parseFloat(cityData[0].lat), parseFloat(cityData[0].lon)];
          }
          
        } catch (fetchError) {
          console.warn(`Geocoding API error for ${city}, ${state}:`, fetchError);
          // Continue to fallback
        }
        
        // Fallback to simulated coordinates if geocoding fails
        console.warn(`Geocoding failed for: ${address}, ${city}, ${state}, using fallback`);
        return getFallbackCoordinates(address, city, state);
      } catch (error) {
        console.warn(`Geocoding error for: ${address}, ${city}, ${state}`, error);
        return getFallbackCoordinates(address, city, state);
      }
    };

    // Fallback coordinates based on address hash and state
    const getFallbackCoordinates = (address: string, city: string, state: string): [number, number] => {
      const hash = (address + city + state).split("").reduce((acc, char) => {
        return ((acc << 5) - acc) + char.charCodeAt(0);
      }, 0);
      
      // State-based base coordinates for better regional accuracy
      const stateBaseCoords: { [key: string]: [number, number] } = {
        'SP': [-23.5505, -46.6333],  // São Paulo
        'RJ': [-22.9068, -43.1729],  // Rio de Janeiro
        'MG': [-19.9167, -43.9345],  // Minas Gerais
        'RS': [-30.0346, -51.2177],  // Rio Grande do Sul
        'PR': [-25.4284, -49.2733],  // Paraná
        'SC': [-27.5954, -48.5480],  // Santa Catarina
        'BA': [-12.9714, -38.5014],  // Bahia
        'PE': [-8.0476, -34.8770],   // Pernambuco
        'GO': [-16.6869, -49.2648],  // Goiás
        'AM': [-3.1190, -60.0217],   // Amazonas
        'CE': [-3.7172, -38.5433],   // Ceará
        'DF': [-15.8267, -47.9218],  // Distrito Federal
        'ES': [-20.3155, -40.3128],  // Espírito Santo
        'MA': [-2.5297, -44.3028],   // Maranhão
        'MT': [-15.6014, -56.0979],  // Mato Grosso
        'MS': [-20.4697, -54.6201],  // Mato Grosso do Sul
        'PA': [-1.4558, -48.4902],   // Pará
        'PB': [-7.1195, -34.8450],   // Paraíba
        'PI': [-5.0892, -42.8019],   // Piauí
        'AL': [-9.6658, -35.7350],   // Alagoas
        'RN': [-5.7945, -35.2110],   // Rio Grande do Norte
        'SE': [-10.9472, -37.0731],  // Sergipe
        'TO': [-10.2491, -48.3243],  // Tocantins
        'RO': [-8.7612, -63.9004],   // Rondônia
        'AC': [-9.9754, -67.8249],   // Acre
        'AP': [0.0349, -51.0694],    // Amapá
        'RR': [2.8235, -60.6758],    // Roraima
      };
      
      // Use state-specific base coordinates, default to São Paulo
      const [baseLat, baseLng] = stateBaseCoords[state.toUpperCase()] || stateBaseCoords['SP'];
      
      // Add some variation based on the hash for address differentiation
      const lat = baseLat + (Math.abs(hash) % 200 - 100) / 1000;
      const lng = baseLng + (Math.abs(hash >> 8) % 200 - 100) / 1000;
      
      console.log(`Using fallback coordinates for ${city}, ${state}: [${lat}, ${lng}]`);
      return [lat, lng];
    };

    // Add markers for each delivery point
    const addMarkers = async () => {
      if (!mapRef.current) {
        console.warn('Map not ready, skipping marker addition');
        return;
      }

      const coordinates: [number, number][] = [];
      const waypoints: RoutePoint[] = [];

      for (const point of optimizedRoute) {
        // Check if map is still available before each iteration
        if (!mapRef.current) {
          console.warn('Map became unavailable during marker addition');
          return;
        }

        const coords = await geocodeAddress(point.endereco, point.municipio, point.uf);
        coordinates.push(coords);
        waypoints.push({ lat: coords[0], lng: coords[1] });

        // Check again before adding marker
        if (!mapRef.current) {
          console.warn('Map became unavailable before adding marker');
          return;
        }

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

        try {
          const marker = L.marker(coords, { icon: customIcon })
            .addTo(mapRef.current)
            .bindPopup(`
              <div style="min-width: 200px;">
                <strong style="color: #1e40af;">${point.order}. ${point.destinatario}</strong><br/>
                <span style="color: #6b7280;">${point.endereco}</span><br/>
                <span style="color: #6b7280;">${point.bairro} - ${point.municipio}/${point.uf}</span><br/>
                <span style="color: #6b7280;">CEP: ${point.cep}</span>
              </div>
            `);

          markersRef.current.push(marker);
        } catch (error) {
          console.error('Error adding marker:', error);
        }
      }

      // Draw route using OSRM (real street routing)
      if (waypoints.length > 1 && mapRef.current) {
        console.log('Fetching OSRM route for', waypoints.length, 'waypoints');
        
        const osrmRoute = await getRouteWithWaypoints(waypoints);
        
        if (osrmRoute) {
          const routeCoordinates = osrmRouteToCoordinates(osrmRoute);
          const distance = getDistanceInKm(osrmRoute);
          const duration = getDurationInMinutes(osrmRoute);
          
          console.log(`OSRM Route: ${distance.toFixed(1)}km, ${duration}min`);

          const polyline = L.polyline(routeCoordinates, {
            color: "#2563eb",
            weight: 5,
            opacity: 0.8,
            smoothFactor: 1,
          }).addTo(mapRef.current);

          polylineRef.current = polyline;

          // Fit map to show the entire route
          if (routeCoordinates.length > 0) {
            const bounds = L.latLngBounds(routeCoordinates);
            mapRef.current.fitBounds(bounds, { padding: [50, 50] });
          }
        } else {
          console.warn('OSRM route failed, falling back to straight lines');
          // Fallback to straight lines if OSRM fails
          const polyline = L.polyline(coordinates, {
            color: "#2563eb",
            weight: 4,
            opacity: 0.8,
            dashArray: '10, 10',
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

            L.marker(midPoint, { icon: arrowIcon, interactive: false }).addTo(mapRef.current);
          }

          // Fit map to show all points
          if (coordinates.length > 0) {
            const bounds = L.latLngBounds(coordinates);
            mapRef.current.fitBounds(bounds, { padding: [50, 50] });
          }
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