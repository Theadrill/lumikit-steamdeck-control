# 📖 Instruções de Configuração e Push via SSH no SteamOS

Este guia ensina como configurar o Git no **SteamOS (Steam Deck)** usando chaves **SSH** de forma segura, sem expor tokens ou dados sensíveis em repositórios públicos.

---

## 🔒 Por que usar SSH no SteamOS?

1. **Persistência:** Fica salvo no diretório `/home/deck/.ssh/` (área do usuário), sobrevivendo a todas as atualizações de sistema do SteamOS.
2. **Segurança:** Não requer tokens OAuth com escopos complexos nem senhas digitadas no terminal.
3. **Sem 403:** Evita problemas de permissão causados por Fine-Grained Tokens do GitHub.

---

## 🚀 Passo a Passo: Primeira Vez em um SteamOS Novo

### 1. Configurar Identidade do Git
Abra o **Konsole** (Modo Desktop) e defina seu nome e e-mail:

```bash
git config --global user.name "Seu Nome"
git config --global user.email "seu-email@exemplo.com"
```

---

### 2. Gerar uma Nova Chave SSH
Crie um par de chaves usando o algoritmo moderno `ed25519`:

```bash
mkdir -p ~/.ssh && chmod 700 ~/.ssh
ssh-keygen -t ed25519 -C "seu-email@exemplo.com" -f ~/.ssh/id_ed25519 -N ""
```

---

### 3. Copiar a Chave Pública
Exiba a chave pública gerada para copiar:

```bash
cat ~/.ssh/id_ed25519.pub
```

> ⚠️ **IMPORTANTE:** A chave pública (`.pub`) é a **única** que você compartilha com o GitHub. **Nunca compartilhe ou envie a chave privada (`id_ed25519` sem o `.pub`).**

---

### 4. Cadastrar a Chave no GitHub
1. Acesse no navegador: [github.com/settings/ssh/new](https://github.com/settings/ssh/new)
2. Em **Title**, digite um nome para identificar o dispositivo (ex: `Steam Deck`).
3. Em **Key type**, mantenha `Authentication Key`.
4. No campo **Key**, cole o conteúdo exibido pelo comando `cat` acima.
5. Clique em **Add SSH key**.

---

### 5. Testar a Conexão
Verifique se a autenticação com o GitHub está funcionando:

```bash
ssh -T git@github.com
```

Se aparecer a mensagem:
> `Hi <usuario>! You've successfully authenticated, but GitHub does not provide shell access.`

Está tudo pronto! ✅

---

## 📤 Como Fazer Push no Repositório

### Se o repositório já existe no Steam Deck:
Garanta que a URL remota está usando o formato **SSH** (`git@github.com:...`):

```bash
# Entrar na pasta do projeto
cd /caminho/do/projeto

# Definir a URL remota para SSH
git remote set-url origin git@github.com:USUARIO/REPOSITORIO.git

# Fazer commit das alterações
git add .
git commit -m "sua mensagem de commit"

# Enviar para o GitHub
git push -u origin main
```

---

### Se for clonar um repositório novo:
Sempre clone utilizando a URL **SSH**:

```bash
git clone git@github.com:USUARIO/REPOSITORIO.git
```
