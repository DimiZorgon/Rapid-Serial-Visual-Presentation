# Déploiement – Raspberry Pi 3B (PM2 + Nginx 8085 + Cloudflare Tunnel)

Adapté à l'infra existante :

| Élément | Valeur |
|---|---|
| Dossier projet | `/mnt/shared_nas/rapide-lecture` |
| Process Node (PM2) | `rapide-lecture` → `127.0.0.1:3100` (3000 = `dnd`) |
| Nginx | bloc `server` dans `/etc/nginx/sites-available/static-sites`, `listen 8085` |
| Cloudflare | `rapide-lecture.noullez.com` → `http://localhost:8085` (déjà fait) |

> Contrairement à maze/cube/portfolio, ce site n'est **pas purement statique** :
> l'import EPUB passe par l'API Node (`/api/parse`). Nginx fait donc proxy vers
> Node (port 3100) et sert seulement `/assets/` directement depuis le NAS.

## Prérequis

- Node.js **≥ 20.19** (requis par Vite 8 pour le build) : `node -v`
- PM2 déjà installé (`pm2 status`).

## 1. Copier le projet sur le NAS

Depuis le PC (sans `node_modules/` ni `dist/`), ou via git :

```bash
cd /mnt/shared_nas
git clone <url-du-repo> rapide-lecture
cd rapide-lecture
```

## 2. Installer et compiler

```bash
cd /mnt/shared_nas/rapide-lecture
npm ci
npm run build          # génère dist/
```

En cas d'erreur de symlinks (`EPERM symlink`, fréquent sur partage SMB/CIFS) :

```bash
npm ci --no-bin-links
node node_modules/vite/bin/vite.js build
```

Build trop lent / mémoire insuffisante sur le Pi 3B ? Compiler sur le PC
(`npm run build`) puis copier le dossier `dist/` dans
`/mnt/shared_nas/rapide-lecture/dist`, et sur le Pi faire seulement `npm ci --omit=dev`.

## 3. Lancer avec PM2

```bash
pm2 start ecosystem.config.cjs
pm2 save
pm2 status             # rapide-lecture doit être "online"
curl -I http://127.0.0.1:3100   # HTTP/1.1 200 OK
```

## 4. Déclarer le site dans Nginx

Ajouter le contenu de [`deploy/nginx-rapide-lecture.conf`](deploy/nginx-rapide-lecture.conf)
à la fin de `/etc/nginx/sites-available/static-sites` :

```bash
cat /mnt/shared_nas/rapide-lecture/deploy/nginx-rapide-lecture.conf | sudo tee -a /etc/nginx/sites-available/static-sites
sudo nginx -t
sudo systemctl reload nginx
curl -I -H "Host: rapide-lecture.noullez.com" http://127.0.0.1:8085   # 200
```

## 5. Cloudflare

Route déjà créée : `rapide-lecture.noullez.com` → `http://localhost:8085`.
Tester https://rapide-lecture.noullez.com, puis `/robots.txt` et `/sitemap.xml`.

## Mise à jour

```bash
cd /mnt/shared_nas/rapide-lecture
git pull
npm run deploy         # npm ci + build + pm2 restart
```

## Dépannage

| Symptôme | Commande |
|---|---|
| 502 Bad Gateway | `pm2 logs rapide-lecture` (Node arrêté ?) |
| Mauvais site affiché | `server_name` exact dans Nginx + `sudo nginx -t` |
| 413 à l'upload | `client_max_body_size 30M` présent dans le bloc |
| Port déjà pris | changer `PORT` dans `ecosystem.config.cjs` **et** `proxy_pass` Nginx |
