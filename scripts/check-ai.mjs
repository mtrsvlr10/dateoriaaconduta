// Verify credentials without patient data or secret values in build logs.
const {OPENAI_API_KEY:key,OPENAI_MODEL:model,PLUS_CLINICAL_ENABLED:enabled}=process.env;
if(!key||!model){
  if(enabled==='true')throw new Error('AI activation requires API key and model.');
  console.log('AI disabled: connection check skipped.');
}else{
  try{
    const response=await fetch('https://api.openai.com/v1/responses',{
      method:'POST',signal:AbortSignal.timeout(45000),
      headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},
      body:JSON.stringify({model,store:false,input:'Connection test. Return ok=true.',max_output_tokens:1000,
        text:{format:{type:'json_schema',name:'connection_check',strict:true,
          schema:{type:'object',properties:{ok:{type:'boolean'}},required:['ok'],additionalProperties:false}}}})
    });
    if(!response.ok){
      // Do not print provider bodies: they may contain credentials or identifiers.
      const errorData=await response.json().catch(()=>null);
      if(errorData?.error?.code==='insufficient_quota')throw new Error('API credits or spending quota unavailable');
      const hints={401:'Invalid API key',403:'Model or project permission denied',404:'Model unavailable',429:'API quota or rate limit reached'};
      throw new Error(hints[response.status]||`Provider HTTP ${response.status}`);
    }
    const data=await response.json();
    const text=(data.output||[]).flatMap(item=>item.content||[]).filter(item=>item.type==='output_text').map(item=>item.text).join('');
    let output;try{output=JSON.parse(text)}catch{}
    if(data.status!=='completed'||output?.ok!==true)throw new Error('Structured response check failed');
    console.log('AI connection and structured response verified. This is not clinical validation.');
  }catch(error){
    console.error('AI connection check failed:',error.name==='TimeoutError'?'Provider timeout':error.message.replace(/sk-[\w-]+/g,'[redacted]'));
    // An unavailable optional AI service must not block store-only deployments.
    process.exitCode=enabled==='true'?1:0;
  }
}
