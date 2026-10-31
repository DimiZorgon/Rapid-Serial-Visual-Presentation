# Déploiement – Raspberry Pi (site statique, comme maze / cube)

L'application est **100 % statique** : lecture EPUB/texte, moteur RSVP et
stockage se font dans le navigateur. Aucun process Node/PM2 en production.

| Élément | Valeur |
|---|---|
| Dossier | `/mnt/shared_nas/rapide-lecture` |
| Racine servie | `/mnt/shared_nas/rapide-lecture/dist` |
| Nginx | bloc dans `/etc/nginx/sites-available/static-sites`, `listen 8085` |
| Cloudflare | `rapide-lecture.noullez.com` → `http://localhost:8085` |

## 1. Build (sur le PC)

```bash
npm install
npm run build        # génère dist/ (index.html, assets/, robots.txt, sitemap.xml…)
```

## 2. Copier sur le NAS

Copier le dossier `dist/` dans `/mnt/shared_nas/rapide-lecture/dist`.

Vérification : `ls -la /mnt/shared_nas/rapide-lecture/dist/` affiche `index.html`.

## 3. Nginx

Ajouter le bloc [`deploy/nginx-rapide-lecture.conf`](deploy/nginx-rapide-lecture.conf)
à la fin de `/etc/nginx/sites-available/static-sites` :

```bash
sudo nano /etc/nginx/sites-available/static-sites
sudo nginx -t
sudo systemctl reload nginx
```

## 4. Cloudflare

Route déjà créée : `rapide-lecture` / `noullez.com` → `http://localhost:8085`.
Tester https://rapide-lecture.noullez.com, `/robots.txt`, `/sitemap.xml`.

## Mise à jour

`npm run build` sur le PC puis remplacer `dist/` sur le NAS. Pas de reload nginx nécessaire.

## Développement local

- `npm run dev` : serveur Vite avec rechargement.
- `npm start` : serveur Express optionnel (sert `dist/` avec Helmet), utile pour tests uniquement.
