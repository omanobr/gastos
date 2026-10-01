# Gastos do Cartão

App para os dois acompanharem os gastos do cartão no celular: resumo por titular e categoria, gráficos de pizza por categoria (com filtro e divisão entre titulares), extrato para classificar os lançamentos, parcelas a vencer, cobranças que se repetem e as análises que o Claude escreve a cada fatura.

Os dados ficam numa planilha do Google Sheets no seu Drive (o "banco"). O app não tem servidor: ele roda no navegador, entra com a conta Google de cada um e lê e grava direto na planilha. O site publicado não contém nenhum dado financeiro.

## O que tem nesta pasta

| Arquivo | Para que serve |
|---|---|
| `index.html`, `styles.css`, `app.js` | A interface |
| `store.js` | Leitura e gravação na planilha pela API do Google Sheets |
| `config.js` | Onde entra o ID do cliente OAuth (passo 1) |
| `manifest.webmanifest`, `sw.js`, `icons/` | O que permite instalar como app no Android |
| `.nojekyll` | Faz o GitHub Pages publicar a pasta sem alterar nada |

## 1. Credencial no Google Cloud (uma vez, uns 15 minutos)

Faça com a conta que vai ser a dona da planilha.

1. Abra console.cloud.google.com e crie um projeto chamado "Gastos do Cartão".
2. Em **APIs e serviços > Biblioteca**, procure **Google Sheets API** e clique em **Ativar**.
3. Abra **Google Auth Platform** e clique em **Começar**. Preencha o nome do app ("Gastos do Cartão"), o e-mail de suporte, escolha o público **Externo** e informe o e-mail de contato.
4. Em **Acesso a dados** (Data Access), adicione os escopos `.../auth/spreadsheets` e `.../auth/userinfo.email`.
5. Em **Público-alvo** (Audience), adicione os e-mails de vocês dois como usuários de teste.
6. **Não publique o app.** Deixe o status em **Teste**, com vocês dois como usuários de teste. Para publicar, o Google pede página inicial, política de privacidade e domínio, o que não se aplica a um app de uso pessoal. Os campos de domínio da tela **Branding** podem ficar em branco. O único efeito de ficar em teste: o Google derruba a autorização sete dias depois de cada consentimento, e no login seguinte mostra de novo o aviso de app em teste e a tela de permissão. É só confirmar e marcar a permissão de planilhas.
7. Em **Clientes** (Clients), clique em **Criar cliente**, escolha **Aplicativo da Web** e, em **Origens JavaScript autorizadas**, coloque o endereço onde o app vai ficar (passo 2), só a origem, sem caminho e sem barra no final. Exemplo: `https://seuusuario.github.io`.
8. Copie o **ID do cliente** (termina em `.apps.googleusercontent.com`) e cole em `config.js`, no lugar de `COLE_AQUI_O_ID_DO_CLIENTE...`.

O ID do cliente não é segredo: ele só funciona nas origens que você autorizou e só dá acesso ao que cada pessoa aceitar no login.

## 2. Publicar o app

O app precisa de um endereço `https://`. O caminho mais simples e gratuito é o GitHub Pages:

1. Crie um repositório (pode ser público, porque não há dados nos arquivos).
2. Em **Add file > Upload files**, envie todo o conteúdo desta pasta, incluindo `.nojekyll`.
3. Em **Settings > Pages**, escolha **Deploy from a branch**, branch `main`, pasta `/ (root)`, e salve.
4. O endereço fica `https://seuusuario.github.io/nome-do-repositorio/`. A origem autorizada no passo 1.7 é só `https://seuusuario.github.io`.

Alternativas: Netlify (arrastar a pasta em app.netlify.com/drop) ou Railway (como site estático). Em qualquer uma, a origem do endereço final precisa estar nas Origens JavaScript autorizadas.

## 3. Primeiro uso

1. **Felipe:** abra o endereço no Chrome do celular e toque em **Entrar com Google**. O Google mostra um aviso de app em teste: confirme e, na tela de permissão, marque a caixa de acesso às planilhas. Depois toque em **Criar o banco no meu Google Drive**. Em seguida, **Menu > Importar arquivo do Claude** e escolha `dados-iniciais.json`.
2. No Google Drive, compartilhe a planilha **Gastos do Cartão (banco do app)** com a conta Google da sua esposa, como **Editor**.
3. **Ela:** abre o mesmo endereço, entra com a conta dela e cola o link da planilha em **Colar o link da planilha já criada**.
4. Para ninguém precisar colar o link, coloque a planilha em `config.js`, no campo `SPREADSHEET_ID`, e publique de novo. Pode ser o link inteiro ou só o ID, que é o trecho entre `/d/` e `/edit` no endereço.
5. **Instalar:** no Chrome, menu **⋮ > Instalar app** (ou **Adicionar à tela inicial**). O app ganha ícone e abre em tela cheia.

Depois de importar, apague o `dados-iniciais.json` do celular: ele contém os lançamentos.

## 4. APK (opcional)

Se quiser um arquivo `.apk` em vez de instalar pelo Chrome: abra pwabuilder.com, cole o endereço do app, gere o pacote **Android** e instale o `.apk` nos dois celulares (o Android vai pedir para permitir a instalação de fontes desconhecidas). Para abrir sem a barra de endereço, publique na pasta `.well-known` do site o arquivo `assetlinks.json` que o PWABuilder entrega junto.

## 5. Todo mês

1. Mande o PDF da fatura nova para o Claude e peça o arquivo de importação. Ele extrai os lançamentos, confere os totais com a fatura, sugere as categorias e escreve dois textos para **Mais > Análises**: o resumo do mês e a análise financeira (o que foi conferido, o que vocês precisam confirmar, onde dá para economizar, parcelas já contratadas e uma simulação de cortes).
2. No app: **Menu > Importar arquivo do Claude**. Lançamentos que já estão no banco são ignorados, e as regras que vocês criaram no app ("Mover os N e os próximos") têm prioridade sobre a sugestão do arquivo.
3. Se o conector **Google Sheets** estiver ligado na conversa com o Claude, ele pode gravar a fatura direto na planilha, sem arquivo.

## Grupos de categorias

Cada categoria pertence a um grupo (a categoria mãe), por exemplo Alimentação reúne restaurantes, mercado, lanches e delivery. Os gráficos mostram a pizza por grupo e, ao tocar num grupo, o que tem dentro. Para mudar o grupo de uma categoria, criar um grupo ou renomear um grupo: **Menu > Categorias**. Categoria sem grupo aparece sozinha no gráfico.

## Estrutura da planilha

| Aba | Conteúdo |
|---|---|
| `lancamentos` | Um lançamento por linha. A coluna `categoria` guarda o código da categoria |
| `categorias` | Código, nome, se está ativa e o grupo (categoria mãe). Excluir no app só desativa. Grupo em branco usa o padrão do app |
| `faturas` | Vencimento, fechamento, total e parcelas a vencer de cada fatura |
| `cartoes` | Final do cartão e titular |
| `regras` | Estabelecimento e a categoria que ele recebe nas próximas importações |
| `analises` | Textos do Claude, por fatura |

Pode consultar e filtrar à vontade na planilha. Evite renomear abas ou colunas; se apagar linhas de `lancamentos`, o app avisa na próxima gravação e pede para atualizar.

## Segurança

- O acesso aos dados depende da planilha: só entra quem ela estiver compartilhada.
- Para revogar o acesso do app numa conta: myaccount.google.com > Segurança > Apps de terceiros.
- O login fica guardado no celular por no máximo uma hora; depois disso o app pede para entrar de novo com um toque.
