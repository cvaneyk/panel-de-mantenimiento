import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

async function main() {
  console.log("=== Ejecutar migración SQL en Supabase ===");
  console.log("Necesitas la URL de conexión a la base de datos (Transaction URL o Session URL) de Coolify.");
  console.log("Ejemplo: postgresql://postgres:tu_password@144.91.98.69:5432/postgres\n");

  const dbUrl = await question('Introduce tu Database URL: ');

  if (!dbUrl) {
    console.error("Error: La URL de la base de datos es obligatoria.");
    rl.close();
    return;
  }

  // Leer el archivo de migración
  // Por defecto, la migración inicial. Las siguientes se pasan como argumento:
  //   node scripts/migrar-db.mjs supabase/migrations/20260930100000_agent_inventory_and_screenshots.sql
  const isInitialMigration = !process.argv[2];
  const migrationPath = isInitialMigration
    ? path.join(process.cwd(), 'supabase', 'migrations', '20260815183447_initial_schema.sql')
    : path.resolve(process.argv[2]);
  let sql;
  try {
    sql = fs.readFileSync(migrationPath, 'utf8');
  } catch (err) {
    console.error(`Error al leer el archivo de migración en ${migrationPath}:`, err.message);
    rl.close();
    return;
  }

  console.log("\nConectando a la base de datos...");
  const client = new Client({
    connectionString: dbUrl,
  });

  try {
    await client.connect();
    console.log("✅ Conectado correctamente.");
    
    console.log("Ejecutando script SQL...");
    await client.query(sql);
    console.log(`✅ Migración aplicada: ${path.basename(migrationPath)}`);

    // Opcional: También inyectamos los datos semilla (seed.sql) para tener clientes falsos o lo dejamos vacío
    const seedAns = isInitialMigration
      ? await question('\n¿Quieres cargar los datos de prueba (seed.sql)? (s/n): ')
      : 'n';
    if (seedAns.toLowerCase() === 's') {
      const seedPath = path.join(process.cwd(), 'supabase', 'seed.sql');
      try {
        const seedSql = fs.readFileSync(seedPath, 'utf8');
        await client.query(seedSql);
        console.log("✅ Datos de prueba insertados.");
      } catch (err) {
        console.error(`Error al ejecutar seed.sql:`, err.message);
      }
    }
    
  } catch (err) {
    console.error("❌ Error al ejecutar el SQL:", err.message);
  } finally {
    await client.end();
    rl.close();
  }
}

main().catch(console.error);
