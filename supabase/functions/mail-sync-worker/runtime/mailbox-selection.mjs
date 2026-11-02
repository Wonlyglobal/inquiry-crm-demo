// Caller identity is checked by each endpoint. Never use an unscoped mailbox ID.
export async function selectPersonalMailbox(db, userId, requestedId = "") {
  let query=db.from("mailbox_connections").select("id,email,smtp_host,smtp_port,status").eq("user_id",userId).eq("mailbox_kind","personal").eq("status","connected");
  if(requestedId)query=query.eq("id",requestedId);
  const {data,error}=await query.order("created_at").limit(2);
  if(error)throw error;
  if(!data?.length)throw new Error("所选个人邮箱不可用，请检查连接状态");
  if(data.length!==1)throw new Error("已连接多个邮箱，请选择发件邮箱");
  return data[0];
}
