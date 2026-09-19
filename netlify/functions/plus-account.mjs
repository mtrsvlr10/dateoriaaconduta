import {profileInput} from '../../server/plus-profile.mjs';
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
    if(input.action!=='activate')fail(400,'Ação inválida.');
    if(!i.user.email_confirmed_at)fail(403,'Confirme seu e-mail antes de salvar o cadastro.');
    const profile=profileInput(input);
    checked(await admin().rpc('plus_save_profile',{uid:i.user.id,full_name:profile.name,profile_role:profile.role,crm_number:profile.crm,state_uf:profile.uf}));
    if(clinicalReady())checked(await admin().rpc('plus_start_trial',{uid:i.user.id}));
  }
  const account=await plusAccess(i.user);
  return response(200,{...config,user:{email:i.user.email},profile:account.profile,access:account.access,subscription:account.subscription?{status:account.subscription.status}:null},i.cookies);
});
