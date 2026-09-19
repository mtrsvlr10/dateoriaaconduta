import {admin,checked,mp,fail} from './common.mjs';
import {PLANS,accessState,periodEnd,matchesPlusPayment} from './plus-policy.mjs';
export const clinicalReady=()=>process.env.PLUS_CLINICAL_ENABLED==='true'&&Boolean(process.env.OPENAI_API_KEY&&process.env.OPENAI_MODEL);
export const billingReady=()=>clinicalReady()&&process.env.PLUS_BILLING_ENABLED==='true'&&Boolean(process.env.MERCADO_PAGO_ACCESS_TOKEN&&process.env.MERCADO_PAGO_COLLECTOR_ID);
export async function plusAccess(user){
  const db=admin();
  const profile=checked(await db.from('plus_profiles').select('*').eq('user_id',user.id).maybeSingle());
  const orders=checked(await db.from('plus_orders').select('*').eq('user_id',user.id).order('created_at',{ascending:false}).limit(30));
  let paidUntil=null;
  for(const order of orders){
    const plan=PLANS.find(p=>p.id===order.plan_id);
    if(!order.provider_id)continue;
    let payments=[];
    if(plan.recurring){
      const subscription=await mp('/preapproval/'+encodeURIComponent(order.provider_id));
      if(subscription.external_reference!==order.id||String(subscription.collector_id)!==String(process.env.MERCADO_PAGO_COLLECTOR_ID))fail(502,'Assinatura não corresponde à conta.');
      order.status=subscription.status;
      checked(await db.from('plus_orders').update({status:order.status}).eq('id',order.id));
      const invoices=await mp('/authorized_payments/search?preapproval_id='+encodeURIComponent(order.provider_id)+'&limit=100');
      for(const invoice of invoices.results||[]){
        if(invoice.preapproval_id===order.provider_id&&invoice.payment?.id&&Date.parse(invoice.debit_date)>Date.now()-32*86400000){
          payments.push(await mp('/v1/payments/'+encodeURIComponent(invoice.payment.id)));
        }
      }
    }else{
      const result=await mp('/v1/payments/search?external_reference='+encodeURIComponent(order.id)+'&sort=date_created&criteria=desc&limit=20');
      payments=result.results||[];
    }
    for(const payment of payments){
      if(!matchesPlusPayment(payment,order,process.env.MERCADO_PAGO_COLLECTOR_ID,process.env.MERCADO_PAGO_MODE==='production'))continue;
      const end=periodEnd(payment.date_approved,plan);
      if(!paidUntil||Date.parse(end)>Date.parse(paidUntil))paidUntil=end;
      if(!plan.recurring)checked(await db.from('plus_orders').update({status:'paid'}).eq('id',order.id));
    }
  }
  return {profile,access:accessState(profile,paidUntil),subscription:orders.find(o=>o.plan_id==='monthly'&&['authorized','paused','pending'].includes(o.status)&&o.provider_id)||null};
}
