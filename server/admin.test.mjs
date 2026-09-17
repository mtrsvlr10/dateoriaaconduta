import test from 'node:test';
import assert from 'node:assert/strict';
import {isAdministrator} from './admin-access.mjs';
import {validateProduct} from './admin-product.mjs';
import {handler} from '../netlify/functions/admin.mjs';
test('somente e-mail confirmado e autorizado acessa administração',()=>{
 const user={email:'Owner@example.com',email_confirmed_at:'2026-01-01'};
 assert.equal(isAdministrator(user,' owner@example.com '),true);
 for(const u of [null,{...user,email:'student@example.com'},{email:user.email},{...user,email_confirmed_at:null},{email:'student@example.com',email_confirmed_at:'2026',user_metadata:{role:'admin'}}])assert.equal(isAdministrator(u,'owner@example.com'),false);
 assert.equal(isAdministrator(user,''),false);
});
const product={id:'example',title:'Material',cover:'Material',category:'Internato',description:'Descrição',format:'PDF',price:29.9,tone:'',topics:[],demo:false,active:true,position:1,file_path:'uploads/example.pdf'};
test('catálogo valida campos e exige PDF para vendas',()=>{
 assert.equal(validateProduct(product).price,29.9);
 for(const change of [{price:-1},{price:'29.9'},{price:Infinity},{title:''},{category:'Outra'},{topics:['x'.repeat(201)]},{file_path:'../secret.pdf'},{file_path:'https://example.com/a.pdf'},{file_path:null},{active:'true'},{demo:undefined},{position:1.5}])assert.throws(()=>validateProduct({...product,...change}),{status:400});
 assert.equal(validateProduct({...product,active:false,file_path:null}).file_path,null);
 assert.equal(validateProduct({...product,is_admin:true}).is_admin,undefined);
});
test('função protege leitura, gravação e upload antes de acessar o banco',async()=>{
 const oldFetch=globalThis.fetch;const oldEnv={...process.env};let calls=[];let currentUser={id:'owner-id',email:'owner@example.com',email_confirmed_at:'2026-01-01'};
 Object.assign(process.env,{SITE_URL:'https://store.example',SUPABASE_URL:'https://database.example',SUPABASE_ANON_KEY:'test-public',SUPABASE_SERVICE_ROLE_KEY:'test-private',ADMIN_EMAIL:'owner@example.com'});
 globalThis.fetch=async(url,options={})=>{calls.push({url:String(url),options});if(String(url).endsWith('/auth/v1/user'))return Response.json(currentUser);if(String(url).includes('/rest/v1/products'))return options.method==='PATCH'?new Response(null,{status:204}):Response.json([]);throw new Error('Unexpected external call');};
 try{
  assert.equal((await handler({httpMethod:'GET',headers:{}})).statusCode,401);assert.equal(calls.length,0);
  for(const action of ['upload','save','hideExamples','archive']){
   currentUser={id:'student',email:'student@example.com',email_confirmed_at:'2026-01-01',user_metadata:{role:'admin'}};calls=[];
   const result=await handler({httpMethod:'POST',headers:{origin:'https://store.example',cookie:'dtc_access=student'},body:JSON.stringify({action,id:'anatomia',size:30,product})});
   assert.equal(result.statusCode,403);assert.ok(calls.every(c=>c.url.endsWith('/auth/v1/user')));
  }
  currentUser={id:'owner',email:'owner@example.com',email_confirmed_at:'2026-01-01'};calls=[];
  assert.equal((await handler({httpMethod:'POST',headers:{origin:'https://attacker.example',cookie:'dtc_access=owner'},body:'{"action":"hideExamples"}'})).statusCode,403);assert.equal(calls.length,0);
  assert.equal((await handler({httpMethod:'GET',headers:{cookie:'dtc_access=owner'}})).statusCode,200);
  const result=await handler({httpMethod:'POST',headers:{origin:'https://store.example',cookie:'dtc_access=owner'},body:'{"action":"hideExamples"}'});
  assert.equal(result.statusCode,200);const write=calls.find(c=>c.options.method==='PATCH');assert.ok(write.url.includes('demo=eq.true'));assert.deepEqual(JSON.parse(write.options.body),{active:false});
 }finally{globalThis.fetch=oldFetch;for(const key of ['SITE_URL','SUPABASE_URL','SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','ADMIN_EMAIL']){if(oldEnv[key]===undefined)delete process.env[key];else process.env[key]=oldEnv[key]}}
});
