"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Cadastro() {
  const [r, setR] = useState({ name: "", pin: "", confirm: "" });
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;

    setErr("");

    if (!r.name.trim()) {
      setErr("Informe seu nome completo.");
      return;
    }

    if (!/^\d{4}$/.test(r.pin) || r.pin !== r.confirm) {
      setErr("O PIN deve ter exatamente 4 números e as confirmações devem coincidir.");
      return;
    }

    setLoading(true);

    try {
      const x = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: r.name.trim(), pin: r.pin }),
      });

      const text = await x.text();
      let j: { error?: string } = {};

      try {
        j = text ? JSON.parse(text) : {};
      } catch {
        j = {};
      }

      if (!x.ok) {
        setErr(j.error || `Não foi possível criar o cadastro (erro ${x.status}).`);
        return;
      }

      router.push("/documentos");
      router.refresh();
    } catch {
      setErr("Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="wrap" style={{ maxWidth: 650 }}>
      <div className="card">
        <h1>Cadastro docente</h1>
        <p className="muted">
          Informe seu nome completo e crie seu PIN numérico de 4 dígitos.
        </p>

        <form onSubmit={submit}>
          <label className="label">Nome completo</label>
          <input
            className="input"
            value={r.name}
            onChange={(e) => setR({ ...r, name: e.target.value })}
            required
            autoComplete="name"
          />

          <label className="label">PIN</label>
          <input
            className="input"
            inputMode="numeric"
            maxLength={4}
            value={r.pin}
            onChange={(e) =>
              setR({ ...r, pin: e.target.value.replace(/\D/g, "").slice(0, 4) })
            }
            required
            autoComplete="new-password"
          />

          <label className="label">Confirmar PIN</label>
          <input
            className="input"
            inputMode="numeric"
            maxLength={4}
            value={r.confirm}
            onChange={(e) =>
              setR({ ...r, confirm: e.target.value.replace(/\D/g, "").slice(0, 4) })
            }
            required
            autoComplete="new-password"
          />

          {err && <p className="danger status">{err}</p>}

          <div style={{ marginTop: 20 }}>
            <button className="btn" type="submit" disabled={loading}>
              {loading ? "Criando cadastro..." : "Criar cadastro"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
