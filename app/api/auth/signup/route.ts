import { db, hashPin, validPin, setSession, audit } from "@/lib/server";
import { fail, json } from "@/lib/api";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const pin = typeof body?.pin === "string" ? body.pin : "";

    if (!name || !validPin(pin)) {
      return fail("Nome e PIN de 4 dígitos são obrigatórios.");
    }

    const nameKey = name.toLocaleLowerCase("pt-BR");

    const { data: old, error: lookupError } = await db
      .from("profiles")
      .select("id")
      .eq("name_key", nameKey)
      .maybeSingle();

    if (lookupError) {
      console.error("signup lookup error:", lookupError);
      return fail("Não foi possível consultar o banco de dados. Verifique as variáveis do Supabase no Netlify.", 500);
    }

    if (old) {
      return fail("Já existe um cadastro com este nome.", 409);
    }

    const pinHash = await hashPin(pin);

    const { data, error } = await db
      .from("profiles")
      .insert({
        name,
        name_key: nameKey,
        pin_hash: pinHash,
        role: "candidate",
        status: "pending",
      })
      .select("id,name,status,role")
      .single();

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
      return fail("Cadastro criado, mas não foi possível iniciar a sessão. Verifique SESSION_SECRET no Netlify.", 500);
    }

    try {
      await audit(data.id, "signup", "profile", data.id);
    } catch (error) {
      console.error("signup audit error:", error);
    }

    return json({ ok: true });
  } catch (error) {
    console.error("signup unexpected error:", error);
    return fail("Erro interno ao criar cadastro. Verifique os logs do Netlify.", 500);
  }
}
