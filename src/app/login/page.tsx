"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LockKeyhole, Loader2, ShieldCheck } from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase/browser";

export default function LoginQA() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function entrar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(""); setPending(true);
    try {
      const supabase = getSupabaseBrowser();
      const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError || !data.session) throw new Error(signInError?.message || "Não foi possível iniciar a sessão.");
      const response = await fetch("/api/qa/consultar?tipo=comparacoes&limit=1", {
        headers: { Authorization: `Bearer ${data.session.access_token}` }, cache: "no-store",
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        await supabase.auth.signOut();
        throw new Error(result.error || "Usuário sem autorização para esta área.");
      }
      router.push("/comparacoes");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha no login.");
    } finally { setPending(false); }
  }

  return <main className="mx-auto max-w-md space-y-5 py-8 text-slate-900">
    <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
      <div className="mb-5 inline-flex rounded-xl bg-blue-50 p-3 text-blue-600"><LockKeyhole size={26}/></div>
      <p className="text-xs font-bold tracking-wide text-blue-600">PRECIFICA QA</p>
      <h1 className="mt-1 text-2xl font-bold">Acesso às comparações</h1>
      <p className="mt-2 text-sm text-slate-500">Entre com um usuário autorizado do Supabase Auth. Não há cadastro público.</p>
      <form className="mt-6 space-y-4" onSubmit={entrar}>
        <label className="block text-sm font-medium">E-mail
          <input required type="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-3 outline-none focus:border-blue-500"/>
        </label>
        <label className="block text-sm font-medium">Senha
          <input required type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-3 outline-none focus:border-blue-500"/>
        </label>
        {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
        <button disabled={pending} className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white disabled:opacity-50">
          {pending ? <Loader2 size={18} className="animate-spin"/> : <ShieldCheck size={18}/>} {pending ? "Validando..." : "Entrar"}
        </button>
      </form>
      <Link href="/dashboard" className="mt-5 block text-center text-sm text-slate-500 hover:underline">Voltar ao painel</Link>
    </div>
  </main>;
}
