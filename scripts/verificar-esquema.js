const { Client } = require('pg');

const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

(async () => {
  await client.connect();

  const tablas = await client.query(`
    select tablename, rowsecurity
    from pg_tables
    where schemaname = 'public'
    order by tablename;
  `);
  console.log('--- Tablas en public ---');
  console.table(tablas.rows);

  const politicas = await client.query(`
    select tablename, policyname, cmd
    from pg_policies
    where schemaname = 'public'
    order by tablename;
  `);
  console.log('--- Políticas RLS ---');
  console.table(politicas.rows);

  const realtime = await client.query(`
    select schemaname, tablename
    from pg_publication_tables
    where pubname = 'supabase_realtime';
  `);
  console.log('--- Tablas en la publicación supabase_realtime ---');
  console.table(realtime.rows);

  await client.end();
})().catch((err) => {
  console.error('ERROR:', err.message);
  process.exitCode = 1;
});
