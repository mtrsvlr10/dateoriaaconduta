import {eligibleProfile} from '../../server/plus-profile.mjs';
import {randomUUID} from 'node:crypto';
import {wrap,response,body,identity,admin,checked,fail,mp} from '../../server/common.mjs';
import {PLANS} from '../../server/plus-policy.mjs';
import {plusAccess,billingReady} from '../../server/plus.mjs';
export const handler=wrap(async event=>{
  const i=await identity(event),input=body(event),db=admin();
  const current=await plusAccess(i.user);
  if(input.action==='cancel'){
    if(!current.subscription)fail(400,'Você não possui renovação ativa.');
    await mp('/preapproval/'+encodeURIComponent(current.subscription.provider_id),{method:'PUT',body:JSON.stringify({status:'cancelled'})});
    checked(await db.from('plus_orders').update({status:'cancelled'}).eq('id',current.subscription.id));
    return response(200,{message:'Renovação cancelada. O período já pago permanece disponível.'},i.cookies);
  }
  if(!billingReady())fail(503,'Os planos estão em pré-lançamento. Nenhuma cobrança está habilitada.');
  if(!eligibleProfile(current.profile))fail(403,'Aguarde a verificação do seu cadastro profissional.');
  if(current.access.kind==='plus'||current.subscription?.status==='authorized')fail(409,'Você já possui um plano ativo.');
  const plan=PLANS.find(p=>p.id===input.planId);if(!plan)fail(400,'Plano inválido.');
  const previous=checked(await db.from('plus_orders').select('*').eq('user_id',i.user.id).in('status',['pending','authorized']).maybeSingle());
  if(previous){
    if(previous.plan_id===plan.id&&previous.checkout_url)return response(200,{url:previous.checkout_url},i.cookies);
    fail(409,'Existe uma contratação em andamento. Finalize ou solicite o cancelamento antes de trocar de plano.');
  }
  const id=randomUUID();
  checked(await db.from('plus_orders').insert({id,user_id:i.user.id,plan_id:plan.id,amount:plan.price}));
  const origin=new URL(process.env.SITE_URL).origin;
  const payload=plan.recurring?{
    reason:'Da Teoria à Conduta Plus — 30 dias',external_reference:id,payer_email:i.user.email,
    auto_recurring:{frequency:30,frequency_type:'days',transaction_amount:plan.price,currency_id:'BRL'},
    back_url:origin+'/plus.html?pagamento=retorno',status:'pending'
  }:{items:[{id:plan.id,title:'Da Teoria à Conduta Plus — '+plan.name,quantity:1,currency_id:'BRL',unit_price:plan.price}],payer:{email:i.user.email},external_reference:id,back_urls:{success:origin+'/plus.html?pagamento=retorno',pending:origin+'/plus.html?pagamento=retorno',failure:origin+'/plus.html?pagamento=falha'},auto_return:'approved'};
  // Keep pending orders on uncertain provider failures: never blindly retry a charge creation.
  const result=await mp(plan.recurring?'/preapproval':'/checkout/preferences',{method:'POST',headers:{'X-Idempotency-Key':id},body:JSON.stringify(payload)});
  const url=plan.recurring||process.env.MERCADO_PAGO_MODE==='production'?result.init_point:result.sandbox_init_point;
  if(!url||new URL(url).protocol!=='https:'||!new URL(url).hostname.endsWith('.mercadopago.com.br'))fail(502,'Não foi possível abrir o pagamento.');
  checked(await db.from('plus_orders').update({provider_id:String(result.id),checkout_url:url}).eq('id',id));
  return response(200,{url},i.cookies);
});
