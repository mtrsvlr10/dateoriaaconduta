import {eligibleProfile,studyInstructions} from '../../server/plus-profile.mjs';
import {randomUUID} from 'node:crypto';
import {wrap,response,body,identity,admin,checked,fail} from '../../server/common.mjs';
import {plusAccess,clinicalReady} from '../../server/plus.mjs';
import {clinicalInput,clinicalSchema,instructionsFor,validateClinicalOutput} from '../../server/clinical.mjs';
export const handler=wrap(async event=>{
  const i=await identity(event),input=clinicalInput(body(event));
  const account=await plusAccess(i.user);
  if(!account.access.active)fail(402,account.access.kind==='quota'?'Você utilizou as 25 análises gratuitas. Escolha um plano Plus para continuar.':'Seu período de acesso terminou. Escolha um plano Plus para continuar.');
  const administrator=account.access.kind==='admin';
  if(!administrator&&!eligibleProfile(account.profile))fail(403,'Seu CRM ainda precisa ser verificado para liberar a análise.');
  const educational=account.profile?.role==='student'||(administrator&&!account.profile?.verified_at);
  if(!clinicalReady())fail(503,'A análise clínica está em preparação. Explore o caso demonstrativo.');
  if(!checked(await admin().rpc('plus_take_slot',{uid:i.user.id})))fail(429,'Aguarde 30 segundos entre análises.');
  const requestId=account.access.kind==='trial'?randomUUID():null;
  if(requestId&&!checked(await admin().rpc('plus_reserve_trial',{uid:i.user.id,request_id:requestId})))fail(402,'Seu teste gratuito terminou ou as 25 análises foram utilizadas.');
  try{
  const result=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:'Bearer '+process.env.OPENAI_API_KEY,'Content-Type':'application/json'},signal:AbortSignal.timeout(45000),body:JSON.stringify({model:process.env.OPENAI_MODEL,store:false,instructions:educational?instructionsFor(input.setting).replace('Você auxilia exclusivamente médicos no Brasil.','Você auxilia alunos no estudo de casos clínicos.')+' '+studyInstructions:instructionsFor(input.setting),input:JSON.stringify(input),max_output_tokens:5000,text:{format:{type:'json_schema',name:'clinical_draft',strict:true,schema:clinicalSchema}}})});
  if(!result.ok)fail(502,'Não foi possível concluir a análise. Tente novamente mais tarde.');
  const data=await result.json();
  if(data.status!=='completed')fail(502,'A análise não foi concluída. Nenhuma prescrição foi gerada.');
  const output=data.output?.flatMap(o=>o.content||[])||[];
  if(output.some(o=>o.type==='refusal'))fail(422,'Não foi possível analisar este caso. Revise os dados e faça a avaliação clínica.');
  let value;try{value=JSON.parse(output.filter(o=>o.type==='output_text').map(o=>o.text).join(''))}catch{fail(502,'Resposta incompleta. Nenhuma prescrição foi gerada.')}
  return response(200,{result:validateClinicalOutput(value,input.setting,input),demo:false,role:account.profile?.role,educational},i.cookies);
  }catch(error){
    if(requestId){try{checked(await admin().rpc('plus_refund_trial',{uid:i.user.id,request_id:requestId}))}catch{console.error('Trial refund failed; request:',requestId)}}
    throw error;
  }
});
