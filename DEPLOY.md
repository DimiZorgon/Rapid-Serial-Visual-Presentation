# Déploiement – Raspberry Pi (site statique, comme maze / cube)

L'application est **100 % statique** : lecture EPUB/texte, moteur RSVP et
stockage se font dans le navigateur. Tout se gère depuis le Pi : clone, install, build.
Nginx sert directement le dossier `dist/` généré. Aucun process Node/PM2.

| Élément | Valeur |
|---|---|
| Dossier | `/mnt/shared_nas/rapide-lecture` |
| Racine servie | `/mnt/shared_nas/rapide-lecture/dist` |
| Nginx | bloc dans `/etc/nginx/sites-available/static-sites`, `listen 8085` |
| Cloudflare | `rapide-lecture.noullez.com` → `http://localhost:8085` |

## Prérequis

Node.js **20.19+ ou 22.12+** sur le Pi (`node -v`). Sinon :

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
```

## 1. Installation (sur le Pi)

```bash
cd /mnt/shared_nas
git clone https://github.com/DimiZorgon/Rapid-Serial-Visual-Presentation.git rapide-lecture
cd rapide-lecture
npm install
npm run build
```

Vérification : `ls /mnt/shared_nas/rapide-lecture/dist/` affiche `index.html`.

Le fichier `.npmrc` désactive les liens symboliques (`bin-links=false`) : l'install
fonctionne aussi sur un partage NAS.

## 2. Nginx

Ajouter le bloc [`deploy/nginx-rapide-lecture.conf`](deploy/nginx-rapide-lecture.conf)
à la fin de `static-sites` :

```bash
cat deploy/nginx-rapide-lecture.conf | sudo tee -a /etc/nginx/sites-available/static-sites
sudo nginx -t
sudo systemctl reload nginx
```

## 3. Cloudflare

Route : `rapide-lecture` / `noullez.com` → `http://localhost:8085`.
Tester https://rapide-lecture.noullez.com, `/robots.txt`, `/sitemap.xml`.

## Mise à jour

```bash
cd /mnt/shared_nas/rapide-lecture
npm run update       # git pull + npm install + build
```

Pas de reload nginx nécessaire.

## Dépannage

| Symptôme | Solution |
|---|---|
| `EBADENGINE` à l'install | Node trop ancien → installer Node 22 (voir Prérequis) |
| `Cannot find module @rolldown/binding-linux-arm…` | `rm -rf node_modules package-lock.json && npm install` |
| 404 / mauvais site | `server_name` et `root` exacts dans nginx, puis `sudo nginx -t` |

## Développement local (PC)

- `npm run dev` : serveur Vite avec rechargement.
- `npm start` : serveur Express optionnel (tests uniquement, inutile en production).
