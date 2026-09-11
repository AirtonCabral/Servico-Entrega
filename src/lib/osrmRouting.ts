// Serviço de routing usando OSRM (Open Source Routing Machine)
// API gratuita sem necessidade de API key

export interface OSRMRoute {
  geometry: string; // encoded polyline
  legs: OSRMLeg[];
  distance: number; // em metros
  duration: number; // em segundos
}

export interface OSRMLeg {
  distance: number;
  duration: number;
  steps: OSRMStep[];
}

export interface OSRMStep {
  distance: number;
  duration: number;
  maneuver: {
    type: string;
    modifier?: string;
  };
  name: string;
}

export interface RoutePoint {
  lat: number;
  lng: number;
}

/**
 * Decodifica uma polyline codificada (usado pela OSRM)
 */
function decodePolyline(encoded: string): RoutePoint[] {
  const points: RoutePoint[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let b;
    let shift = 0;
    let result = 0;

    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);

    const dlat = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;

    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);

    const dlng = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }

  return points;
}

/**
 * Calcula rota entre dois pontos usando OSRM
 */
export async function getRoute(
  start: RoutePoint,
  end: RoutePoint,
  profile: string = 'driving'
): Promise<OSRMRoute | null> {
  try {
    const url = `https://router.project-osrm.org/route/v1/${profile}/${start.lng},${start.lat};${end.lng},${end.lat}?overview=full&geometries=polyline`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'DeliveryNFE-App/1.0'
      }
    });

    if (!response.ok) {
      console.error('OSRM API error:', response.status, response.statusText);
      return null;
    }

    const data = await response.json();

    if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
      console.error('OSRM: No route found');
      return null;
    }

    return data.routes[0];
  } catch (error) {
    console.error('Error fetching OSRM route:', error);
    return null;
  }
}

/**
 * Calcula rota com múltiplos waypoints usando OSRM
 */
export async function getRouteWithWaypoints(
  waypoints: RoutePoint[],
  profile: string = 'driving'
): Promise<OSRMRoute | null> {
  if (waypoints.length < 2) {
    return null;
  }

  try {
    const coordinates = waypoints.map(wp => `${wp.lng},${wp.lat}`).join(';');
    const url = `https://router.project-osrm.org/route/v1/${profile}/${coordinates}?overview=full&geometries=polyline`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'DeliveryNFE-App/1.0'
      }
    });

    if (!response.ok) {
      console.error('OSRM API error:', response.status, response.statusText);
      return null;
    }

    const data = await response.json();

    if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
      console.error('OSRM: No route found');
      return null;
    }

    return data.routes[0];
  } catch (error) {
    console.error('Error fetching OSRM route with waypoints:', error);
    return null;
  }
}

/**
 * Converte uma rota OSRM em array de coordenadas para o Leaflet
 */
export function osrmRouteToCoordinates(route: OSRMRoute): [number, number][] {
  const points = decodePolyline(route.geometry);
  return points.map(p => [p.lat, p.lng] as [number, number]);
}

/**
 * Calcula distância total da rota em km
 */
export function getDistanceInKm(route: OSRMRoute): number {
  return route.distance / 1000;
}

/**
 * Calcula duração total da rota em minutos
 */
export function getDurationInMinutes(route: OSRMRoute): number {
  return Math.round(route.duration / 60);
}

/**
 * Obtém instruções de navegação da rota
 */
export function getNavigationInstructions(route: OSRMRoute): string[] {
  const instructions: string[] = [];

  route.legs.forEach(leg => {
    leg.steps.forEach(step => {
      const distance = (step.distance / 1000).toFixed(1);
      const duration = Math.round(step.duration / 60);
      
      let instruction = '';
      
      switch (step.maneuver.type) {
        case 'turn':
          instruction = `Vire ${step.maneuver.modifier || ''} na ${step.name}`;
          break;
        case 'new name':
          instruction = `Continue na ${step.name}`;
          break;
        case 'depart':
          instruction = `Saia de ${step.name}`;
          break;
        case 'arrive':
          instruction = `Chegue em ${step.name}`;
          break;
        case 'merge':
          instruction = `Mergue na ${step.name}`;
          break;
        case 'ramp':
          instruction = `Entre na rampa para ${step.name}`;
          break;
        case 'roundabout':
          instruction = `Rotatória - ${step.name}`;
          break;
        case 'roundabout exit':
          instruction = `Saia da rotatória para ${step.name}`;
          break;
        case 'fork':
          instruction = `Fork para ${step.name}`;
          break;
        case 'end of road':
          instruction = `Fim da rua - ${step.name}`;
          break;
        case 'continue':
          instruction = `Continue em frente`;
          break;
        default:
          instruction = `${step.maneuver.type} - ${step.name}`;
      }

      instructions.push(`${instruction} (${distance}km, ${duration}min)`);
    });
  });

  return instructions;
}