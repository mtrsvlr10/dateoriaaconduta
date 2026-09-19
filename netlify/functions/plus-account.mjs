import {wrap,response,ready,body,identity,admin,checked,fail} from '../../server/common.mjs';
import {PLANS} from '../../server/plus-policy.mjs';
import {plusAccess,clinicalReady,billingReady} from '../../server/plus.mjs';
export const handler=wrap(async event=>{
  if(!['GET','POST'].includes(event.httpMethod))fail(405,'Método não permitido.');
  const config={plans:PLANS,authReady:ready(),clinicalReady:clinicalReady(),billingReady:billingReady()};
  if(!ready())return response(200,{...config,user:null});
  let i;
  try{i=await identity(event)}catch(e){if(e.status===401&&event.httpMethod==='GET')return response(200,{...config,user:null});throw e}
  if(event.httpMethod==='POST'){
    const input=body(event);
    if(input.action!=='activate'||input.professional!==true)fail(400,'Confirme que você é médico.');
    if(!i.user.email_confirmed_at)fail(403,'Confirme seu e-mail antes de ativar o teste.');
    if(typeof input.name!=='string'||input.name.trim().length<3||input.name.length>100||!/^\d{1,8}$/.test(input.crm||'')||!['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'].includes(input.uf))fail(400,'Confira o nome, CRM e estado.');
    checked(await admin().from('plus_profiles').upsert({user_id:i.user.id,name:input.name.trim(),crm:input.crm,uf:input.uf},{onConflict:'user_id',ignoreDuplicates:true}));
    if(clinicalReady())checked(await admin().rpc('plus_start_trial',{uid:i.user.id}));
  }
  const account=await plusAccess(i.user);
  return response(200,{...config,user:{email:i.user.email},profile:account.profile,access:account.access,subscription:account.subscription?{status:account.subscription.status}:null},i.cookies);
});
