import test from 'node:test';
import assert from 'node:assert/strict';
import {PLANS,DAY,periodEnd,accessState,matchesPlusPayment} from './plus-policy.mjs';
import {clinicalInput,validateClinicalOutput} from './clinical.mjs';
import {handler as analyze} from '../netlify/functions/plus-analyze.mjs';
import {handler as checkout} from '../netlify/functions/plus-checkout.mjs';
import {handler as account} from '../netlify/functions/plus-account.mjs';
test('Plus admin access requires confirmed identity and server-side membership',async()=>{
  const {plusAccess}=await import('./plus.mjs');
  const savedFetch=globalThis.fetch,oldUrl=process.env.SUPABASE_URL,oldKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL='https://example.supabase.co';process.env.SUPABASE_SERVICE_ROLE_KEY='test-key';
  let member=true;
  globalThis.fetch=async url=>{
    const path=String(url);
    const data=path.includes('plus_profiles')?[{role:'student',trial_started_at:'2020-01-01',trial_analyses_used:25}]:path.includes('plus_admins')&&member?[{user_id:'owner'}]:[];
    return new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}});
  };
  try{
    const owner=await plusAccess({id:'owner',email_confirmed_at:'2026-01-01'});
    assert.deepEqual(owner.access,{active:true,kind:'admin',expiresAt:null,unlimited:true});
    assert.equal((await plusAccess({id:'owner'})).access.active,false);
    member=false;
    assert.equal((await plusAccess({id:'other',email_confirmed_at:'2026-01-01',user_metadata:{role:'admin'}})).access.active,false);
  }finally{
    globalThis.fetch=savedFetch;
    if(oldUrl===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=oldUrl;
    if(oldKey===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=oldKey;
  }
});
test('trial quota blocks the 26th analysis and never restricts paid access',()=>{
  const now=Date.parse('2026-09-19T12:00:00Z');
  const profile={trial_started_at:new Date(now-1000).toISOString(),trial_analyses_used:24};
  assert.equal(accessState(profile,null,now).trialRemaining,1);
  assert.equal(accessState(profile,null,now).active,true);
  profile.trial_analyses_used=25;
  assert.equal(accessState(profile,null,now).kind,'quota');
  assert.equal(accessState(profile,null,now).active,false);
  assert.equal(accessState(profile,new Date(now+1000).toISOString(),now).kind,'plus');
  assert.equal(accessState(profile,null,now+5*DAY).kind,'expired');
  assert.equal(accessState(null,null,now).trialRemaining,25);
});
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
  for(const invalid of [{consent:false},{age:'-1'},{age:'121'},{complaint:''},{complaint:'a'.repeat(2001)}])assert.throws(()=>clinicalInput({...input,...invalid}));
});
test('missing information and emergencies suppress prescriptions',()=>{
  const rx=Object.fromEntries(['drug','presentation','dose','route','frequency','duration','quantity','instructions','preparation','infusion','monitoring'].map(f=>[f,'example']));rx.safety={status:'ready',reason:'Synthetic evidence',requiredData:[]};
  const value={setting:'outpatient',hospitalCare:[],outpatientCare:[],summary:'Case',urgency:'routine',alerts:[],missing:[],hypotheses:[],conduct:[],references:[],prescription:[rx]};
  assert.equal(validateClinicalOutput(structuredClone(value),'outpatient',{age:'35',allergies:'Nega',medications:'Nenhum'}).prescription.length,1);
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
  assert.equal(clinicalInput({...input,setting:'hospital'}).admission,'Desconhecido');
  const hospital={...input,setting:'hospital',admission:'Primeiro dia',diet:'Desconhecido',devices:'Desconhecido',fluidBalance:'Desconhecido'};
  assert.equal(clinicalInput(hospital).followUp,undefined);
  assert.equal(clinicalInput(hospital).unit,'Enfermaria');
  for(const key of ['unit','admission','diet','devices','fluidBalance'])assert.equal(clinicalInput({...hospital,[key]:''})[key],'Desconhecido');
});
test('results from the wrong setting or mixed contexts are rejected',()=>{
  const value={setting:'hospital',summary:'Example',urgency:'routine',alerts:[],missing:[],hypotheses:[],conduct:[],references:[],prescription:[],outpatientCare:[],hospitalCare:[{category:'Reavaliação',instruction:'Example only',safety:{status:'ready',reason:'Synthetic evidence',requiredData:[]}}]};
  assert.equal(validateClinicalOutput(structuredClone(value),'hospital').hospitalCare.length,1);
  assert.throws(()=>validateClinicalOutput(value,'outpatient'));
  assert.throws(()=>validateClinicalOutput({...value,outpatientCare:['Example']},'hospital'));
  assert.throws(()=>validateClinicalOutput({...value,setting:'outpatient'},'outpatient'));
  assert.throws(()=>validateClinicalOutput({...value,hospitalCare:[{category:'Invalid',instruction:'Example'}]},'hospital'));
  assert.equal(validateClinicalOutput({...value,missing:['Context missing']},'hospital').hospitalCare.length,1);
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

 test('partial case keeps assessment plans but cannot produce an unchecked prescription',()=>{
 const input=clinicalInput({setting:'outpatient',consent:true,complaint:'Caso sintético: dor há dois dias'});
 assert.equal(input.age,'Desconhecido');assert.equal(input.exam,'Desconhecido');
 assert.throws(()=>clinicalInput({setting:'outpatient',consent:true}));
 const rx=Object.fromEntries(['drug','presentation','dose','route','frequency','duration','quantity','instructions','preparation','infusion','monitoring'].map(k=>[k,'example']));rx.safety={status:'ready',reason:'Synthetic evidence',requiredData:[]};
 const value={setting:'outpatient',summary:'Example',urgency:'routine',alerts:[],missing:[],hypotheses:[],conduct:[],references:[],prescription:[rx],hospitalCare:[],outpatientCare:[],examPlan:['Avaliar achados'],nextSteps:['Completar avaliação'],reassessment:['Definir urgência presencialmente'],treatmentOptions:['Opção condicional para estudo']};
 const result=validateClinicalOutput(structuredClone(value),'outpatient',input);
 assert.deepEqual(result.prescription,[]);assert.equal(result.examPlan.length,1);assert.equal(result.reassessment.length,1);assert.equal(result.treatmentOptions.length,1);
 assert.deepEqual(validateClinicalOutput({...value,urgency:'emergency'},'outpatient',input).treatmentOptions,[]);
 assert.throws(()=>validateClinicalOutput({...value,examPlan:[123]},'outpatient',input));
 });

test('only trusted administrator flag exempts doctor test profile from CRM',async()=>{
 const {profileInput}=await import('./plus-profile.mjs');
 const input={name:'Admin Teste',role:'doctor',accepted:true,administrator:true,verified_at:'now'};
 assert.throws(()=>profileInput(input));
 assert.deepEqual(profileInput(input,{administrator:true}),{name:'Admin Teste',role:'doctor',crm:null,uf:null});
 assert.throws(()=>profileInput({...input,accepted:false},{administrator:true}));
});


test('medication explanations identify missing data and preserve supported study options',()=>{
 const base={setting:'outpatient',summary:'Synthetic',urgency:'routine',alerts:[],missing:[],hypotheses:[],conduct:[],references:[],prescription:[],hospitalCare:[],outpatientCare:[],treatmentOptions:['Named educational option'],medicationLimitations:['Case-specific limitation']};
 const input=clinicalInput({setting:'outpatient',consent:true,complaint:'Synthetic study case'});
 const result=validateClinicalOutput(structuredClone(base),'outpatient',input);
 assert.equal(result.treatmentOptions.length,1);
 assert.equal(result.medicationLimitations.length,1);
 assert.ok(result.medicationLimitations.includes('Case-specific limitation'));
 const emergency=validateClinicalOutput({...structuredClone(base),urgency:'emergency'},'outpatient',input);
 assert.deepEqual(emergency.treatmentOptions,[]);
 assert.ok(emergency.medicationLimitations.some(v=>v.includes('presencial imediata')));
 assert.throws(()=>validateClinicalOutput({...base,medicationLimitations:[5]},'outpatient'));
 const empty=validateClinicalOutput({...base,urgency:'insufficient',treatmentOptions:[],medicationLimitations:[]},'outpatient');
 assert.ok(empty.medicationLimitations.length>0);
});


test('structured medication options retain conditions for partial cases and reject incomplete or dosing fields',()=>{
 const option={drug:'Synthetic option',rationale:'Synthetic hypothesis',beforeConsidering:'Confirm essential facts',avoidWhen:'Synthetic contraindication'};
 const base={setting:'hospital',summary:'Synthetic',urgency:'routine',alerts:[],missing:[],hypotheses:[],conduct:[],references:[],prescription:[],hospitalCare:[],outpatientCare:[],medicationOptions:[option]};
 const input=clinicalInput({setting:'hospital',consent:true,complaint:'Synthetic case'});
 assert.deepEqual(validateClinicalOutput(structuredClone(base),'hospital',input).medicationOptions,[option]);
 for(const urgency of ['urgent','emergency'])assert.deepEqual(validateClinicalOutput({...structuredClone(base),urgency},'hospital',input).medicationOptions,[]);
 for(const invalid of [{...option,avoidWhen:''},{...option,dose:'10'},null])assert.throws(()=>validateClinicalOutput({...base,medicationOptions:[invalid]},'hospital',input));
});

test('medication cards escape model text and include conditions in editable draft',async()=>{
 const {readFile}=await import('node:fs/promises');
 const {runInNewContext}=await import('node:vm');
 const source=await readFile(new URL('../public/plus.js',import.meta.url),'utf8');
 const nodes={};
 const context={result:null,demo:false,setting:'hospital',account:{profile:{role:'student'}},settingLabel:()=> 'hospitalar',esc:s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;'),$:s=>nodes[s]??=( {hidden:false,innerHTML:'',textContent:''} )};
 runInNewContext(source.slice(source.indexOf('function renderResult('),source.indexOf('function loadDemo(')),context);
 context.renderResult({summary:'Test',alerts:[],missing:[],hypotheses:[],conduct:[],references:[],prescription:[],medicationOptions:[{drug:'<script>bad</script>',rationale:'Reason',beforeConsidering:'Confirm allergy',avoidWhen:'Do not use when contraindicated'}]},false);
 const html=nodes['#result-content'].innerHTML;
 assert.ok(!html.includes('<script>'));
 assert.ok(html.includes('&lt;script&gt;'));
 assert.ok(html.includes('Antes de considerar: Confirm allergy'));
 assert.ok(html.includes('Quando evitar: Do not use when contraindicated'));
 assert.ok(html.includes('Opções medicamentosas para discussão'));
});


test('routine drafts retain supported items while dropping only drugs and care with missing dependencies',()=>{
 const rx=Object.fromEntries(['drug','presentation','dose','route','frequency','duration','quantity','instructions','preparation','infusion','monitoring'].map(k=>[k,'synthetic']));
 const ready={status:'ready',reason:'Synthetic rationale',requiredData:[]};
 const base={setting:'hospital',summary:'Synthetic',urgency:'routine',alerts:[],missing:['Further follow-up'],hypotheses:[],conduct:[],references:[],outpatientCare:[],prescription:[{...rx,drug:'Supported item',safety:ready},{...rx,drug:'Renal-dependent item',safety:{...ready,requiredData:['renal']}},{...rx,drug:'Pending decision',safety:{...ready,status:'pending'}}],hospitalCare:[{category:'Cuidados',instruction:'Supported care',safety:ready},{category:'Hidratação',instruction:'Pending fluid balance',safety:{...ready,requiredData:['fluidBalance']}}]};
 const input=clinicalInput({setting:'hospital',consent:true,complaint:'Synthetic nonurgent example',age:'64',allergies:'Nega',medications:'Tratamento informado'});
 const result=validateClinicalOutput(structuredClone(base),'hospital',input);
 assert.deepEqual(result.prescription.map(p=>p.drug),['Supported item']);
 assert.equal(result.hospitalCare.length,1);
 assert.ok(result.medicationLimitations.some(v=>v.includes('Renal-dependent item')));
 assert.ok(result.medicationLimitations.some(v=>v.includes('Pending decision')));
 assert.equal(result.prescription[0].dose,'synthetic');
 const completed=validateClinicalOutput(structuredClone(base),'hospital',{...input,renal:'Informação fornecida',fluidBalance:'Informação fornecida'});
 assert.equal(completed.prescription.length,2);assert.equal(completed.hospitalCare.length,2);
 for(const urgency of ['urgent','emergency','insufficient']){
  const blocked=validateClinicalOutput({...structuredClone(base),urgency},'hospital',input);
  assert.equal(blocked.prescription.length,0);assert.equal(blocked.hospitalCare.length,0);
 }
 for(const key of ['age','allergies','medications'])assert.equal(validateClinicalOutput(structuredClone(base),'hospital',{...input,[key]:'Desconhecido'}).prescription.length,0);
 assert.throws(()=>validateClinicalOutput({...structuredClone(base),prescription:[{...rx,safety:{...ready,requiredData:['invented']}}]},'hospital',input));
 assert.throws(()=>validateClinicalOutput({...structuredClone(base),prescription:[rx]},'hospital',input));
});


test('both draft formats show supported medication details and item rationale',async()=>{
 const {readFile}=await import('node:fs/promises');const {runInNewContext}=await import('node:vm');
 const source=await readFile(new URL('../public/plus.js',import.meta.url),'utf8');
 const rx=Object.fromEntries(['drug','presentation','dose','route','frequency','duration','quantity','instructions','preparation','infusion','monitoring'].map(k=>[k,'fixture-'+k]));
 rx.safety={status:'ready',reason:'Reason specific to this item',requiredData:[]};
 for(const setting of ['outpatient','hospital']){
  const nodes={};const context={result:null,demo:false,setting,account:{profile:{role:'doctor'}},settingLabel:()=>setting,esc:String,$:s=>nodes[s]??={}};
  runInNewContext(source.slice(source.indexOf('function renderResult('),source.indexOf('function loadDemo(')),context);
  context.renderResult({summary:'Synthetic',alerts:[],missing:[],hypotheses:[],conduct:[],references:[],prescription:[rx]},false);
  const html=nodes['#result-content'].innerHTML;
  for(const field of ['dose','route','frequency','duration','quantity'])assert.ok(html.includes('fixture-'+field));
  assert.ok(html.includes('Reason specific to this item'));assert.ok(html.includes('1. fixture-drug'));
 }
});
