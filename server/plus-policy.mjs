export const DAY = 86400000;
export const PLANS = Object.freeze([
  {id:'monthly',name:'30 dias',price:59.90,days:30,months:0,recurring:true},
  {id:'quarterly',name:'90 dias',price:159.90,days:90,months:0,recurring:false},
  {id:'semester',name:'Semestral',price:299.90,days:0,months:6,recurring:false},
  {id:'annual',name:'Anual',price:539.90,days:0,months:12,recurring:false}
]);
export function periodEnd(start,plan){
  const date=new Date(start);
  if(!Number.isFinite(date.getTime()))throw new Error('Invalid date');
  if(plan.days)return new Date(date.getTime()+plan.days*DAY).toISOString();
  const day=date.getUTCDate();date.setUTCDate(1);date.setUTCMonth(date.getUTCMonth()+plan.months);
  const last=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).getUTCDate();
  date.setUTCDate(Math.min(day,last));return date.toISOString();
}
export function accessState(profile,paidUntil,now=Date.now()){
  if(Date.parse(paidUntil)>now)return {active:true,kind:'plus',expiresAt:paidUntil};
  const end=profile?.trial_started_at?Date.parse(profile.trial_started_at)+5*DAY:0;
  if(end>now)return {active:true,kind:'trial',expiresAt:new Date(end).toISOString(),daysLeft:Math.ceil((end-now)/DAY)};
  return {active:false,kind:end?'expired':'new',expiresAt:end?new Date(end).toISOString():null};
}
export function matchesPlusPayment(payment,order,collector,live){
  return payment.external_reference===order.id && String(payment.collector_id)===String(collector)
    && payment.currency_id==='BRL' && Math.round(Number(payment.transaction_amount)*100)===Math.round(Number(order.amount)*100)
    && payment.live_mode===live && payment.status==='approved' && Number(payment.transaction_amount_refunded||0)===0
    && Number.isFinite(Date.parse(payment.date_approved));
}
