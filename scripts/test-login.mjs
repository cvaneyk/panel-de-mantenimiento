import { createClient } from '@supabase/supabase-js';
import * as readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

async function main() {
  console.log("=== Test de Login ===");

  const supabaseUrl = await question('Introduce tu SUPABASE URL pública: ');
  const anonKey = await question('Introduce tu SUPABASE ANON KEY: ');
  const email = await question('Email: ');
  const password = await question('Contraseña: ');

  if (!supabaseUrl || !anonKey || !email || !password) {
    console.error("Todos los campos son obligatorios.");
    rl.close();
    return;
  }

  const supabase = createClient(supabaseUrl, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  console.log("\nIntentando iniciar sesión...");
  
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    console.error("\n❌ Error detallado de Supabase:");
    console.error(error.message);
    console.error("Código:", error.status);
    console.error("Nombre:", error.name);
  } else {
    console.log("\n✅ ¡Login exitoso por consola!");
    console.log("Usuario ID:", data.user?.id);
    console.log("Si aquí funciona pero en la web no, el problema son las variables de entorno en Coolify.");
  }

  rl.close();
}

main().catch(console.error);
