import app from './app.js';

// 3100 par défaut : 3000 déjà utilisé par l'app "dnd" (PM2) sur le Pi.
const PORT = process.env.PORT || 3100;
const HOST = process.env.HOST || '127.0.0.1';
const server = app.listen(PORT, HOST, () => {
  console.log(`Serveur RSVP actif : http://${HOST}:${PORT}`);
});

function gracefulShutdown(signal) {
  console.log(`Signal ${signal} reçu. Arrêt en cours...`);
  server.close(() => {
    console.log('Serveur fermé.');
    process.exit(0);
  });
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

export default server;
