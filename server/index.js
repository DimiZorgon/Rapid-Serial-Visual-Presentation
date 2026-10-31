import app from './app.js';

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`Serveur RSVP actif : http://localhost:${PORT}`);
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
