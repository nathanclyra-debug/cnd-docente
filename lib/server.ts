import {createClient} from "@supabase/supabase-js";import {cookies} from "next/headers";import {SignJWT,jwtVerify} from "jose";import bcrypt from "bcryptjs";
export const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{autoRefreshToken:false,persistSession:false}});
const key=new TextEncoder().encode(process.env.SESSION_SECRET!);
export type Session={id:string;name:string;role:"candidate"|"admin";status:string};
export const validPin=(p:string)=>/^\d{4}$/.test(p);
export const hashPin=(p:string)=>bcrypt.hash(p,12);
export const checkPin=(p:string,h:string)=>bcrypt.compare(p,h);
export async function setSession(s:Session){const t=await new SignJWT(s).setProtectedHeader({alg:"HS256"}).setIssuedAt().setExpirationTime("7d").sign(key);(await cookies()).set("cnd_session",t,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/",maxAge:604800});}
export async function getSession():Promise<Session|null>{try{const t=(await cookies()).get("cnd_session")?.value;if(!t)return null;const {payload}=await jwtVerify(t,key);return payload as unknown as Session}catch{return null}}
export async function requireSession(role?:Session["role"]){const s=await getSession();if(!s)throw new Error("UNAUTHORIZED");if(role&&s.role!==role)throw new Error("FORBIDDEN");return s}
export async function clearSession(){(await cookies()).delete("cnd_session")}
export async function audit(actor:string,action:string,targetType?:string,targetId?:string,metadata?:unknown){await db.from("audit_logs").insert({actor_id:actor,action,target_type:targetType??null,target_id:targetId??null,metadata:metadata??{}})}