# Order Manager Pro

Gerenciador de pedidos local. Todos os dados ficam salvos em uma pasta do seu HD — sem servidor, sem nuvem.

---

## Estrutura de arquivos

```
Order Manager Pro/
├── index.html      ← Abre no browser
├── app.js          ← Toda a lógica da aplicação
├── app.css         ← Estilos
└── README.md       ← Este arquivo
```

A pasta de dados (escolhida por você na primeira abertura) terá esta estrutura:

```
Sua Pasta de Dados/
├── orders.json     ← Todos os pedidos em JSON legível
└── files/
    ├── file_uuid__documento.pdf
    └── file_uuid__imagem.png
```

---

## Como usar

### Primeira abertura
1. Abra `index.html` no **Chrome** ou **Edge**
2. Um modal aparecerá pedindo para escolher uma pasta
3. Selecione ou crie uma pasta (ex: `Order Manager Data`) em qualquer lugar do seu HD
4. Clique em **Selecionar pasta** no diálogo do sistema

### Aberturas seguintes
- O browser pedirá uma confirmação rápida: **"Permitir acesso à pasta X?"**
- Clique em **Permitir** — isso é uma limitação de segurança do browser, não tem como evitar

### Trocar a pasta
- Clique no badge com o nome da pasta no canto superior direito do header
- Escolha outra pasta (os dados da pasta antiga não são movidos automaticamente)

---

## Funcionalidades

| Ação | Como |
|---|---|
| Novo pedido | Botão **Novo Pedido** ou `Ctrl+N` |
| Salvar formulário | Botão **Salvar** ou `Ctrl+Enter` |
| Fechar drawer | `Esc` |
| Avançar status | Clique no pill de status na tabela |
| Copiar PO/SO | Clique no número (PO ou SO) na tabela |
| Download de arquivo | Clique no badge verde de arquivos |
| Seleção múltipla | Checkboxes na tabela |
| Alterar status em lote | Selecione pedidos → barra inferior |
| Exportar backup JSON | Botão **Backup** (inclui arquivos em base64) |
| Exportar CSV | Botão **CSV** |
| Restaurar backup | Botão **Restaurar** → selecione o `.json` exportado |
| Filtrar por status | Abas no topo da tabela ou cards de estatísticas |
| Filtrar por data | Campos "De / Até" na toolbar |
| Buscar | Campo de busca no header (PO, SO, rep, conteúdo, arquivos) |
| Ordenar | Clique nos cabeçalhos de coluna |

---

## Compatibilidade

| Browser | Suporte |
|---|---|
| Chrome 86+ | ✅ Completo |
| Edge 86+ | ✅ Completo |
| Firefox | ❌ Não suporta File System Access API |
| Safari | ❌ Não suporta File System Access API |

> **Nota:** O app precisa ser aberto via `index.html` no browser, não pode ser servido de `file://` para alguns recursos funcionarem. Se tiver problemas, arraste o arquivo para o browser ou use um servidor local simples.

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

- O botão **Backup** gera um `.json` com todos os pedidos **e** arquivos embutidos em base64
- Para migrar para outra máquina: copie a pasta de dados **e** o `Order Manager Pro/` inteiro, abra o `index.html` e escolha a mesma pasta
- Ou use **Restaurar** com o arquivo de backup para recriar tudo do zero
