# Da Teoria à Conduta

Loja de materiais digitais com identidade baseada na logo enviada. O catálogo inicial contém três exemplos, sem cobrança habilitada.

## O que está preparado

- Página adaptável a celular e computador; pesquisa, categorias e detalhes.
- Cadastro, confirmação de e-mail, login, recuperação de senha e saída.
- Checkout Pro do Mercado Pago com preço consultado no servidor.
- Confirmação de pagamento por webhook assinado; conferência de valor, moeda, comprador, material, recebedor e ambiente.
- Biblioteca por aluno. Downloads temporários de arquivos privados, com nova conferência do pagamento no Mercado Pago.

## Publicar na Netlify

Este projeto contém funções de servidor: subir apenas a pasta `public` por arrastar e soltar publica a vitrine, mas **não ativa cadastro nem compras**.

Publique o projeto completo por um repositório conectado à Netlify ou pela CLI da Netlify. A configuração está em `netlify.toml`: pasta pública `public`, funções em `netlify/functions`, Node 22. Instale as dependências com pnpm antes de um deploy por CLI. Pela CLI, execute `netlify deploy --build --prod` na pasta do projeto após entrar na conta e selecionar/criar o projeto correto.

Não há credenciais incluídas. Cadastros reais, pagamento e download dependem da configuração abaixo. Não foram testados com contas reais nesta entrega.

## Contas e configuração

1. Crie um projeto no Supabase para contas, pedidos e arquivos. Execute `supabase.sql` uma vez no SQL Editor. O bucket `materials` deve permanecer privado.
2. Em Authentication, configure a URL do site publicado como Site URL e Redirect URL. Mantenha a confirmação de e-mail habilitada. Configure envio de e-mails para produção e limites de cadastro no painel.
3. Nas variáveis de ambiente da Netlify, disponíveis para Functions, preencha as chaves de `.env.example`. Não coloque os valores em `public`, no repositório ou no chat.
4. `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` vêm do projeto Supabase. A service role é secreta e fica exclusivamente no servidor.
5. `SITE_URL` é a URL HTTPS final do site, sem caminho adicional. Atualize-a também ao configurar um domínio próprio.
6. No Mercado Pago Developers, use uma aplicação de Checkout Pro via Preferences API. Configure o evento de pagamento no endereço `https://SEU-SITE.netlify.app/.netlify/functions/payment-webhook`. Copie a assinatura secreta para `MERCADO_PAGO_WEBHOOK_SECRET`.
7. Configure `MERCADO_PAGO_ACCESS_TOKEN` e `MERCADO_PAGO_COLLECTOR_ID` com as credenciais e o identificador do recebedor correspondente. Comece com `MERCADO_PAGO_MODE=test` e contas de teste. Para produção, use o recebedor e token reais, e `MERCADO_PAGO_MODE=production`.
8. Publique novamente após alterar as variáveis.

## Substituir os exemplos

No Table Editor do Supabase, edite a tabela `products`. Você pode alterar título, descrição, preço, categoria, tópicos e cor (`tone`: vazio, `slate` ou `sand`). `cover` aceita quebra de linha. As categorias disponíveis são Ciclo básico, Clínica médica e Internato.

Envie o PDF ao bucket privado `materials`, informe o caminho em `file_path` (por exemplo `anatomia.pdf`) e mude `demo` para `false` quando o material estiver pronto. O campo `active` controla a exibição. Não coloque os PDFs pagos na pasta pública. Enquanto o Supabase não está conectado, a vitrine usa os exemplos em `public/app.js`.

## Verificações antes de vender

Faça o fluxo completo em ambiente de teste: cadastro, confirmação do e-mail, login, recuperação de senha, compra aprovada, pendente e recusada, webhook, biblioteca e download. Confirme que outra conta não consegue baixar o material e que estornos bloqueiam novos downloads. Os testes locais verificam assinatura, correspondência do pagamento e bloqueio de requisições não autorizadas; eles não substituem essa homologação.

Para executar os testes locais: `pnpm test`. Para visualizar somente a interface local: `pnpm dev` (esta prévia não efetua cadastros nem cobranças).

Antes do lançamento comercial, preencha os dados reais do vendedor, contato de suporte e políticas de compra/privacidade adequadas ao negócio. Esses dados não foram inventados no site.

## Referências de integração

- [Configuração das funções Netlify](https://docs.netlify.com/build/functions/configuration/)
- [Supabase Auth](https://supabase.com/docs/reference/javascript/auth)
- [Arquivos privados no Supabase](https://supabase.com/docs/guides/storage/buckets/fundamentals)
- [Mercado Pago: preferências de pagamento](https://www.mercadopago.com.br/developers/pt/reference/online-payments/checkout-pro-preferences/overview)
- [Mercado Pago: notificações](https://www.mercadopago.com.br/developers/en/docs/checkout-pro-preferences/payment-notifications)
