# Order Manager Pro

Gerenciador de pedidos local. Todos os dados ficam salvos em disco na própria pasta do app — sem servidor externo, sem nuvem, sem instalação.

---

## Como abrir

Dê duplo clique em **`Iniciar.vbs`**.

O script inicia um servidor local em segundo plano (sem janela visível) e abre o app no browser em `http://localhost:8080`. Funciona com **qualquer browser** (Chrome, Firefox, Edge, etc.).

> Se abrir o `index.html` diretamente, um banner amarelo aparece avisando que o servidor não está ativo e os dados não serão salvos.

---

## Estrutura de arquivos

```
Order Manager Pro/
├── index.html      ← Interface do app
├── app.js          ← Lógica da aplicação
├── app.css         ← Estilos
├── server.ps1      ← Servidor HTTP local (PowerShell)
├── Iniciar.vbs     ← Lançador — duplo clique para abrir o app
├── README.md       ← Esta documentação
└── data/           ← Criada automaticamente na primeira abertura
    ├── orders.json     ← Todos os pedidos
    └── files/          ← Arquivos anexados aos pedidos
```

A pasta `data/` é criada automaticamente pelo servidor na primeira vez que o app é aberto. Não é necessário criar nada manualmente.

---

## Como funciona

O `Iniciar.vbs` executa o `server.ps1` em segundo plano via PowerShell. O servidor:

- Serve os arquivos estáticos (`index.html`, `app.js`, `app.css`) em `localhost:8080`
- Expõe uma API REST local para leitura e escrita dos dados em disco
- Se já estiver rodando (ex: clicou no VBS duas vezes), detecta a porta ocupada e encerra silenciosamente — o browser abre normalmente

O servidor para automaticamente quando o computador é reiniciado. Para parar manualmente, encerre o processo `powershell.exe` pelo Gerenciador de Tarefas.

---

## API REST local

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/api/orders` | Retorna todos os pedidos (`orders.json`) |
| `POST` | `/api/orders` | Salva a lista completa de pedidos |
| `GET` | `/api/files/:fname` | Download de um arquivo anexado |
| `POST` | `/api/files/:fname` | Upload de um arquivo |
| `DELETE` | `/api/files/:fname` | Remove um arquivo |
| `DELETE` | `/api/files` | Remove todos os arquivos |

---

## Funcionalidades

| Ação | Como |
|---|---|
| Novo pedido | Botão **Novo Pedido** |
| Salvar formulário | Botão **Salvar** ou `Ctrl+Enter` |
| Fechar drawer | `Esc` |
| Avançar status | Clique no pill de status na tabela |
| Copiar PO / SO | Clique no número na tabela |
| Download de arquivo | Clique no badge verde de arquivos |
| Seleção múltipla | Checkboxes na tabela |
| Alterar status em lote | Selecione pedidos → barra inferior |
| Apagar em lote | Selecione pedidos → **Apagar selecionados** |
| Desfazer exclusão | Botão **Desfazer** no toast (5 segundos) |
| Exportar backup JSON | Botão **Backup** (inclui arquivos em base64) |
| Exportar CSV | Botão **CSV** |
| Restaurar backup | Botão **Restaurar** → selecione o `.json` exportado |
| Filtrar por status | Abas ou cards de estatísticas |
| Filtrar por data | Campos "De / Até" na toolbar |
| Buscar | Campo de busca no header |
| Ordenar colunas | Clique nos cabeçalhos da tabela |

---

## Formato do orders.json

```json
[
  {
    "id": "uuid",
    "po": "4500123",
    "so": "800567",
    "rep": "Nome do Rep",
    "content": "Observações do pedido",
    "status": "pending | progress | done",
    "dueDate": "2026-07-15",
    "files": [
      {
        "id": "file_uuid",
        "name": "nome-original.pdf",
        "fname": "file_uuid__nome-original.pdf"
      }
    ],
    "createdAt": "2026-06-25T14:00:00.000Z",
    "updatedAt": "2026-06-25T14:00:00.000Z"
  }
]
```

---

## Backup e migração

- **Backup:** botão **Backup** gera um `.json` com todos os pedidos e arquivos embutidos em base64 — pode ser guardado em qualquer lugar
- **Restaurar:** botão **Restaurar** reimporta o `.json` de backup, recriando pedidos e arquivos
- **Migrar para outra máquina:** copie a pasta `Order Manager Pro/` inteira (incluindo `data/`) para o novo computador e abra o `Iniciar.vbs`

---

## Requisitos

- Windows 10 ou 11 (PowerShell já incluso)
- Qualquer browser moderno
