"use client";
import {useEffect,useState} from "react";

export default function Consulta(){
  const[number,setNumber]=useState("");
  const[result,setResult]=useState<any>(null);
  const[error,setError]=useState("");
  const[loading,setLoading]=useState(false);

  async function verify(value=number){
    const clean=value.trim().toUpperCase();
    if(!clean){setError("Informe o número da CND.");return}
    setNumber(clean);
    setError("");
    setResult(null);
    setLoading(true);
    try{
      const r=await fetch("/api/cnd/verify?number="+encodeURIComponent(clean));
      const j=await r.json();
      if(!r.ok){setError(j.error||"CND não encontrada.");return}
      setResult(j);
    }catch{
      setError("Não foi possível realizar a consulta.");
    }finally{
      setLoading(false);
    }
  }

  useEffect(()=>{
    const value=new URLSearchParams(window.location.search).get("number");
    if(value) verify(value);
  },[]);

  return <main className="wrap">
    <div className="card">
      <span className="status">CONSULTA PÚBLICA</span>
      <h1>Consultar CND</h1>
      <p className="muted">Verifique a autenticidade e o status de uma Carteira Nacional do Docente.</p>
      <div className="actions">
        <input className="input" placeholder="CND-2026-AB12CD34" value={number} onChange={e=>setNumber(e.target.value.toUpperCase())}/>
        <button className="btn" onClick={()=>verify()} disabled={loading}>{loading?"Consultando...":"Consultar"}</button>
      </div>
      {error&&<p className="status danger" style={{marginTop:16}}>{error}</p>}
      {result&&<div className="question" style={{marginTop:18}}>
        <span className="status ok">CND VÁLIDA</span>
        <h2>{result.holder}</h2>
        <p>Número: <b>{result.number}</b></p>
        <p>Emissão: {new Date(result.issuedAt).toLocaleDateString("pt-BR")}</p>
        <p>Status: <b>{result.status}</b></p>
      </div>}
    </div>
  </main>
}
