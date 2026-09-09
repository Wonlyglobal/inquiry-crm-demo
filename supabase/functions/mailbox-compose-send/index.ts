import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import nodemailer from "npm:nodemailer@7.0.6";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info","Content-Type":"application/json"};
function envKey(grouped:string,standard:string){const value=Deno.env.get(grouped);if(value){try{return JSON.parse(value).default||""}catch{}}return Deno.env.get(standard)||""}
function clean(value:unknown,max=50000){return String(value||"").trim().slice(0,max)}
function errorText(error:unknown){return error instanceof Error?error.message:String(error||"未知错误")}
function validEmail(value:string){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)}
function emailHtml(value:string){return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#17231f">${value.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\n/g,"<br>")}</div>`}

Deno.serve(async req=>{if(req.method==="OPTIONS")return new Response("ok",{headers:cors});try{
  const authorization=req.headers.get("Authorization")||"",url=Deno.env.get("SUPABASE_URL")||"";
  const userClient=createClient(url,envKey("SUPABASE_PUBLISHABLE_KEYS","SUPABASE_ANON_KEY"),{global:{headers:{Authorization:authorization}}});
  const admin=createClient(url,envKey("SUPABASE_SECRET_KEYS","SUPABASE_SERVICE_ROLE_KEY"),{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:{user},error:userError}=await userClient.auth.getUser();if(userError||!user)throw new Error("未登录");
  const {data:caller,error:callerError}=await userClient.from("profiles").select("id,email,full_name,role,active").eq("id",user.id).single();
  if(callerError||!caller?.active||!["sales","sales_manager","owner"].includes(caller.role))throw new Error("当前账号无权使用个人邮箱发信");
  const input=await req.json(),to=clean(input.to,320).toLowerCase(),subject=clean(input.subject,300),body=clean(input.body),inquiryId=clean(input.inquiry_id,100)||null,inReplyTo=clean(input.in_reply_to,500)||null;
  const cc=clean(input.cc,2000).split(/[,;\s]+/).map((item:string)=>item.toLowerCase()).filter(Boolean);
  if(!validEmail(to)||cc.some((item:string)=>!validEmail(item))||!subject||!body)throw new Error("收件人、主题或正文格式不正确");
  if(inquiryId){const {data:inquiry,error}=await userClient.from("inquiries").select("id,owner_id").eq("id",inquiryId).single();if(error||!inquiry)throw new Error("无权访问关联询盘");if(inquiry.owner_id!==user.id&&!["owner","sales_manager"].includes(caller.role))throw new Error("只能发送本人负责询盘的邮件")}
  const {data:connection,error:connectionError}=await admin.from("mailbox_connections").select("id,email,smtp_host,smtp_port,status").eq("user_id",user.id).eq("mailbox_kind","personal").eq("status","connected").single();
  if(connectionError||!connection)throw new Error("请先连接当前业务员自己的企业邮箱");
  const {data:password,error:secretError}=await admin.rpc("read_mailbox_secret",{target_connection_id:connection.id});if(secretError||!password)throw new Error("邮箱凭据不可用，请重新连接");
  const transport=nodemailer.createTransport({host:connection.smtp_host,port:connection.smtp_port,secure:Number(connection.smtp_port)===465,auth:{user:connection.email,pass:password},connectionTimeout:15000,greetingTimeout:15000,socketTimeout:30000});
  const sent=await transport.sendMail({from:`"${caller.full_name||connection.email}" <${connection.email}>`,to,cc:cc.length?cc:undefined,subject,text:body,html:emailHtml(body),...(inReplyTo?{inReplyTo,references:[inReplyTo]}:{})});
  const sentAt=new Date().toISOString();await admin.from("audit_logs").insert({actor_id:user.id,entity_type:inquiryId?"inquiry":"profile",entity_id:inquiryId||user.id,action:"mailbox_message_sent",after_data:{recipient:to,cc,subject,message_id:sent.messageId||null,inquiry_id:inquiryId},reason:"业务员从 CRM 邮箱页面发送邮件"});
  return new Response(JSON.stringify({sent:true,recipient:to,message_id:sent.messageId||null,sent_at:sentAt}),{headers:cors});
}catch(error){return new Response(JSON.stringify({error:errorText(error)}),{status:400,headers:cors})}});
