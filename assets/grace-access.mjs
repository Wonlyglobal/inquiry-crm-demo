// Public registration is never evidence of enterprise authorization.
// Consume only the server-verified entitlement, never signup user_metadata.
export function graceAccess({authenticated=false,publicAccountActive=false,enterpriseAuthorized=false}={}) {
 if(!authenticated)return Object.freeze({mode:'signed-out',chat:false,enterprise:false});
 if(enterpriseAuthorized===true)return Object.freeze({mode:'enterprise',chat:true,enterprise:true});
 if(publicAccountActive===true)return Object.freeze({mode:'public',chat:true,enterprise:false});
 return Object.freeze({mode:'blocked',chat:false,enterprise:false});
}
export const PUBLIC_ACTIONS=Object.freeze(['chat']);
export function publicActionAllowed(action){return typeof action==='string'&&PUBLIC_ACTIONS.includes(action)}
