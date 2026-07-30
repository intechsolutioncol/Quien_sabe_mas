const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const archivo = process.argv[2];
if (!archivo) {
  console.error('Uso: node scripts/aplicar-migracion.js <ruta-al-sql>');
  process.exit(1);
}

const sql = fs.readFileSync(path.resolve(archivo), 'utf8');

const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

(async () => {
  try {
    await client.connect();
    console.log('Conectado. Ejecutando', archivo, '...');
    await client.query(sql);
    console.log('OK: migración aplicada sin errores.');
  } catch (err) {
    console.error('ERROR aplicando la migración:', err.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
})();
