import {wrap,response,body,identity,admin,checked,fail} from '../../server/common.mjs';
import {plusAccess,clinicalReady} from '../../server/plus.mjs';
import {clinicalInput,clinicalSchema,instructionsFor,validateClinicalOutput} from '../../server/clinical.mjs';
export const handler=wrap(async event=>{
  const i=await identity(event),input=clinicalInput(body(event));
  const account=await plusAccess(i.user);
  if(!account.access.active)fail(402,'Seu período de acesso terminou. Escolha um plano Plus para continuar.');
  if(!account.profile?.verified_at)fail(403,'Seu CRM ainda precisa ser verificado para liberar a análise.');
  if(!clinicalReady())fail(503,'A análise clínica está em preparação. Explore o caso demonstrativo.');
  if(!checked(await admin().rpc('plus_take_slot',{uid:i.user.id})))fail(429,'Aguarde 30 segundos entre análises.');
  const result=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:'Bearer '+process.env.OPENAI_API_KEY,'Content-Type':'application/json'},signal:AbortSignal.timeout(45000),body:JSON.stringify({model:process.env.OPENAI_MODEL,store:false,instructions:instructionsFor(input.setting),input:JSON.stringify(input),max_output_tokens:5000,text:{format:{type:'json_schema',name:'clinical_draft',strict:true,schema:clinicalSchema}}})});
  if(!result.ok)fail(502,'Não foi possível concluir a análise. Tente novamente mais tarde.');
  const data=await result.json();
  if(data.status!=='completed')fail(502,'A análise não foi concluída. Nenhuma prescrição foi gerada.');
  const output=data.output?.flatMap(o=>o.content||[])||[];
  if(output.some(o=>o.type==='refusal'))fail(422,'Não foi possível analisar este caso. Revise os dados e faça a avaliação clínica.');
  let value;try{value=JSON.parse(output.filter(o=>o.type==='output_text').map(o=>o.text).join(''))}catch{fail(502,'Resposta incompleta. Nenhuma prescrição foi gerada.')}
  return response(200,{result:validateClinicalOutput(value,input.setting),demo:false},i.cookies);
});
