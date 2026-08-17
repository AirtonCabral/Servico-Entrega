"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { NfeHistoryEntry } from "@/lib/storage";
import { optimizeRoute, calculateRouteStats, type DeliveryPoint } from "@/lib/routing";
import dynamic from "next/dynamic";

// Dynamically import the map component to avoid SSR issues
const DeliveryMap = dynamic(() => import("@/components/DeliveryMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full min-h-[400px] rounded-lg bg-gray-100 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto mb-2"></div>
        <p className="text-sm text-gray-600">Carregando mapa...</p>
      </div>
    </div>
  ),
});

export default function EntregaPage() {
  const [deliveryPoints, setDeliveryPoints] = useState<DeliveryPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [optimizedRoute, setOptimizedRoute] = useState<DeliveryPoint[]>([]);
  const [routeStats, setRouteStats] = useState<any>(null);

  const clearDeliveryItems = () => {
    if (confirm("Deseja limpar todos os itens de entrega?")) {
      localStorage.removeItem("delivery:items");
      sessionStorage.removeItem("entrega:selected");
      setDeliveryPoints([]);
      setOptimizedRoute([]);
      setRouteStats(null);
    }
  };

  useEffect(() => {
    loadSelectedNfes();
  }, []);

  const loadSelectedNfes = () => {
    try {
      // Try localStorage first (new approach)
      const deliveryItemsRaw = localStorage.getItem("delivery:items");
      if (deliveryItemsRaw) {
        const deliveryItems = JSON.parse(deliveryItemsRaw);
        
        const points: DeliveryPoint[] = deliveryItems.map((item: any) => ({
          id: item.id,
          destinatario: item.data.destinatario.nome,
          endereco: item.data.destinatario.endereco,
          bairro: item.data.destinatario.bairro || "Sem bairro",
          municipio: item.data.destinatario.municipio,
          uf: item.data.destinatario.uf,
          cep: item.data.destinatario.cep,
        }));

        setDeliveryPoints(points);
        calculateOptimizedRoute(points);
        setLoading(false);
        return;
      }

      // Fallback to sessionStorage (old approach)
      const raw = sessionStorage.getItem("entrega:selected");
      if (!raw) {
        setLoading(false);
        return;
      }

      const selectedNfes: NfeHistoryEntry[] = JSON.parse(raw);
      
      const points: DeliveryPoint[] = selectedNfes.map((item) => ({
        id: item.id,
        destinatario: item.data.destinatario.nome,
        endereco: item.data.destinatario.endereco,
        bairro: "bairro" in item.data.destinatario ? item.data.destinatario.bairro || "Sem bairro" : "Sem bairro",
        municipio: item.data.destinatario.municipio,
        uf: item.data.destinatario.uf,
        cep: item.data.destinatario.cep,
      }));

      setDeliveryPoints(points);
      calculateOptimizedRoute(points);
    } catch (error) {
      console.error("Erro ao carregar NF-es selecionadas:", error);
    } finally {
      setLoading(false);
    }
  };

  const calculateOptimizedRoute = (points: DeliveryPoint[]) => {
    const route = optimizeRoute(points);
    const stats = calculateRouteStats(route);
    
    // Adicionar ordem sequencial aos pontos
    const orderedPoints = route.points.map((point, index) => ({
      ...point,
      order: index + 1,
    }));

    setOptimizedRoute(orderedPoints);
    setRouteStats(stats);
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-16 text-center">
        <p className="text-gray-500">Carregando rotas de entrega...</p>
      </div>
    );
  }

  if (deliveryPoints.length === 0) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center">
        <div className="card">
          <div className="w-16 h-16 rounded-full bg-amber-50 text-amber-600 grid place-items-center text-2xl mx-auto mb-4">
            📦
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">
            Nenhuma NF-e selecionada
          </h2>
          <p className="text-sm text-gray-600 mb-6">
            Volte para a lista de NF-es e selecione as notas fiscais que deseja
            incluir na rota de entrega.
          </p>
          <Link href="/nfes" className="btn-primary">
            Selecionar NF-es
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
      <div className="mb-6 sm:mb-8">
        <div className="mt-4 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">
              Rota de Entrega
            </h1>
            <p className="mt-2 text-sm text-gray-600 max-w-2xl">
              {routeStats && (
                <>
                  Rota otimizada para {routeStats.totalEntregas} entrega(s) em{" "}
                  {routeStats.totalBairros} bairro(s).{" "}
                  {routeStats.distanciaTotal > 0 && (
                    <>
                      Distância total: {routeStats.distanciaTotal} km · Tempo
                      estimado: {routeStats.tempoEstimado} minutos
                    </>
                  )}
                </>
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 self-start">
            <button
              onClick={() => optimizeRoute(deliveryPoints)}
              className="btn-secondary"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                className="w-4 h-4"
              >
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              Otimizar Rota
            </button>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Mapa real com Leaflet */}
        <div className="lg:col-span-2">
          <div className="card h-96 relative">
            <div className="absolute top-3 left-3 z-10 bg-white/90 backdrop-blur-sm rounded-lg px-3 py-2 shadow-md">
              <div className="flex items-center gap-2 text-xs text-gray-600">
                <span className="w-2 h-2 rounded-full bg-green-500"></span>
                {deliveryPoints.length} pontos de entrega
              </div>
            </div>
            <DeliveryMap 
              deliveryPoints={deliveryPoints} 
              optimizedRoute={optimizedRoute} 
            />
          </div>
        </div>

        {/* Lista de entregas */}
        <div className="space-y-4">
          <div className="card">
            <h3 className="font-semibold text-gray-900 mb-4">
              Ordem de Entrega
            </h3>
            <div className="space-y-3">
              {optimizedRoute.map((point, index) => (
                <div
                  key={point.id}
                  className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition"
                >
                  <div className="w-8 h-8 rounded-full bg-primary-600 text-white flex items-center justify-center text-sm font-bold flex-shrink-0">
                    {index + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 text-sm truncate">
                      {point.destinatario}
                    </p>
                    <p className="text-xs text-gray-600 truncate">
                      {point.endereco}
                    </p>
                    <p className="text-xs text-gray-500">
                      {point.bairro} · {point.municipio} - {point.uf}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <h3 className="font-semibold text-gray-900 mb-3">
              Resumo da Entrega
            </h3>
            {routeStats && (
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Total de entregas:</span>
                  <span className="font-medium text-gray-900">
                    {routeStats.totalEntregas}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Bairros:</span>
                  <span className="font-medium text-gray-900">
                    {routeStats.totalBairros}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Distância total:</span>
                  <span className="font-medium text-gray-900">
                    {routeStats.distanciaTotal} km
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Tempo estimado:</span>
                  <span className="font-medium text-gray-900">
                    {routeStats.tempoEstimado} min
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Média por entrega:</span>
                  <span className="font-medium text-gray-900">
                    {routeStats.mediaPorEntrega} min
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Cidade:</span>
                  <span className="font-medium text-gray-900">
                    {deliveryPoints[0]?.municipio} - {deliveryPoints[0]?.uf}
                  </span>
                </div>
              </div>
            )}
          </div>

          <button
            onClick={clearDeliveryItems}
            className="block w-full text-center btn-secondary !text-red-600 !border-red-200 hover:!bg-red-50"
          >
            Limpar Todas Entregas
          </button>
        </div>
      </div>
    </div>
  );
}
