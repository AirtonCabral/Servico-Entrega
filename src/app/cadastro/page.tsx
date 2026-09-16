"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Valida celular brasileiro: (11) 98765-4321, 11987654321, 11 98765-4321...
function validarCelular(valor: string): boolean {
  const digitos = valor.replace(/\D/g, "");
  return /^[1-9]{2}9?\d{8}$/.test(digitos) && digitos.length >= 10 && digitos.length <= 11;
}

function formatarCelular(valor: string): string {
  const d = valor.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export default function CadastroPage() {
  const router = useRouter();

  const [nome, setNome] = useState("");
  const [celular, setCelular] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!nome.trim()) {
      setError("Informe seu nome completo.");
      return;
    }
    if (!validarCelular(celular)) {
      setError("Celular inválido. Use o formato (11) 98765-4321.");
      return;
    }
    if (password.length < 6) {
      setError("A senha deve ter pelo menos 6 caracteres.");
      return;
    }
    if (password !== confirmPassword) {
      setError("As senhas não conferem.");
      return;
    }

    setLoading(true);

    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          nome: nome.trim(),
          celular: celular.replace(/\D/g, ""),
        },
      },
    });

    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    if (data.session) {
      // Confirmação de e-mail desativada no dashboard: já logado
      router.push("/");
      router.refresh();
      return;
    }

    setSuccess(
      "Cadastro realizado! Enviamos um link de confirmação para o seu e-mail. " +
        "Clique no link para ativar sua conta e depois faça login.",
    );
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-8">
      <div className="card w-full max-w-md">
        <div className="text-center mb-6">
          <div className="w-12 h-12 mx-auto rounded-xl bg-gradient-to-br from-primary-600 to-primary-800 text-white flex items-center justify-center text-2xl font-bold mb-3">
            📦
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Criar conta</h1>
          <p className="text-sm text-gray-500 mt-1">
            Cadastre-se para acessar o Sistema de Entrega
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label-field" htmlFor="nome">
              Nome completo *
            </label>
            <input
              id="nome"
              type="text"
              required
              autoComplete="name"
              className="input-field"
              placeholder="Maria da Silva"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
            />
          </div>

          <div>
            <label className="label-field" htmlFor="celular">
              Celular (WhatsApp) *
            </label>
            <input
              id="celular"
              type="tel"
              required
              inputMode="tel"
              autoComplete="tel"
              className="input-field"
              placeholder="(11) 98765-4321"
              value={celular}
              onChange={(e) => setCelular(formatarCelular(e.target.value))}
            />
            <p className="text-xs text-gray-400 mt-1">
              Obrigatório — usado para contato e identificação.
            </p>
          </div>

          <div>
            <label className="label-field" htmlFor="email">
              E-mail *
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              className="input-field"
              placeholder="voce@exemplo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div>
            <label className="label-field" htmlFor="password">
              Senha *
            </label>
            <input
              id="password"
              type="password"
              required
              autoComplete="new-password"
              className="input-field"
              placeholder="Mínimo 6 caracteres"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <div>
            <label className="label-field" htmlFor="confirmPassword">
              Confirmar senha *
            </label>
            <input
              id="confirmPassword"
              type="password"
              required
              autoComplete="new-password"
              className="input-field"
              placeholder="Repita a senha"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          {success && (
            <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
              {success}
            </div>
          )}

          <button type="submit" className="btn-primary w-full" disabled={loading}>
            {loading ? "Cadastrando..." : "Criar conta"}
          </button>
        </form>

        <p className="mt-6 text-sm text-center text-gray-600">
          Já tem conta?{" "}
          <Link href="/login" className="text-primary-600 hover:underline font-medium">
            Entrar
          </Link>
        </p>
      </div>
    </div>
  );
}