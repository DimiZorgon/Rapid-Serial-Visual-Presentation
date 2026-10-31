// Configuration PM2 - Raspberry Pi 3B (cohabite avec l'app "dnd" sur le port 3000).
// Démarrage : pm2 start ecosystem.config.cjs && pm2 save
module.exports = {
  apps: [
    {
      name: 'rapide-lecture',
      script: 'server/index.js',
      cwd: __dirname,
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      // Pi 3B = 1 Go de RAM : on borne la mémoire du processus.
      node_args: '--max-old-space-size=192',
      max_memory_restart: '220M',
      env: {
        NODE_ENV: 'production',
        HOST: '127.0.0.1',
        PORT: 3100,
        SITE_URL: 'https://rapide-lecture.noullez.com',
      },
    },
  ],
};
