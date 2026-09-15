"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function RecuperarSenhaPage() {
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/redefinir-senha`,
    });

    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    setSent(true);
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <div className="card w-full max-w-md">
        <div className="text-center mb-6">
          <div className="w-12 h-12 mx-auto rounded-xl bg-gradient-to-br from-primary-600 to-primary-800 text-white flex items-center justify-center text-2xl font-bold mb-3">
            🔑
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Recuperar senha</h1>
          <p className="text-sm text-gray-500 mt-1">
            Enviaremos um link de redefinição para o seu e-mail
          </p>
        </div>

        {sent ? (
          <div className="text-center space-y-4">
            <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-3">
              ✅ Link enviado para <strong>{email}</strong>.
              <br />
              Verifique sua caixa de entrada (e o spam) e clique no link para
              definir uma nova senha.
            </div>
            <Link href="/login" className="btn-secondary w-full inline-flex justify-center">
              Voltar para o login
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label-field" htmlFor="email">
                E-mail cadastrado
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

            {error && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {error}
              </div>
            )}

            <button type="submit" className="btn-primary w-full" disabled={loading}>
              {loading ? "Enviando..." : "Enviar link de recuperação"}
            </button>

            <p className="text-sm text-center text-gray-600">
              <Link href="/login" className="text-primary-600 hover:underline font-medium">
                Voltar para o login
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}