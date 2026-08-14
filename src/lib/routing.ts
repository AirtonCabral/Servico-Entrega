// Biblioteca simples para cálculo de rotas de entrega
// Pode ser expandida com integração real de APIs de mapas (Google Maps, Mapbox, etc.)

export interface DeliveryPoint {
  id: string;
  destinatario: string;
  endereco: string;
  bairro: string;
  municipio: string;
  uf: string;
  cep: string;
  lat?: number;
  lng?: number;
}

export interface RouteSegment {
  from: DeliveryPoint;
  to: DeliveryPoint;
  distance: number; // em km
  duration: number; // em minutos
}

export interface OptimizedRoute {
  points: DeliveryPoint[];
  segments: RouteSegment[];
  totalDistance: number;
  totalDuration: number;
}

/**
 * Simula o cálculo de distância entre dois pontos
 * Em produção, isso usaria uma API real de geocoding e routing
 */
function calculateDistance(point1: DeliveryPoint, point2: DeliveryPoint): number {
  // Simulação: baseada na diferença de bairros e endereços
  if (point1.bairro === point2.bairro) {
    return 1 + Math.random() * 2; // 1-3 km se mesmo bairro
  }
  if (point1.municipio === point2.municipio) {
    return 3 + Math.random() * 7; // 3-10 km se mesma cidade
  }
  return 10 + Math.random() * 20; // 10-30 km se cidades diferentes
}

/**
 * Simula o tempo de viagem baseado na distância
 */
function calculateDuration(distance: number): number {
  // Assume velocidade média de 30km/h em zona urbana
  return Math.round((distance / 30) * 60);
}

/**
 * Algoritmo simples de otimização de rota (Nearest Neighbor)
 * Encontra a rota mais eficiente visitando sempre o ponto mais próximo
 */
export function optimizeRoute(points: DeliveryPoint[]): OptimizedRoute {
  if (points.length === 0) {
    return {
      points: [],
      segments: [],
      totalDistance: 0,
      totalDuration: 0,
    };
  }

  if (points.length === 1) {
    return {
      points: [points[0]],
      segments: [],
      totalDistance: 0,
      totalDuration: 0,
    };
  }

  // Começa do primeiro ponto
  const unvisited = [...points.slice(1)];
  const route: DeliveryPoint[] = [points[0]];
  const segments: RouteSegment[] = [];
  let totalDistance = 0;
  let totalDuration = 0;

  let currentPoint = points[0];

  while (unvisited.length > 0) {
    // Encontra o ponto mais próximo
    let nearestIndex = 0;
    let nearestDistance = Infinity;

    unvisited.forEach((point, index) => {
      const distance = calculateDistance(currentPoint, point);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });

    const nextPoint = unvisited[nearestIndex];
    const duration = calculateDuration(nearestDistance);

    segments.push({
      from: currentPoint,
      to: nextPoint,
      distance: nearestDistance,
      duration,
    });

    totalDistance += nearestDistance;
    totalDuration += duration;

    route.push(nextPoint);
    currentPoint = nextPoint;
    unvisited.splice(nearestIndex, 1);
  }

  return {
    points: route,
    segments,
    totalDistance: Math.round(totalDistance * 10) / 10,
    totalDuration: Math.round(totalDuration),
  };
}

/**
 * Agrupa entregas por bairro para otimização
 */
export function groupByBairro(points: DeliveryPoint[]): Map<string, DeliveryPoint[]> {
  const groups = new Map<string, DeliveryPoint[]>();

  points.forEach(point => {
    const bairro = point.bairro || "Sem bairro";
    if (!groups.has(bairro)) {
      groups.set(bairro, []);
    }
    groups.get(bairro)!.push(point);
  });

  return groups;
}

/**
 * Calcula estatísticas da rota
 */
export function calculateRouteStats(route: OptimizedRoute) {
  const bairros = new Set(route.points.map(p => p.bairro));
  const cidades = new Set(route.points.map(p => p.municipio));

  return {
    totalEntregas: route.points.length,
    totalBairros: bairros.size,
    totalCidades: cidades.size,
    distanciaTotal: route.totalDistance,
    tempoEstimado: route.totalDuration,
    mediaPorEntrega: route.points.length > 0 
      ? Math.round(route.totalDuration / route.points.length) 
      : 0,
  };
}
