# Fluxos e Configurações do Chatbot (Blip)

Esta pasta armazena as versões exportadas do fluxo construído no **Blip Builder (Take Blip)** para o Assistente Virtual Acadêmico do IFMG Sabará.

## 📁 Arquivos

- **`fluxo_blip_2026-10-15.json`**: Versão do fluxo contendo:
  - Bloco de boas-vindas com identificação do aluno.
  - Seleção de curso (BSI, Automação, Administração, Logística, Processos Gerenciais) e ano de matrícula.
  - Integração HTTP com a API local RAG (`/agente`).
  - Tratamento de fora de escopo, instabilidade e finalização.
  - Pesquisa de satisfação NPS completa com registro de eventos.

## 🔄 Como restaurar ou importar no Blip

1. No portal do Blip, abra o chatbot.
2. Acesse o **Builder**.
3. No menu superior direito (três pontinhos), selecione **Configurações do Builder** > **Importar fluxo**.
4. Carregue o arquivo `.json` desejado.
