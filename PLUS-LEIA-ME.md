# Da Teoria à Conduta Plus — primeira versão

Abra `http://127.0.0.1:4174/plus.html` com `node preview.cjs` em execução. A loja também tem o link **App Plus**. É um aplicativo web responsivo; não é um aplicativo publicado nas lojas Apple/Google.

## Entregue

- Interface de atendimento, cadastro/login/recuperação de senha reutilizando Supabase Auth, cadastro profissional, área de assinatura e quatro planos.
- Caso fictício local claramente identificado, que não depende de API nem de login. Alterar a ficha invalida o resultado anterior. Não é um diagnóstico calculado.
- Análise preparada via OpenAI Responses API, com saída estruturada: resumo, urgência, alertas, informações faltantes, hipóteses, conduta, prescrição e referências sugeridas para conferência.
- Revisão e edição de rascunho, com confirmação antes de copiar; editar o texto exige nova confirmação. Não há emissão, assinatura digital ou envio de receita.
- Datas de acesso verificadas no servidor, teste único por conta durante 120 horas, pagamento verificado diretamente no Mercado Pago em cada consulta de acesso. O retorno do checkout não libera acesso por si só.
- Renovação de 30 dias via assinaturas Mercado Pago; demais planos por Checkout Pro com pagamento único. Cancelar renovação conserva o período já pago. Pagamento pendente, estornado, em ambiente errado ou de valor/recebedor incorreto não libera acesso.
- Nenhum dado clínico é persistido pelo código no banco ou no armazenamento local. Uma análise habilitada envia os campos clínicos à OpenAI. `store:false` não é garantia de retenção zero pelo provedor; avaliar contratos e políticas antes de casos reais. Não há prontuário/histórico de pacientes nesta versão.

## Valores propostos, não ativados

| Plano | Preço | Cobrança |
|---|---:|---|
| 30 dias | R$ 59,90 | Recorrente, a cada 30 dias |
| 90 dias | R$ 159,90 | Única |
| Semestral | R$ 299,90 | Única, seis meses de calendário |
| Anual | R$ 539,90 | Única, doze meses de calendário |

