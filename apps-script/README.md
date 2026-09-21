# CND Docente — Google Apps Script

Esta pasta é a versão migrada do CND Docente para Google Apps Script, Google Sheets e Google Drive.

## Arquitetura

- **Apps Script**: backend + web app.
- **Google Sheets**: banco de dados.
- **Google Drive**: armazenamento privado dos diplomas/certificados.
- **HTML Service + google.script.run**: interface web responsiva.
- PIN do candidato: **exatamente 4 números**, conforme definido para o simulador.
- Fluxo: cadastro → documentos → aprovação → habilitação → exame → resultado → CND → consulta pública.

## Instalação

1. Crie um projeto em Google Apps Script.
2. Crie os arquivos `Code.gs` e `Index.html`.
3. Cole os conteúdos desta pasta.
4. Execute `setup()` uma vez no editor e autorize o projeto.
5. Execute `setupAdmin("Administrador","SEU_PIN_4_DIGITOS")` uma vez para criar o acesso administrativo.
6. Vá em **Implantar → Nova implantação → Aplicativo da Web**.
7. Execute como **você** e permita acesso **qualquer pessoa**.
8. Abra a URL da implantação.

O Apps Script precisa de `doGet()` para servir uma web app, e a comunicação da página com as funções do servidor usa `google.script.run`.

## Observação

A versão foi desenhada para o universo do simulador. Para uma operação pública em escala real, recomenda-se acrescentar políticas de retenção, proteção contra tentativas automatizadas de PIN, gestão de usuários administrativos e revisão de permissões do Drive.
