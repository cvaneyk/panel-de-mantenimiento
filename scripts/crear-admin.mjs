import { createClient } from '@supabase/supabase-js';
import * as readline from 'readline';

// Configurar lectura desde la consola
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

async function main() {
  console.log("=== Crear usuario administrador en Supabase ===");
  console.log("Nota: Necesitarás las credenciales de PRODUCCIÓN (las que configuraste en Coolify) para crear el usuario allí.\n");

  const supabaseUrl = await question('Introduce tu SUPABASE URL: ');
  const serviceRoleKey = await question('Introduce tu SUPABASE SERVICE ROLE KEY: ');
  const email = await question('Email del nuevo admin: ');
  const password = await question('Contraseña del nuevo admin: ');
  const fullName = await question('Nombre completo (opcional): ');

  if (!supabaseUrl || !serviceRoleKey || !email || !password) {
    console.error("\nError: URL, Service Role Key, email y contraseña son obligatorios.");
    rl.close();
    return;
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  console.log("\nCreando usuario...");
  
  // 1. Crear el usuario en auth.users
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: email,
    password: password,
    email_confirm: true,
    user_metadata: { full_name: fullName }
  });

  if (authError) {
    console.error("❌ Error al crear usuario:", authError.message);
    rl.close();
    return;
  }

  const userId = authData.user.id;
  console.log(`✅ Usuario creado en auth.users (ID: ${userId})`);

  // 2. Darle permisos de admin (is_staff = true) en public.profiles
  // Nota: El trigger 'on_auth_user_created' de tu base de datos crea la fila 
  // automáticamente en 'profiles', así que aquí solo actualizamos el rol.
  console.log("Dando permisos de agencia (is_staff = true)...");
  
  // Esperar un segundo para asegurar que el trigger de BD ha terminado
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  const { error: profileError } = await supabase
    .from('profiles')
    .update({ is_staff: true })
    .eq('id', userId);

  if (profileError) {
    console.error("❌ Error al actualizar el perfil:", profileError.message);
  } else {
    console.log("✅ Permisos de agencia concedidos correctamente.");
    console.log("\n¡Ya puedes iniciar sesión en producción con este email y contraseña!");
  }

  rl.close();
}

main().catch(console.error);
