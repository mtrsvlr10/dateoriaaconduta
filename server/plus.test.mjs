import test from 'node:test';
import assert from 'node:assert/strict';
import {PLANS,DAY,periodEnd,accessState,matchesPlusPayment} from './plus-policy.mjs';
import {clinicalInput,validateClinicalOutput} from './clinical.mjs';
import {handler as analyze} from '../netlify/functions/plus-analyze.mjs';
import {handler as checkout} from '../netlify/functions/plus-checkout.mjs';
import {handler as account} from '../netlify/functions/plus-account.mjs';
test('trial ends exactly at five days and never restarts after expiry',()=>{
  const start=Date.parse('2026-01-01T10:00:00Z'),profile={trial_started_at:new Date(start).toISOString()};
  assert.equal(accessState(profile,null,start+5*DAY-1).active,true);
  assert.equal(accessState(profile,null,start+5*DAY).kind,'expired');
  assert.equal(accessState(profile,null,start+90*DAY).active,false);
  assert.equal(accessState(null,null,start).kind,'new');
});
test('paid access overrides trial only while unexpired',()=>{
  const now=Date.parse('2026-09-18T10:00:00Z');
  assert.equal(accessState(null,new Date(now+1).toISOString(),now).kind,'plus');
  assert.equal(accessState(null,new Date(now).toISOString(),now).active,false);
});
test('calendar plans clamp month end, 30/90 days are exact',()=>{
  assert.equal(periodEnd('2026-08-31T10:00:00Z',PLANS[2]),'2027-02-28T10:00:00.000Z');
  assert.equal(periodEnd('2024-02-29T10:00:00Z',PLANS[3]),'2025-02-28T10:00:00.000Z');
  for(const p of PLANS.slice(0,2))assert.equal(Date.parse(periodEnd('2026-01-01',p))-Date.parse('2026-01-01'),p.days*DAY);
});
test('payment must match order, amount, currency, collector, mode and approval',()=>{
  const order={id:'order',amount:59.9},payment={external_reference:'order',collector_id:123,currency_id:'BRL',transaction_amount:59.9,live_mode:false,status:'approved',date_approved:'2026-09-18T10:00:00Z'};
  assert.equal(matchesPlusPayment(payment,order,123,false),true);
  for(const invalid of [{external_reference:'other'},{collector_id:456},{currency_id:'USD'},{transaction_amount:1},{live_mode:true},{status:'pending'},{status:'charged_back'},{transaction_amount_refunded:0.01},{date_approved:null}])assert.equal(matchesPlusPayment({...payment,...invalid},order,123,false),false);
});
test('clinical input requires consent, complete context and plausible age',()=>{
  const input=Object.fromEntries(['weight','sex','pregnancy','complaint','history','exam','vitals','allergies','medications','renal','hepatic'].map(f=>[f,'desconhecido']));Object.assign(input,{age:'35',consent:true,setting:'outpatient',followUp:'Retorno disponível'});
  assert.equal(clinicalInput(input).age,'35');
  for(const invalid of [{consent:false},{age:'-1'},{age:'121'},{allergies:''},{complaint:'a'.repeat(2001)}])assert.throws(()=>clinicalInput({...input,...invalid}));
});
test('missing information and emergencies suppress prescriptions',()=>{
  const rx=Object.fromEntries(['drug','presentation','dose','route','frequency','duration','quantity','instructions','preparation','infusion','monitoring'].map(f=>[f,'example']));
  const value={setting:'outpatient',hospitalCare:[],outpatientCare:[],summary:'Case',urgency:'routine',alerts:[],missing:[],hypotheses:[],conduct:[],references:[],prescription:[rx]};
  assert.equal(validateClinicalOutput(structuredClone(value),'outpatient').prescription.length,1);
  assert.deepEqual(validateClinicalOutput({...value,missing:['allergies']},'outpatient').prescription,[]);
  assert.deepEqual(validateClinicalOutput({...value,urgency:'emergency'},'outpatient').prescription,[]);
  assert.throws(()=>validateClinicalOutput({...value,prescription:[{drug:'x'}]},'outpatient'));
  assert.throws(()=>validateClinicalOutput({},'outpatient'));
});
test('unconfigured server cannot analyze or charge; public config stays honest',async()=>{
  const event={httpMethod:'POST',headers:{},body:'{}'};
  assert.equal((await analyze(event)).statusCode,503);
  assert.equal((await checkout(event)).statusCode,503);
  const result=await account({httpMethod:'GET',headers:{}}),data=JSON.parse(result.body);
  assert.equal(data.user,null);assert.equal(data.authReady,false);assert.equal(data.billingReady,false);
});
test('each care setting requires its own context and drops fields from the other setting',()=>{
  const input=Object.fromEntries(['weight','sex','pregnancy','complaint','history','exam','vitals','allergies','medications','renal','hepatic'].map(f=>[f,'desconhecido']));
  Object.assign(input,{age:'35',consent:true,setting:'outpatient',followUp:'Retorno agendado',unit:'Enfermaria'});
  assert.equal(clinicalInput(input).unit,undefined);
  assert.throws(()=>clinicalInput({...input,setting:'other'}));
  assert.throws(()=>clinicalInput({...input,setting:'hospital'}));
  const hospital={...input,setting:'hospital',admission:'Primeiro dia',diet:'Desconhecido',devices:'Desconhecido',fluidBalance:'Desconhecido'};
  assert.equal(clinicalInput(hospital).followUp,undefined);
  assert.equal(clinicalInput(hospital).unit,'Enfermaria');
  for(const key of ['unit','admission','diet','devices','fluidBalance'])assert.throws(()=>clinicalInput({...hospital,[key]:''}));
});
test('results from the wrong setting or mixed contexts are rejected',()=>{
  const value={setting:'hospital',summary:'Example',urgency:'routine',alerts:[],missing:[],hypotheses:[],conduct:[],references:[],prescription:[],outpatientCare:[],hospitalCare:[{category:'Reavaliação',instruction:'Example only'}]};
  assert.equal(validateClinicalOutput(structuredClone(value),'hospital').hospitalCare.length,1);
  assert.throws(()=>validateClinicalOutput(value,'outpatient'));
  assert.throws(()=>validateClinicalOutput({...value,outpatientCare:['Example']},'hospital'));
  assert.throws(()=>validateClinicalOutput({...value,setting:'outpatient'},'outpatient'));
  assert.throws(()=>validateClinicalOutput({...value,hospitalCare:[{category:'Invalid',instruction:'Example'}]},'hospital'));
  assert.deepEqual(validateClinicalOutput({...value,missing:['Context missing']},'hospital').hospitalCare,[]);
  assert.deepEqual(validateClinicalOutput({...value,urgency:'emergency'},'hospital').hospitalCare,[]);
});

test('student and doctor profiles enforce distinct requirements without accepting client verification',async()=>{
 const {profileInput,eligibleProfile}=await import('./plus-profile.mjs');
 assert.deepEqual(profileInput({name:'Aluno Teste',role:'student',accepted:true,crm:'123',uf:'MS',verified_at:'now'}),{name:'Aluno Teste',role:'student',crm:null,uf:null});
 assert.throws(()=>profileInput({name:'Teste',role:'doctor',accepted:true}));
 assert.throws(()=>profileInput({name:'Teste',role:'admin',accepted:true}));
 assert.throws(()=>profileInput({name:'Teste',role:'student',accepted:false}));
 assert.equal(eligibleProfile({role:'student'}),true);
 assert.equal(eligibleProfile({role:'doctor',verified_at:null}),false);
 assert.equal(eligibleProfile({role:'doctor',verified_at:'2026-09-19'}),true);
 assert.equal(eligibleProfile({role:'admin',verified_at:'2026-09-19'}),false);
});
