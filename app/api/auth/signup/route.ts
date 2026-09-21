import { db, hashPin, validPin, setSession } from "@/lib/server";
import { fail, json } from "@/lib/api";

async function withTimeout<T>(promise: Promise<T>, ms = 10000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("SUPABASE_TIMEOUT")), ms)
    ),
  ]);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const pin = typeof body?.pin === "string" ? body.pin : "";

    if (!name || !validPin(pin)) {
      return fail("Nome e PIN de 4 dígitos são obrigatórios.");
    }

    const nameKey = name.toLocaleLowerCase("pt-BR");

    let lookup;
    try {
      lookup = await withTimeout(
        db.from("profiles").select("id").eq("name_key", nameKey).maybeSingle()
      );
    } catch (error) {
      console.error("signup lookup error:", error);
      return fail(
        error instanceof Error && error.message === "SUPABASE_TIMEOUT"
          ? "O Supabase não respondeu. Verifique a URL e a Service Role Key no Netlify."
          : "Não foi possível conectar ao banco de dados. Verifique as variáveis do Supabase no Netlify.",
        503
      );
    }

    const { data: old, error: lookupError } = lookup;

    if (lookupError) {
      console.error("signup lookup error:", lookupError);
      return fail("O Supabase recusou a consulta: " + lookupError.message, 500);
    }

    if (old) {
      return fail("Já existe um cadastro com este nome.", 409);
    }

    const pinHash = await hashPin(pin);

    let inserted;
    try {
      inserted = await withTimeout(
        db
          .from("profiles")
          .insert({
            name,
            name_key: nameKey,
            pin_hash: pinHash,
            role: "candidate",
            status: "pending",
          })
          .select("id,name,status,role")
          .single()
      );
    } catch (error) {
      console.error("signup insert error:", error);
      return fail(
        error instanceof Error && error.message === "SUPABASE_TIMEOUT"
          ? "O Supabase não respondeu ao criar o cadastro."
          : "Não foi possível criar o cadastro no banco de dados.",
        503
      );
    }

    const { data, error } = inserted;

    if (error || !data) {
      console.error("signup insert error:", error);
      return fail(error?.message || "Não foi possível criar o cadastro.", 500);
    }

    try {
      await setSession({
        id: data.id,
        name: data.name,
        role: "candidate",
        status: data.status,
      });
    } catch (error) {
      console.error("signup session error:", error);
      return fail(
        "Cadastro criado, mas não foi possível iniciar a sessão. Verifique SESSION_SECRET no Netlify.",
        500
      );
    }

    return json({ ok: true });
  } catch (error) {
    console.error("signup unexpected error:", error);
    return fail("Erro interno ao criar cadastro.", 500);
  }
}