São uma proposta comercial, não uma análise de rentabilidade. O anual equivale a R$ 44,99/mês e custa aproximadamente 25% menos que 12 pagamentos de R$ 59,90 (os períodos não são exatamente iguais). Como referência, a [página comercial Whitebook](https://lp.whitebook.com.br/premium/) consultada em 18/09/2026 apresentava uma oferta de R$ 49,90 mensal e R$ 359,90 anual; ofertas variam e não são produtos idênticos. Validar custo por atendimento, volume, taxas, impostos e suporte antes de prometer uso ilimitado. Esta versão não anuncia análises ilimitadas e aplica intervalo de 30 segundos contra chamadas simultâneas/abuso.

## Configuração pendente para homologação

1. Executar `plus.sql` no mesmo Supabase já usado pela loja, após `supabase.sql`. Tabelas têm RLS, sem acesso direto de clientes. Chaves privadas ficam somente no servidor.
2. Adicionar `https://SEU-DOMINIO/plus.html` às URLs permitidas de confirmação e recuperação do Supabase. Os redirecionamentos da loja permanecem em `/`.
3. Preencher no ambiente de servidor as variáveis existentes do Supabase/Mercado Pago e `OPENAI_API_KEY` e `OPENAI_MODEL`, selecionando modelo compatível com Responses/Structured Outputs. Não colocar chaves no chat, em arquivos públicos ou no Git.
4. `PLUS_CLINICAL_ENABLED=false` e `PLUS_BILLING_ENABLED=false` são os padrões. Primeiro homologar em ambiente isolado com casos fictícios. Só então habilitar a análise e, separadamente, o pagamento.
5. O médico envia nome, CRM e UF. A operação responsável confere o registro e preenche `verified_at` no registro correspondente em `plus_profiles` pelo painel administrativo seguro do Supabase. Não existe verificação automática com CFM nesta versão. Não habilitar por declaração do usuário. A data de teste começa na primeira ativação após verificação e serviço habilitado; a função SQL não altera uma data já existente.
6. Credenciais Mercado Pago de teste para homologar assinatura pendente/autorizada, primeira cobrança, renovação, falha, cancelamento, pagamento único, reembolso e contestação. Cobrança não foi executada nem testada com contas externas nesta entrega. A conciliação é sob demanda, sem webhook novo ou tarefa em segundo plano. Consultar a conta ou solicitar uma análise força nova verificação. Verificar paginação/volume antes de lançamento em escala.
7. Pedidos pendentes são reutilizados para o mesmo plano; tentativa concorrente não cria segundo pedido. Falha incerta ao criar cobrança preserva o pedido para conciliação manual, evitando tentar cobrar novamente às cegas. Para trocar um checkout pendente, conciliar/cancelar primeiro no provedor e atualizar seu estado no banco. Não apagar pedidos nem marcar pagamentos como pagos manualmente.
8. Validar limites/duração de Functions no ambiente Netlify para chamadas de IA. A integração usa timeout de 45 segundos no provedor.

## Antes de uso clínico ou lançamento comercial

A conexão de IA é código de integração, não um sistema clinicamente validado. O modelo pode errar, inclusive doses, classificação de urgência ou referências. Os bloqueios por estrutura/dados pendentes não substituem validação clínica nem uma base farmacológica confiável. Nesta versão as referências são texto sugerido pelo modelo, sem busca ou verificação automática. Não há checagem determinística completa de interações, contraindicações, dose, alertas ou medicamentos controlados.

Requer curadoria de protocolos e medicamentos, avaliação de casos por médicos, testes de segurança clínica, política de privacidade e base legal para dados de saúde, contratos com fornecedores, definição de responsável técnico e avaliação do enquadramento regulatório. A emissão válida de receitas e assinatura digital é uma integração adicional; o rascunho não cumpre esse papel.

## Verificação realizada

19 testes locais de segurança/regras (loja + Plus): limite exato de cinco dias, vencimento de período pago, fim de mês/ano bissexto, correspondência de pagamento e rejeição de estorno, validação de entrada, supressão de prescrição em resposta com informações faltantes/urgência, bloqueio sem configuração e proteções existentes da loja. Execução neste ambiente: `node --test --test-isolation=none server/security.test.mjs server/admin.test.mjs server/plus.test.mjs`.

Fluxos de interface conferidos no navegador. Não foram executados migração SQL no serviço externo, cadastro real, IA real nem cobrança real. Não houve publicação em produção.

## Referências de integração

- [OpenAI: saídas estruturadas](https://developers.openai.com/api/docs/guides/structured-outputs)
- [Mercado Pago: assinatura pendente](https://www.mercadopago.com.br/developers/pt/docs/subscriptions/integration-configuration/subscription-no-associated-plan/pending-payments)
- [Mercado Pago: consulta de faturas](https://www.mercadopago.com.br/developers/pt/reference/online-payments/subscriptions/authorized-payment-search/get)
- [Anvisa: software como dispositivo médico](https://www.gov.br/anvisa/pt-br/assuntos/noticias-anvisa/2022/software-como-dispositivo-medico-perguntas-e-respostas)
- [CFM: documentos médicos eletrônicos](https://sistemas.cfm.org.br/normas/arquivos/resolucoes/BR/2021/2299_2021.pdf)

## Abas ambulatorial e hospitalar

- Ambulatorial: acompanhamento/retorno, medicamentos e orientações ao paciente.
- Hospitalar: unidade, admissão/evolução, dieta, dispositivos/suporte e balanço hídrico. O rascunho separa medicamentos de cuidados da internação e inclui preparo/diluição, tempo/velocidade de infusão e monitorização quando aplicáveis.
- Fichas independentes mantidas apenas na memória da página. Trocar de aba preserva os campos, remove o resultado anterior e exige nova análise e confirmação. Sair da conta limpa ambas; recarregar a página também as limpa.
- O servidor exige o contexto correspondente, descarta campos do outro contexto e rejeita resultados com contexto diferente ou misturado. Ordens hospitalares, orientações e medicamentos são suprimidos se a resposta indicar pendências essenciais, urgência ou emergência. Esta primeira versão não é um gerador de ordens de emergência.
- Testes adicionais verificam os campos obrigatórios por contexto e a rejeição de respostas cruzadas. A separação visual e a preservação das fichas foram verificadas no navegador.
- Referência para a estrutura dos campos (não validação clínica do produto): [Protocolo de segurança na prescrição, uso e administração de medicamentos — Anvisa](https://www.gov.br/anvisa/pt-br/centraisdeconteudo/publicacoes/servicosdesaude/publicacoes/protocolo-de-seguranca-na-prescricao-uso-e-administracao-de-medicamentos).

Próxima etapa de integração: aplicar a migração Plus no Supabase, habilitar os redirecionamentos de autenticação e disponibilizar uma prévia com servidor para testar o login já existente. Depois, configurar a IA e homologar casos fictícios nos dois contextos. As abas não ativam automaticamente a IA nem as cobranças.

## Atualização de integração — 19/09/2026

O aplicativo agora está publicado em `/plus.html` no domínio publicado. A migração foi aplicada e o retorno /plus.html autorizado no Supabase. Login com a sessão existente do titular foi verificado na tela Minha conta. As observações anteriores sobre ausência de publicação e migração descrevem a entrega inicial e estão superadas. A prévia localhost continua demonstrativa; use o endereço online para login real.

Permanecem pendentes cadastro/validação profissional, configuração e homologação de IA, SMTP para cadastros públicos, pagamentos e requisitos clínicos/regulatórios. clinicalReady e billingReady foram verificados como false no serviço publicado.

## Perfis Aluno e Médico

Aplicar plus-roles.sql após plus.sql. Aluno dispensa CRM e recebe contexto educacional na análise, definido pelo perfil salvo no servidor. Médico requer CRM/UF e verificação. Alterar nome, CRM, UF ou tipo de perfil remove a verificação anterior; o início do teste nunca é sobrescrito. As tabelas continuam privadas. IA e cobranças permanecem desativadas.

## Limite do teste gratuito

Aplicar `plus-trial-limit.sql` após as migrações anteriores. O teste termina após 120 horas ou 25 análises, o que ocorrer primeiro. O contador é compartilhado entre os contextos hospitalar e ambulatorial e não é reiniciado ao editar o perfil. Reservas são atômicas no banco; erros detectados na IA ou validação geram devolução idempotente. Uma interrupção abrupta da função pode deixar uma reserva pendente, exigindo conciliação pelo identificador operacional. Não são armazenados dados clínicos. A assinatura paga não consome esse saldo.

A IA e as cobranças permanecem desativadas. A conexão da OpenAI retornou HTTP 429 na última verificação; a ativação continua pendente de conexão válida e autorização de envio.

## Administrador Plus

Aplicar `plus-admin.sql`. A associação em `plus_admins` é mantida exclusivamente pelo servidor/console confiável e usa o identificador da conta, com e-mail confirmado. Contas associadas recebem acesso sem assinatura, sem vencimento e sem cota de teste; o checkout bloqueia novas compras para elas. O intervalo de 30 segundos e a elegibilidade do perfil clínico continuam valendo. Essa permissão não concede administração da loja nem verificação de CRM. O uso da API continua sendo cobrado pelo provedor.

## Análise com dados parciais

Queixa e consentimento são obrigatórios; campos clínicos vazios viram Desconhecido no servidor. A análise inclui exame físico dirigido, próximos passos e prazo condicionado de retorno/reavaliação. Opções medicamentosas para discussão são separadas do rascunho e não incluem posologia. Dados essenciais ausentes continuam impedindo prescrição completa; planos de avaliação permanecem visíveis e copiáveis. Urgência/emergência remove opções medicamentosas. Essa alteração não representa validação clínica dos resultados.
