import {randomUUID} from 'node:crypto';
import {wrap,response,requireSetup,body,identity,admin,checked,fail} from '../../server/common.mjs';
import {isAdministrator} from '../../server/admin-access.mjs';
import {validateProduct} from '../../server/admin-product.mjs';

const fields='id,title,cover,category,description,format,price,tone,topics,demo,active,position,file_path';
export const handler=wrap(async event=>{
  requireSetup();
  if (!['GET','POST'].includes(event.httpMethod)) fail(405,'Método não permitido.');
  const input = event.httpMethod==='POST' ? body(event) : null;
  const session=await identity(event);
  if (!isAdministrator(session.user)) fail(403,'Esta conta não tem acesso administrativo.');
  const db=admin(), storage=db.storage.from('materials');
  if (!input) return response(200,{products:checked(await db.from('products').select(fields).order('position'))},session.cookies);
  if (input.action==='upload') {
    if (!Number.isInteger(input.size) || input.size<=0 || input.size>20*1024*1024) fail(400,'Envie um PDF de até 20 MB.');
    const path=`uploads/${randomUUID()}.pdf`;
    const signed=checked(await storage.createSignedUploadUrl(path));
    return response(200,{path,url:signed.signedUrl},session.cookies);
  }
  if (input.action==='save') {
    const product=validateProduct(input.product);
    if (product.file_path) {
      const info=await storage.info(product.file_path);
      if (info.error || !info.data || info.data.size>20*1024*1024) fail(400,'O PDF não foi encontrado ou excede 20 MB. Envie o arquivo novamente.');
      const signed=checked(await storage.createSignedUrl(product.file_path,30));
      const res=await fetch(signed.signedUrl,{headers:{Range:'bytes=0-4'},signal:AbortSignal.timeout(10000)});
      if (!res.ok) fail(400,'Não foi possível validar o PDF.');
      const reader=res.body.getReader(); const first=await reader.read(); await reader.cancel();
      if (!first.value || new TextDecoder().decode(first.value.slice(0,5))!=='%PDF-') fail(400,'O arquivo enviado não é um PDF válido.');
    }
    checked(await db.from('products').upsert(product,{onConflict:'id'}));
  } else if (input.action==='archive') {
    if (typeof input.id!=='string' || !/^[a-z0-9][a-z0-9_-]{0,79}$/.test(input.id)) fail(400,'Material inválido.');
    checked(await db.from('products').update({active:false}).eq('id',input.id));
  } else if (input.action==='hideExamples') {
    checked(await db.from('products').update({active:false}).eq('demo',true));
  } else fail(400,'Ação inválida.');
  return response(200,{ok:true},session.cookies);
});
