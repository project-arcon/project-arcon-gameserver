# ProjectArconServer

## Install

### 1. Install missing dependencies

```text
npm install .
```

### 2. Edit `config_auth.json`
- `name` is the name of the server.
- `email` is the account name of the server account.
- `token` is the hashed password of the server account.
- `edited` should set to true or remove.

### 3. Edit `config_network.json`
- `addr` is the public address of the server, either a domin or an ip.
- `port` is the port that the server will running on.
- `root_addr` is the address of the root server or proxy, in would look like `ws://address:port/server`

### 4. Register your server account

```text
node register.js
```

It will print `Regist successes.` to log once the account is registed.

### 5. Run the server

```text
npm start
```
