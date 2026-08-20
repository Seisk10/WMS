import db from './src/database/connection';
import bcrypt from 'bcrypt'; // O pacote que o backend usa para segurança

async function createAdmin() {
  try {
    await db('users').delete();

    // Gera o hash seguro da senha 'admin123'
    const saltRounds = 10;
    const securePassword = await bcrypt.hash('admin123', saltRounds);

    // Insere o Gerente com a senha criptografada que o backend espera
    await db('users').insert({
      username: 'admin',
      password_hash: securePassword, // Mude para 'password' se sua coluna chamar assim
      role: 'ADMIN'
    });

    console.log("✅ GERENTE CRIADO COM HASH SEGURO!");
  } catch (error) {
    console.error("❌ Erro:", error);
  }
  process.exit(0);
}

createAdmin();