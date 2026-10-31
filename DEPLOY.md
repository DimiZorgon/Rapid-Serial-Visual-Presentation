# Guide de Déploiement — Raspberry Pi (ARM64) + Nginx + Cloudflared

Ce document détaille l'installation et le déploiement en production de **Liseuse Rapide RSVP** sur Raspberry Pi (architecture ARM64 / Linux), derrière un reverse-proxy Nginx et un tunnel Cloudflared.

---

## 1. Prérequis & Compatibilité ARM Pure-JS

- **Architecture** : Raspberry Pi OS 64-bit (aarch64 / arm64) ou Ubuntu Server ARM64.
- **Node.js** : `>= 18.0.0` (testé et validé sur Node.js 18, 20 et 24).
- **Compatibilité 100% Pure JavaScript** : Toutes les dépendances de production (`express`, `helmet`, `multer`, `jszip`, `cheerio`, `dompurify`) sont en JavaScript pur. Aucune compilation native C/C++ (`node-gyp`, `python`, `build-essential`) n'est requise lors de l'installation, garantissant une installation instantanée et sans erreur sur ARM.

---

## 2. Installation & Démarrage

```bash
# 1. Cloner le dépôt
git clone https://github.com/votre-compte/rapid-serial-visual-presentation.git
cd rapid-serial-visual-presentation

# 2. Configurer les variables d'environnement
cp .env.example .env

# 3. Installer les dépendances
npm install

# 4. Compiler le frontend avec Vite & Tailwind CSS (vers dist/)
npm run build

# 5. Démarrer l'application
npm start
```

Par défaut, le serveur écoute localement sur `http://127.0.0.1:3000`.

---

## 3. Configuration Nginx (Reverse Proxy)

Créer le fichier `/etc/nginx/sites-available/rapide-lecture.noullez.com` :

```nginx
server {
    listen 80;
    server_name rapide-lecture.noullez.com;

    # Taille maximale des fichiers EPUB / texte autorisés
    client_max_body_size 30M;

    # Compression gzip pour les assets
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;

        # En-têtes pour WebSockets et proxying
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';

        # En-têtes pour conserver l'IP réelle et le schéma HTTPS Cloudflare
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Timeouts pour uploads volumineux
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
```

Activer le site et recharger Nginx :
```bash
sudo ln -s /etc/nginx/sites-available/rapide-lecture.noullez.com /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## 4. Configuration Cloudflared (Tunnel Cloudflare)

Dans votre configuration Cloudflared (`/etc/cloudflared/config.yml`) :

```yaml
tunnel: <VOTRE_TUNNEL_UUID>
credentials-file: /etc/cloudflared/<VOTRE_TUNNEL_UUID>.json

ingress:
  - hostname: rapide-lecture.noullez.com
    service: http://127.0.0.1:80
  - service: http_status:404
```

Redémarrer le service Cloudflared :
```bash
sudo systemctl restart cloudflared
```

---

## 5. Gestionnaire de Processus de Production

### Option A : Service systemd (`rsvp-reader.service`)

Créer le fichier `/etc/systemd/system/rsvp-reader.service` :

```ini
[Unit]
Description=Liseuse Rapide RSVP Node.js Web Application
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/rapid-serial-visual-presentation
ExecStart=/usr/bin/node server/index.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=HOST=127.0.0.1
Environment=SITE_URL=https://rapide-lecture.noullez.com

[Install]
WantedBy=multi-user.target
```

Activer et démarrer le service :
```bash
sudo systemctl daemon-reload
sudo systemctl enable rsvp-reader
sudo systemctl start rsvp-reader
sudo systemctl status rsvp-reader
```

### Option B : PM2

Si vous préférez utiliser PM2 :
```bash
npm install -g pm2
pm2 start server/index.js --name rsvp-reader --env production
pm2 save
pm2 startup
```
