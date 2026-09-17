const error = message => { throw Object.assign(new Error(message), {status:400}); };
const text = (value, max, label, required = true) => {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) error(`Confira o campo ${label}.`);
  return value.trim();
};
export function validateProduct(p) {
  if (!p || typeof p !== 'object') error('Material inválido.');
  const id = text(p.id,80,'identificador');
  if (!/^[a-z0-9][a-z0-9_-]{0,79}$/.test(id)) error('Identificador inválido.');
  if (!['Ciclo básico','Clínica médica','Internato'].includes(p.category)) error('Categoria inválida.');
  if (typeof p.price !== 'number' || !Number.isFinite(p.price) || p.price <= 0 || p.price > 999999.99) error('Informe um preço maior que zero.');
  if (!Number.isInteger(p.position) || p.position < 0 || p.position > 10000) error('Ordem inválida.');
  if (typeof p.active !== 'boolean' || typeof p.demo !== 'boolean') error('Situação inválida.');
  if (!['','slate','sand'].includes(p.tone)) error('Cor inválida.');
  if (!Array.isArray(p.topics) || p.topics.length > 12) error('Use até 12 tópicos.');
  const file_path = p.file_path || null;
  if (file_path && (typeof file_path !== 'string' || file_path.length > 240 || !/^[a-zA-Z0-9/_-]+\.pdf$/.test(file_path) || file_path.includes('..'))) error('Arquivo inválido.');
  if (p.active && !p.demo && !file_path) error('Envie o PDF antes de publicar o material.');
  return {id,title:text(p.title,160,'título'),cover:text(p.cover || p.title,160,'capa'),category:p.category,
    description:text(p.description,1500,'descrição'),format:text(p.format,120,'formato'),price:Math.round(p.price*100)/100,
    tone:p.tone,topics:p.topics.map(t=>text(t,200,'tópico')),demo:p.demo,active:p.active,position:p.position,file_path};
}
