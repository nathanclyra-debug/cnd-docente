import {redirect} from "next/navigation";
import {headers} from "next/headers";
import {db,getSession} from "@/lib/server";
import Link from "next/link";
import QRCode from "qrcode";
import PrintButton from "./print-button";

const LOGO_URL = "https://i.ibb.co/s9GYqpPN/Whats-App-Image-2026-09-21-at-13-17-43-1.jpg";

export default async function Cnd(){
  const s=await getSession();
  if(!s)redirect("/login");

  const {data:p}=await db.from("profiles").select("name").eq("id",s.id).single();
  const {data}=await db.from("cnd").select("number,issued_at,status").eq("candidate_id",s.id).maybeSingle();

  let qrDataUrl="";
  if(data){
    const h=await headers();
    const host=h.get("x-forwarded-host")||h.get("host")||"localhost:3000";
    const proto=h.get("x-forwarded-proto")||"https";
    const origin=process.env.NEXT_PUBLIC_SITE_URL||`${proto}://${host}`;
    const verifyUrl=`${origin}/consulta-cnd?number=${encodeURIComponent(data.number)}`;
    qrDataUrl=await QRCode.toDataURL(verifyUrl,{width:220,margin:1,errorCorrectionLevel:"M"});
  }

  return <main className="cndPage">
    <div className="cndActions">
      <Link href="/dashboard" className="btn alt">← Área do docente</Link>
      {data&&<PrintButton/>}
    </div>

    {data?
      <div className="cndCard">
        <div className="cndTop">
          <div className="cndBrand">
            <div className="cndLogoWrap"><img src={LOGO_URL} alt="Universidade Federal do Planalto" className="cndLogo"/></div>
            <div><b>CARTEIRA NACIONAL DO DOCENTE</b><small>EXAME NACIONAL DE PROFICIÊNCIA NA DOCÊNCIA</small></div>
          </div>
          <span className="cndValid">● ATIVA</span>
        </div>

        <div className="cndBody">
          <div className="cndPhoto">
            <div className="cndPhotoMark">{p?.name?.slice(0,1).toUpperCase()}</div>
            <small>DOCUMENTO DIGITAL</small>
          </div>

          <div className="cndInfo">
            <label>NOME DO TITULAR</label>
            <h1>{p?.name}</h1>
            <div className="cndGrid">
              <div><label>NÚMERO DA CND</label><strong>{data.number}</strong></div>
              <div><label>DATA DE EMISSÃO</label><strong>{new Date(data.issued_at).toLocaleDateString("pt-BR")}</strong></div>
              <div><label>STATUS</label><strong>REGULAR E ATIVA</strong></div>
              <div><label>VALIDAÇÃO</label><strong>CONSULTA PÚBLICA</strong></div>
            </div>
          </div>
        </div>

        <div className="cndBottom">
          <div><b>Carteira Nacional do Docente</b><span>Documento digital de identificação profissional docente.</span></div>
          <div className="cndQr">
            <img src={qrDataUrl} alt="QR Code para consulta pública da CND" className="cndQrImage"/>
            <small>APONTE A CÂMERA<br/>PARA VALIDAR</small>
          </div>
        </div>
      </div>
      :
      <div className="card cndEmpty">
        <span className="status warn">CND NÃO EMITIDA</span>
        <h1>Sua carteira ainda não está disponível.</h1>
        <p className="muted">A emissão ocorre após a aprovação no exame e o cumprimento das etapas administrativas.</p>
      </div>
    }

    <p className="cndLegal">A autenticidade da carteira pode ser verificada pela consulta pública do sistema.</p>
  </main>
}
