-- Execute uma vez no SQL Editor do seu projeto Supabase.
create table if not exists public.products (
  id text primary key,
  title text not null,
  cover text not null,
  category text not null check (category in ('Ciclo básico','Clínica médica','Internato')),
  description text not null,
  format text not null default 'Material digital · PDF',
  price numeric(10,2) not null check (price > 0),
  tone text not null default '',
  topics jsonb not null default '[]',
  demo boolean not null default true,
  active boolean not null default true,
  position integer not null default 0,
  file_path text
);
create table if not exists public.orders (
  id uuid primary key,
  user_id uuid not null references auth.users(id),
  product_id text not null references public.products(id),
  amount numeric(10,2) not null check (amount > 0),
  status text not null default 'pending',
  created_at timestamptz not null default now()
);
create table if not exists public.payments (
  id text primary key,
  order_id uuid not null references public.orders(id),
  status text not null,
  updated_at timestamptz not null default now()
);
create index if not exists orders_user_idx on public.orders(user_id,product_id);
create index if not exists payments_order_idx on public.payments(order_id,status);
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.payments enable row level security;
revoke all on public.products,public.orders,public.payments from anon,authenticated;
grant all on public.products,public.orders,public.payments to service_role;
-- As funções da Netlify validam o aluno e consultam os dados pelo servidor.
-- Não adicione políticas públicas de leitura aos arquivos pagos.
insert into storage.buckets (id,name,public) values ('materials','materials',false)
on conflict (id) do nothing;
insert into public.products (id,title,cover,category,description,price,tone,topics,position) values
('anatomia','Anatomia essencial',E'Anatomia\nessencial.','Ciclo básico','Uma visão organizada das estruturas e sistemas do corpo humano.',39.90,'','["Organização por sistemas","Roteiro de revisão","Espaço para suas anotações"]',1),
('raciocinio','Raciocínio clínico',E'Raciocínio\nclínico.','Clínica médica','Conecte o que você estuda à construção do raciocínio clínico.',59.90,'slate','["Organização do pensamento clínico","Estrutura para discussão de casos","Perguntas para revisão"]',2),
('internato','Guia de estudos do internato',E'Seu próximo\nplantão.','Internato','Um ponto de partida para planejar seus estudos durante o internato.',49.90,'sand','["Planejamento por rotações","Checklist de estudo","Registro de aprendizados"]',3)
on conflict (id) do nothing;
