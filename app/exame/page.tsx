import { redirect } from "next/navigation";
import { db, getSession } from "@/lib/server";
import Link from "next/link";

export default async function Exames() {
  const s = await getSession();

  if (!s) {
    redirect("/login");
  }

  if (s.role !== "candidate") {
    redirect("/admin");
  }

  const { data: p } = await db
    .from("profiles")
    .select("status")
    .eq("id", s.id)
    .single();

  if (p?.status !== "eligible") {
    return (
      <main className="wrap">
        <div className="card">
          <h1>Exames</h1>
          <p className="muted">
            Seu cadastro ainda está em análise. O acesso à prova será liberado
            após a habilitação administrativa.
          </p>
          <Link className="btn" href="/dashboard">
            Voltar
          </Link>
        </div>
      </main>
    );
  }

  const { data: exams } = await db
    .from("exams")
    .select("id,title,description,status,time_limit_minutes")
    .eq("status", "open")
    .order("created_at", { ascending: false });

  return (
    <main className="wrap">
      <div className="card">
        <h1>Exames disponíveis</h1>
        <p className="muted">
          Somente provas abertas e para as quais você esteja habilitado aparecem
          aqui.
        </p>

        {!exams?.length && (
          <p className="status">Nenhum exame disponível no momento.</p>
        )}

        {exams?.map((e: any) => (
          <div className="question" key={e.id}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <div>
                <h2>{e.title}</h2>
                <p className="muted">
                  {e.description ||
                    "Exame Nacional de Proficiência na Docência."}
                </p>
                {e.time_limit_minutes && (
                  <small>Tempo: {e.time_limit_minutes} minutos</small>
                )}
              </div>

              <Link className="btn" href={"/exame/" + e.id}>
                Iniciar
              </Link>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
